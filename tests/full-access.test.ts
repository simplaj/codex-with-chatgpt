import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/mcp/server.js";
import { Workspace } from "../src/workspace/manager.js";
import { nullLogger } from "../src/logger/index.js";
import { makeTmpDir, cleanup } from "./helpers.js";

let root: string, outside: string, client: Client;
let server: ReturnType<typeof createMcpServer>;
const data = (r: any) => JSON.parse(r.content[0].text);
beforeAll(async () => {
  root = makeTmpDir("full-root"); outside = makeTmpDir("full-outside");
  server = createMcpServer({ workspace: new Workspace(root), logger: nullLogger, access: "full" });
  client = new Client({ name: "full-test", version: "1" });
  const [a,b] = InMemoryTransport.createLinkedPair();
  await server.connect(a); await client.connect(b);
});
afterAll(async () => { await client.close(); await server.close(); cleanup(root); cleanup(outside); });
describe("explicit full access", () => {
  it("exposes destructive annotations and additional tools", async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(12);
    expect(tools.find(t => t.name === "execute_command")?.annotations?.readOnlyHint).toBe(false);
  });
  it("creates and reads files outside project; overwrite requires explicit request", async () => {
    const file = path.join(outside, "test.txt");
    expect(data(await client.callTool({ name: "write_file", arguments: { path: file, content: "first" } })).written).toBe(true);
    expect((await client.callTool({ name: "write_file", arguments: { path: file, content: "second" } })).isError).toBe(true);
    await client.callTool({ name: "write_file", arguments: { path: file, content: "second", overwrite: true } });
    expect(data(await client.callTool({ name: "read_file_full", arguments: { path: file } })).content).toBe("second");
  });
  it("runs commands and reports nonzero exit codes", async () => {
    const r = data(await client.callTool({ name: "execute_command", arguments: { command: 'echo full-test', cwd: outside } }));
    expect(r.stdout).toContain("full-test"); expect(r.exitCode).toBe(0);
    expect((await client.callTool({ name: "execute_command", arguments: { command: 'exit 7' } })).isError).toBe(true);
  });
  it.skipIf(process.platform === "win32")("bounds runtime and kills a timed out command", async () => {
    const r = data(await client.callTool({ name: "execute_command", arguments: { command: "sleep 10", timeoutMs: 100 } }));
    expect(r.timedOut).toBe(true);
  });
  it("enables full tools through the actual stdio CLI flag", async () => {
    const cli = fileURLToPath(new URL("../src/cli/index.ts", import.meta.url));
    const c = new Client({ name: "full-cli", version: "1" });
    const transport = new StdioClientTransport({ command: process.execPath,
      args: ["--import", "tsx", cli, "mcp-stdio", "--workspace", root, "--access", "full"], stderr: "pipe" });
    try {
      await c.connect(transport);
      expect((await c.listTools()).tools.map(t => t.name)).toContain("execute_command");
      const r = await c.callTool({ name: "execute_command", arguments: { command: "echo cli-full" } });
      expect(data(r).stdout).toContain("cli-full");
    } finally { await c.close(); }
  });
  it("leaves default servers read-only", async () => {
    const safe = createMcpServer({ workspace: new Workspace(root), logger: nullLogger });
    const c = new Client({ name: "safe", version: "1" });
    const [a,b] = InMemoryTransport.createLinkedPair();
    await safe.connect(a); await c.connect(b);
    try { expect((await c.listTools()).tools.map(t => t.name)).not.toContain("execute_command"); }
    finally { await c.close(); await safe.close(); }
  });
});
