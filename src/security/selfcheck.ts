import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Config } from "../config.js";
import { pinEngine } from "./engine.js";
import { secureOptions } from "./policy.js";
import { runSandboxedShell } from "./shell.js";

export async function selfCheck(config: Config): Promise<string> {
  if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("This bundle is for macOS on Apple silicon.");
  const root = mkdtempSync(join(tmpdir(), "ccodex-secure-check-"));
  const cwd = join(root, "project"); mkdirSync(cwd);
  const isolated: Config = { ...config, productHome: root, claudeHome: join(root, "claude"), dataDir: join(root, "state") };
  try {
    pinEngine(isolated);
    const options = secureOptions(isolated, cwd, true);
    const child = options.spawnClaudeCodeProcess!({ command: config.claudeBinary, args: ["--version"], cwd, signal: new AbortController().signal, env: { ...options.env, HOME: root } });
    let version = "";
    child.stdout.on("data", (data: Buffer) => { version += data.toString("utf8"); });
    const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
    const code = await new Promise<number | null>((done, fail) => { child.once("exit", done); child.once("error", fail); }).finally(() => clearTimeout(timer));
    if (code !== 0) throw new Error("The Claude engine could not start inside macOS Seatbelt.");
    if (!/^2\.1\.304\b/u.test(version)) throw new Error(`This build was validated with Claude Code 2.1.304; found ${version.trim()}. Validate this engine version before activation.`);
    const good = await runSandboxedShell(cwd, "echo verified > check.txt");
    const blocked = await runSandboxedShell(cwd, "echo forbidden > ../must-not-exist.txt");
    if (good.failed || !blocked.failed) throw new Error("The macOS file boundary did not pass its self-check.");
    return `Claude Code ${version.trim()}; project boundary verified; no account or model prompt used.`;
  } finally { rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
}
