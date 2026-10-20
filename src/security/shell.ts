import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { seatbeltProfile, workspace } from "./policy.js";

export async function runSandboxedShell(cwd: string, command: string, timeoutMs = 120_000, signal?: AbortSignal): Promise<{ text: string; failed: boolean }> {
  if (process.platform !== "darwin") throw new Error("The secure shell requires macOS Seatbelt.");
  const root = workspace(cwd);
  const temporary = mkdtempSync(join(tmpdir(), "ccodex-secure-command-"));
  const profile = seatbeltProfile([root, temporary], [root, temporary], [], [root], false, false);
  try {
    return await new Promise((done, fail) => {
      const child = spawn("/usr/bin/sandbox-exec", ["-p", profile, "/bin/zsh", "-f", "-c", command], {
        cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe"],
        env: { HOME: temporary, TMPDIR: temporary, PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin", LANG: "en_US.UTF-8", npm_config_cache: join(temporary, "npm-cache") },
      });
      let output = "";
      let bytes = 0;
      let stopped = "";
      const stop = () => { if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } } };
      const abort = () => { stopped = "Command cancelled"; stop(); };
      const collect = (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 1_000_000) { stopped = "Output exceeded 1 MB"; stop(); }
        else output += chunk.toString("utf8");
      };
      const timer = setTimeout(() => { stopped = "Command exceeded its time limit"; stop(); }, Math.min(120_000, Math.max(100, timeoutMs)));
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      child.stdout.on("data", collect); child.stderr.on("data", collect);
      child.once("error", (error) => { clearTimeout(timer); signal?.removeEventListener("abort", abort); fail(error); });
      child.once("close", (code, reason) => {
        clearTimeout(timer); signal?.removeEventListener("abort", abort); stop();
        done({ text: `${output}${stopped ? `\n${stopped}` : ""}\n(exit ${code ?? reason})`, failed: Boolean(stopped) || code !== 0 });
      });
    });
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

export function shellServer(cwd: string, readOnly: boolean) {
  return createSdkMcpServer({
    name: "secure", version: "1.0.0", alwaysLoad: true, timeout: 130_000,
    tools: [tool("shell", "Run a project command after user approval. macOS blocks all network access and files outside the project and temporary build directory. Protected files and credential services are blocked. Maximum duration 120 seconds; maximum output 1 MB.",
      { command: z.string().min(1).max(32_768) }, async ({ command }, extra: unknown) => {
        if (readOnly) return { content: [{ type: "text" as const, text: "This chat is read-only; shell commands are disabled." }], isError: true };
        const signal = (extra as { signal?: AbortSignal } | undefined)?.signal;
        const result = await runSandboxedShell(cwd, command, 120_000, signal);
        return { content: [{ type: "text" as const, text: result.text }], isError: result.failed };
      })],
  });
}
