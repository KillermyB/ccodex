import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DESKTOP_RUNTIME_PATHS = [
  "Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex",
  "Contents/Resources/codex",
  "Contents/Resources/codex-cli/bin/codex",
] as const;

/** Resolve on every launch, so a desktop update also updates the underlying engine. */
export function findDesktopCodex(roots: readonly string[] = process.env.CCODEX_DESKTOP_APP
  ? [process.env.CCODEX_DESKTOP_APP]
  : ["/Applications/ChatGPT.app", "/Applications/Codex.app", join(homedir(), "Applications/ChatGPT.app"), join(homedir(), "Applications/Codex.app")]): string | undefined {
  for (const root of roots) for (const suffix of DESKTOP_RUNTIME_PATHS) {
    const candidate = join(root, suffix);
    try {
      accessSync(candidate, constants.X_OK);
      const real = realpathSync(candidate);
      if (statSync(real).isFile() && !real.includes("/.ccodex-secure/") && !real.includes("/@gkorepanov/ccodex/")) return real;
    } catch { /* This app or runtime layout is not installed. */ }
  }
  return undefined;
}

export function isStartupConfigRequest(args: readonly string[]): boolean {
  return args.some((arg) => arg.startsWith("--print-startup-") || arg.startsWith("--startup-"));
}
