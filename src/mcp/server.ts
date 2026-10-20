import type { Readable, Writable } from "node:stream";
import type { Config } from "../config.js";
export const MCP_THREAD_SOURCE = "ccodex-mcp";
export async function runMcpServer(_config: Config, _version: string, _input?: Readable, _output?: Writable): Promise<number> {
  throw new Error("Automatic Codex MCP delegation is disabled in CCodex Secure.");
}
