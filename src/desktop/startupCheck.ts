import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);

/** Validate the real engine's response, never manufacture or relax organization requirements. */
export async function verifyDesktopStartup(binary: string): Promise<string> {
  const env = { ...process.env };
  delete env.CODEX_CLI_PATH; delete env.CCODEX_SHIM_ACTIVE;
  const { stdout } = await execute(binary, ["app-server", "--print-startup-config", "--startup-client-info",
    JSON.stringify({ name: "ccodex-startup-verification", title: "CCodex startup verification", version: "1" })],
  { env, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }).catch(() => { throw new Error("The official engine could not complete the desktop startup check. Native launch settings were not activated."); });
  let response: any;
  try { response = JSON.parse(stdout); } catch { /* Rejected below without logging private policy contents. */ }
  if (!response || typeof response.appServerVersion !== "string" || !response.configRequirements
    || typeof response.configRequirements !== "object" || !Object.hasOwn(response.configRequirements, "requirements")) {
    throw new Error("The official engine returned an incompatible startup response. Native launch settings were not activated.");
  }
  return response.appServerVersion;
}
