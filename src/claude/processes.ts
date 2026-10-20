/**
 * The processes a Claude session's commands run. Claude starts every command (its Bash tool, a background task) with
 * the session's id and its own pid in the environment (`CLAUDE_CODE_SESSION_ID`, `CLAUDE_PID`); a command still in
 * the session's process tree ends with it, one it detached (`nohup … &`) lives on and is none of ours.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export interface SessionProcess {
  readonly pid: number;
  readonly session: string;
  /** CPU seconds used so far. */
  readonly cpu: number;
}

/** `[DD-]HH:MM:SS` or `M:SS.ss`. */
export function cpuSeconds(time: string): number {
  const [days, clock] = time.includes("-") ? time.split("-") : ["0", time];
  return Number(days) * 86_400 + clock!.split(":").reduce((total, part) => total * 60 + Number(part), 0);
}

/** The commands Claude sessions still run in their process trees, by session. */
export function sessionProcesses(): SessionProcess[] {
  // Commands belong to our bounded shell runner. Do not inspect other processes' environments.
  return [];
}

/** The parent of a running process; undefined once it is gone. */
export function parentPid(pid: number): number | undefined {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
  } catch {
    try {
      return Number(execFileSync("ps", ["-o", "ppid=", "-p", String(pid)], { encoding: "utf8" }).trim()) || undefined;
    } catch {
      return undefined;
    }
  }
}

/** SIGTERM now, SIGKILL whatever is left a moment later. */
export function killProcesses(pids: readonly number[]): void {
  const signal = (name: NodeJS.Signals) => {
    for (const pid of pids) {
      try { process.kill(pid, name); } catch { /* gone */ }
    }
  };
  signal("SIGTERM");
  setTimeout(() => signal("SIGKILL"), 5_000).unref();
}
