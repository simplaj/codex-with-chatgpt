import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";
import { Workspace } from "../workspace/manager.js";
import { Logger } from "../logger/index.js";

/** Private child-process transport: stdout is reserved for MCP JSON-RPC. */
export async function runStdioServer(root: string, access: "read-only" | "full" = "read-only"): Promise<void> {
  const workspace = new Workspace(root);
  const logger = new Logger({ name: "mcp-stdio", file: null, console: true });
  const server = createMcpServer({ workspace, logger, access });
  const transport = new StdioServerTransport();
  let closing = false;
  const shutdown = (): void => {
    if (closing) return;
    closing = true;
    process.stdin.off("end", shutdown);
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
    void server.close().catch((error: unknown) => {
      logger.error("MCP shutdown failed", String(error));
      process.exitCode = 1;
    });
  };
  process.stdin.once("end", shutdown);
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  try {
    await server.connect(transport);
  } catch (error) {
    shutdown();
    throw error;
  }
}
