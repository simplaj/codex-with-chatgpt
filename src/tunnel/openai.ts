import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Command, Option } from "commander";
import { Workspace } from "../workspace/manager.js";
import { getStateDir, readJsonIfExists, writeSecureJson } from "../config/paths.js";

interface Config {
  transport: "openai";
  workspace: string;
  tunnelId: string;
  runtime: string;
  keyFile?: string;
  port: number;
  access?: "read-only" | "full";
}
const configPath = (id: string): string => path.join(getStateDir(), "openai", `${id}.json`);
function outside(root: string, file: string): boolean {
  const rel = path.relative(root, file);
  return rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
}
function validateKeyFile(workspace: Workspace, file: string): string {
  const real = fs.realpathSync(file);
  if (!outside(workspace.root, real)) throw new Error("Credential file must be outside the exposed project.");
  const stat = fs.statSync(real);
  if (!stat.isFile()) throw new Error("Credential path must be a file.");
  if (process.platform !== "win32" && (stat.mode & 0o077)) throw new Error("Credential file must be private (chmod 600).");
  return real;
}
function load(root: string): Config {
  const workspace = new Workspace(root);
  const config = readJsonIfExists<Config>(configPath(workspace.id));
  if (!config || config.transport !== "openai" || config.workspace !== workspace.root) {
    throw new Error("NOT_CONFIGURED: run c2c openai setup first.");
  }
  return config;
}
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}
// The runtime parses MCP_COMMAND as an argv string, not a shell script.
const quote = (arg: string): string => `"${arg.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
export function mcpCommand(root: string, access: "read-only" | "full" = "read-only"): string {
  const entry = fileURLToPath(new URL("../../bin/c2c.js", import.meta.url));
  return [process.execPath, entry, "mcp-stdio", "--workspace", root, "--access", access].map(quote).join(" ");
}
function credential(config: Config): string {
  const key = config.keyFile
    ? fs.readFileSync(validateKeyFile(new Workspace(config.workspace), config.keyFile), "utf8").trim()
    : process.env.CONTROL_PLANE_API_KEY?.trim();
  if (!key) throw new Error("NEED_CREDENTIAL: set CONTROL_PLANE_API_KEY locally or configure a private --key-file; never paste a key into chat.");
  return key;
}

export function registerOpenaiCommands(program: Command): void {
  const group = program.command("openai").description("Configure and run the Cloudflare-free stdio tunnel");
  const wrap = (action: (opts: any) => Promise<void>) => async (opts: any): Promise<void> => {
    try { await action(opts); } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (opts.json) console.log(JSON.stringify({ ok: false, error: message }));
      else console.error(message);
      process.exitCode = 1;
    }
  };
  group.command("setup")
    .requiredOption("-w, --workspace <path>")
    .requiredOption("--tunnel-id <id>")
    .requiredOption("--runtime <path>", "absolute path to the standalone runtime (no cloudflared)")
    .option("--key-file <path>", "private file containing only the runtime key, outside the project")
    .addOption(new Option("--access <mode>", "full grants OS-user read/write/shell access; NOT sandboxed").choices(["read-only", "full"]))
    .option("--json")
    .action(wrap(async (opts) => {
      const workspace = new Workspace(opts.workspace);
      if (!/^tunnel_[A-Za-z0-9_-]+$/.test(opts.tunnelId)) throw new Error("Invalid tunnel ID.");
      if (!path.isAbsolute(opts.runtime)) throw new Error("Runtime path must be absolute.");
      const runtime = fs.realpathSync(opts.runtime);
      if (!fs.statSync(runtime).isFile()) throw new Error("Runtime must be a file.");
      if (/cloudflared/i.test(runtime)) throw new Error("Use the standalone runtime without cloudflared.");
      fs.accessSync(runtime, fs.constants.X_OK);
      const keyFile = opts.keyFile ? validateKeyFile(workspace, opts.keyFile) : undefined;
      const file = configPath(workspace.id);
      const prior = readJsonIfExists<Config>(file);
      const access = opts.access ?? prior?.access ?? "read-only";
      if (prior && access !== (prior.access ?? "read-only")) {
        const lock = path.join(getStateDir(), "openai", `${createHash("sha256").update(prior.tunnelId).digest("hex")}.lock`);
        if (fs.existsSync(lock)) throw new Error("Stop the existing runtime before changing access mode.");
      }
      // One mapping per tunnel within this installation; never silently rebind.
      if (fs.existsSync(path.dirname(file))) {
        for (const name of fs.readdirSync(path.dirname(file)).filter((name) => name.endsWith(".json"))) {
          const other = readJsonIfExists<Config>(path.join(path.dirname(file), name));
          if (other && other.tunnelId === opts.tunnelId && other.workspace !== workspace.root) {
            throw new Error("Tunnel already configured for another project. Use a separate tunnel ID.");
          }
        }
      }
      if (prior && (prior.tunnelId !== opts.tunnelId || prior.runtime !== runtime || prior.keyFile !== keyFile)) {
        throw new Error("Configuration differs. Stop the old runtime and remove its configuration explicitly before rebinding.");
      }
      const config: Config = { access, transport: "openai", workspace: workspace.root, tunnelId: opts.tunnelId, runtime, keyFile, port: prior?.port ?? await freePort() };
      writeSecureJson(file, config);
      console.log(JSON.stringify({ ok: true, configured: true, connected: false, access, workspaceId: workspace.id,
        configFile: file, tunnelId: config.tunnelId, healthUrl: `http://127.0.0.1:${config.port}/readyz`,
        next: "Run c2c openai run -w <project> in a persistent terminal, then c2c openai doctor -w <project> --json. Verify tools in the app separately." }));
    }));
  group.command("run").requiredOption("-w, --workspace <path>").action(wrap(async (opts) => {
    const config = load(opts.workspace);
    const key = credential(config);
    const lock = path.join(getStateDir(), "openai", `${createHash("sha256").update(config.tunnelId).digest("hex")}.lock`);
    let fd: number;
    try { fd = fs.openSync(lock, "wx", 0o600); }
    catch { throw new Error("Runtime lock exists. Do not start another instance. Check the existing process; remove a stale lock only after confirming it stopped."); }
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, workspace: config.workspace }));
    fs.closeSync(fd);
    try {
      const child = spawn(config.runtime, ["run", "--health.listen-addr", `127.0.0.1:${config.port}`], {
        env: { ...process.env, CONTROL_PLANE_API_KEY: key, CONTROL_PLANE_TUNNEL_ID: config.tunnelId, MCP_COMMAND: mcpCommand(config.workspace, config.access ?? "read-only") },
        stdio: "inherit", windowsHide: true,
      });
      const stop = (): void => { child.kill("SIGTERM"); };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      try {
        await new Promise<void>((resolve, reject) => {
          child.once("error", () => reject(new Error("Runtime could not start. Check executable and permissions.")));
          child.once("exit", (code, signal) => {
            if (code !== 0 && !signal) process.exitCode = code ?? 1;
            resolve();
          });
        });
      } finally {
        process.off("SIGINT", stop);
        process.off("SIGTERM", stop);
      }
    } finally { fs.unlinkSync(lock); }
  }));
  group.command("doctor").requiredOption("-w, --workspace <path>").option("--json").action(wrap(async (opts) => {
    const config = load(opts.workspace);
    let ready = false;
    try { ready = (await fetch(`http://127.0.0.1:${config.port}/readyz`, { signal: AbortSignal.timeout(3000) })).ok; } catch { /* offline */ }
    console.log(JSON.stringify({ ok: ready, transport: "openai", tunnelId: config.tunnelId, runtimeReady: ready, access: config.access ?? "read-only",
      appVerified: null, verification: "not_checked_locally", next: ready ? "Verify workspace_info, read_file and git_status in the app." : "Start or inspect the existing runtime. Never fall back to Cloudflare." }));
    if (!ready) process.exitCode = 1;
  }));
}
