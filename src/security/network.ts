import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { Config } from "../config.js";
import { secureOptions } from "./policy.js";

/** Unauthenticated HEAD only: no model call, request body, cookies, or user curl configuration. */
export async function verifyNetwork(config: Config): Promise<number> {
  const options = secureOptions(config);
  const child = options.spawnClaudeCodeProcess!({
    command: "/usr/bin/curl", args: ["--disable", "--head", "--silent", "--show-error", "--max-time", "8", "--output", "/dev/null", "--write-out", "%{http_code}", "https://api.anthropic.com/"],
    cwd: config.claudeHome, env: options.env!, signal: new AbortController().signal,
  }) as ChildProcessWithoutNullStreams;
  let status = "";
  child.stdout.on("data", (chunk: Buffer) => { status += chunk.toString("utf8"); if (status.length > 1024) child.kill("SIGKILL"); });
  child.stderr.resume();
  const timer = setTimeout(() => child.kill("SIGKILL"), 12_000);
  const code = await new Promise<number | null>((done, fail) => { child.once("close", done); child.once("error", fail); }).finally(() => clearTimeout(timer));
  if (code === 0 && /^[1-5][0-9]{2}$/u.test(status.trim())) return Number(status.trim());
  if (code === 6) throw new Error("La résolution DNS de l’API Anthropic est bloquée sous le profil macOS.");
  if (code === 60 || code === 77) throw new Error("La vérification des certificats HTTPS est bloquée. Aucun contournement TLS n’a été appliqué.");
  throw new Error("L’API Anthropic n’est pas joignable sous le profil macOS. Réessaie Vérifier le réseau après avoir contrôlé ta connexion Internet.");
}
