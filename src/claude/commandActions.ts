import type { CommandAction } from "../protocol/codex.js";
export async function parseCommands(_commands: readonly string[]): Promise<void> {}
export function bashCommandActions(command: string, _cwd: string): CommandAction[] {
  return command ? [{ type: "unknown", command }] : [];
}
