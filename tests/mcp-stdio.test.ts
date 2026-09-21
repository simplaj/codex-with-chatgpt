import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { cleanup, makeGitRepo, makeTmpDir, write } from "./helpers.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliEntry = path.join(projectRoot, "src/cli/index.ts");
let root: string;
let stateDir: string;
let client: Client | undefined;
const protocolErrors: Error[] = [];

function textOf(result: { content?: unknown }): string {
  return (result.content as { type: string; text: string }[])?.[0]?.text ?? "";
}

beforeAll(async () => {
  root = makeTmpDir("stdio workspace");
  stateDir = makeTmpDir("stdio-state");
  makeGitRepo(root);
  write(root, ".env", "API_KEY=stdio-secret\n");
  write(root, "src/index.ts", "export const answer = 43;\n");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", cliEntry, "mcp-stdio", "--workspace", root],
    cwd: projectRoot,
    env: { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), C2C_STATE_DIR: stateDir },
    stderr: "pipe",
  });
  // Any non-JSON logging on stdout is a protocol failure, even if the SDK
  // subsequently manages to parse an initialize response.
  client = new Client({ name: "stdio-test-client", version: "1.0.0" });
  client.onerror = (error) => protocolErrors.push(error);
  await client.connect(transport);
});

afterAll(async () => {
  await client?.close();
  if (root) cleanup(root);
  if (stateDir) cleanup(stateDir);
});

describe("MCP tools over the stdio CLI", () => {
  it("handshakes and exposes the same nine read-only tools without OAuth", async () => {
    const { tools } = await client!.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "execution_output", "execution_summary", "git_diff", "git_status",
      "list_directory", "read_file", "search_workspace", "test_status", "workspace_info",
    ]);
    const info = await client!.callTool({ name: "workspace_info", arguments: {} });
    expect(info.isError ?? false).toBe(false);
    expect(JSON.parse(textOf(info))).toMatchObject({ git: { isRepo: true, branch: "main" } });
    expect(protocolErrors).toEqual([]);
  });

  it("reads files and Git changes in the explicitly selected directory", async () => {
    const file = await client!.callTool({ name: "read_file", arguments: { path: "hello.txt" } });
    expect(file.isError ?? false).toBe(false);
    expect(JSON.parse(textOf(file)).content).toContain("Hello from Codex with ChatGPT!");
    const diff = await client!.callTool({ name: "git_diff", arguments: { mode: "unstaged" } });
    expect(diff.isError ?? false).toBe(false);
    expect(JSON.parse(textOf(diff)).diff).toContain("answer = 43");
    expect(protocolErrors).toEqual([]);
  });

  it("preserves sensitive-file and directory boundary restrictions", async () => {
    const sensitive = await client!.callTool({ name: "read_file", arguments: { path: ".env" } });
    expect(sensitive.isError).toBe(true);
    expect(textOf(sensitive)).toContain("ACCESS_DENIED_SENSITIVE_FILE");
    expect(textOf(sensitive)).not.toContain("stdio-secret");
    const escape = await client!.callTool({ name: "read_file", arguments: { path: "../outside.txt" } });
    expect(escape.isError).toBe(true);
    expect(textOf(escape)).toContain("PATH_OUTSIDE_WORKSPACE");
    expect(protocolErrors).toEqual([]);
  });

  it("does not create HTTP daemon, OAuth, pairing, or tunnel state", () => {
    const entries = fs.readdirSync(stateDir);
    expect(entries).not.toEqual(expect.arrayContaining(["runtime"]));
    for (const entry of entries) expect(entry).not.toMatch(/auth|pairing|tunnel|runtime/);
  });

  it("reports an invalid directory on stderr with no stdout protocol pollution", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", cliEntry, "mcp-stdio", "--workspace", path.join(root, "missing")], {
      cwd: projectRoot,
      env: { ...process.env, C2C_STATE_DIR: stateDir },
      encoding: "utf8",
      timeout: 10_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/does not exist|not found|FILE_NOT_FOUND/i);
  });

  it("requires an explicit directory without writing to stdout", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", cliEntry, "mcp-stdio"], {
      cwd: projectRoot, encoding: "utf8", timeout: 10_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("required option");
  });

  it("closes cleanly on SIGTERM after initialization", async () => {
    const child = spawn(process.execPath, ["--import", "tsx", cliEntry, "mcp-stdio", "--workspace", root], {
      cwd: projectRoot, env: { ...process.env, C2C_STATE_DIR: stateDir }, stdio: "pipe",
    });
    try {
      const closed = new Promise<number | null>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", resolve);
      });
      await new Promise<void>((resolve, reject) => {
        child.once("error", reject);
        child.stdout.once("data", () => resolve());
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
          protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "signal-test", version: "1" },
        } }) + "\n");
      });
      child.kill("SIGTERM");
      expect(await closed).toBe(0);
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  });

  it("exits when its input stream closes", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", cliEntry, "mcp-stdio", "--workspace", root], {
      cwd: projectRoot,
      env: { ...process.env, C2C_STATE_DIR: stateDir },
      input: "",
      encoding: "utf8",
      timeout: 10_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });
});
