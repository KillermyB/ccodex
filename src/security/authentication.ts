import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { Config } from "../config.js";
import { secureOptions } from "./policy.js";

/** Verify the native engine's own login status under the exact production boundary. */
export async function authenticationStatus(config: Config): Promise<boolean> {
  const options = secureOptions(config);
  const child = options.spawnClaudeCodeProcess!({
    command: config.claudeBinary, args: ["auth", "status", "--json"],
    cwd: config.claudeHome, env: options.env!, signal: new AbortController().signal,
  }) as ChildProcessWithoutNullStreams;
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
    if (output.length > 65_536) child.kill("SIGKILL");
  });
  child.stderr.resume();
  const timer = setTimeout(() => child.kill("SIGKILL"), 12_000);
  const code = await new Promise<number | null>((done, fail) => { child.once("close", done); child.once("error", fail); }).finally(() => clearTimeout(timer));
  try { return code === 0 && (JSON.parse(output) as { loggedIn?: boolean }).loggedIn === true; }
  catch { return false; }
}

export async function assertAuthenticated(config: Config): Promise<void> {
  if (!await authenticationStatus(config)) throw new Error("La connexion Claude n’est pas reconnue dans le mode actuel. Ouvre CCodex Secure, choisis Connecter Claude, puis Vérifier la connexion.");
}
