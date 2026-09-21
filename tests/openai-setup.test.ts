import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanup, makeTmpDir } from "./helpers.js";
import { mcpCommand } from "../src/tunnel/openai.js";

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let root: string;
let state: string;
let privateDir: string;
let runtime: string;
let keyFile: string;
const secret = "test-private-runtime-key-never-print";
function cli(args: string[], extra: Record<string, string> = {}) {
  return spawnSync(process.execPath, ["--import", "tsx", path.join(project, "src/cli/index.ts"), "openai", ...args], {
    cwd: project, env: { ...process.env, CONTROL_PLANE_API_KEY: "", C2C_STATE_DIR: state, ...extra },
    encoding: "utf8", timeout: 15000,
  });
}
function setup(args: string[] = [], workspace = root) {
  return cli(["setup", "-w", workspace, "--runtime", runtime, "--tunnel-id", "tunnel_test", "--json", ...args]);
}
beforeAll(() => {
  root = makeTmpDir("openai target with spaces");
  state = makeTmpDir("openai-state");
  privateDir = makeTmpDir("openai-private");
  runtime = path.join(privateDir, "tunnel-client-runtime");
  fs.writeFileSync(runtime, `#!/usr/bin/env node\nif (process.env.CONTROL_PLANE_API_KEY !== ${JSON.stringify(secret)} || process.env.CONTROL_PLANE_TUNNEL_ID !== 'tunnel_test' || !process.env.MCP_COMMAND.includes('mcp-stdio') || !process.argv.includes('--health.listen-addr')) process.exit(8);\nconsole.log('runtime-started');\n`, { mode: 0o700 });
  keyFile = path.join(privateDir, "key");
  fs.writeFileSync(keyFile, secret, { mode: 0o600 });
});
afterAll(() => { cleanup(root); cleanup(state); cleanup(privateDir); });

describe("OpenAI agent setup", () => {
  it("saves private non-secret config and is idempotent", () => {
    const result = setup(["--key-file", keyFile]);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload).toMatchObject({ ok: true, configured: true, connected: false });
    const before = fs.readFileSync(payload.configFile, "utf8");
    expect(before).not.toContain(secret);
    expect(setup(["--key-file", keyFile]).status).toBe(0);
    expect(fs.readFileSync(payload.configFile, "utf8")).toBe(before);
    if (process.platform !== "win32") expect(fs.statSync(payload.configFile).mode & 0o077).toBe(0);
  });
  it("rejects a credential file inside the exposed project", () => {
    const file = path.join(root, "secret");
    fs.writeFileSync(file, secret, { mode: 0o600 });
    const result = setup(["--key-file", file]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("outside");
    expect(result.stdout + result.stderr).not.toContain(secret);
  });
  it.skipIf(process.platform === "win32")("rejects overly broad credential permissions", () => {
    fs.chmodSync(keyFile, 0o644);
    try { expect(setup(["--key-file", keyFile]).stdout).toContain("chmod 600"); }
    finally { fs.chmodSync(keyFile, 0o600); }
  });
  it("rejects rebinding the same tunnel to another project", () => {
    const other = makeTmpDir("openai-other");
    try { expect(setup([], other).stdout).toContain("another project"); }
    finally { cleanup(other); }
  });
  it("rejects the bundled Cloudflare runtime", () => {
    const bundled = path.join(privateDir, "tunnel-client-runtime-cloudflared");
    fs.copyFileSync(runtime, bundled);
    const result = setup(["--runtime", bundled]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("without cloudflared");
  });
  it("reports offline rather than pretending configuration means connected", () => {
    const result = cli(["doctor", "-w", root, "--json"]);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, runtimeReady: false, appVerified: false });
  });
  it("quotes every MCP argument and uses an absolute launcher", () => {
    const command = mcpCommand(root);
    expect(command).toContain('"mcp-stdio" "--workspace"');
    expect(command).toContain('"' + root + '"');
    expect(command).toContain(path.join(project, "bin/c2c.js"));
  });
  it.skipIf(process.platform === "win32")("passes private credentials by environment and releases the lock", () => {
    const result = cli(["run", "-w", root]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("runtime-started\n");
    expect(result.stdout + result.stderr).not.toContain(secret);
    expect(fs.readdirSync(path.join(state, "openai")).filter(n => n.endsWith(".lock"))).toEqual([]);
  });
  it("returns actionable errors for an unconfigured project", () => {
    const other = makeTmpDir("openai-empty");
    try {
      const result = cli(["doctor", "-w", other, "--json"]);
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout).error).toContain("NOT_CONFIGURED");
    } finally { cleanup(other); }
  });
});
