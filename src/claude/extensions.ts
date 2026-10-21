import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Options } from "@anthropic-ai/claude-agent-sdk";
import type { Config } from "../config.js";
import { atomicWrite } from "../management/files.js";

function object(path: string): Record<string, any> {
  if (!existsSync(path)) return {};
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Claude configuration must be an object.");
  return value as Record<string, any>;
}

/** Load extension settings without copying the user's login or account metadata. */
export function nativeExtensions(config: Config): Pick<Options, "settings" | "mcpServers"> {
  if (config.accessMode !== "personal") return {};
  const user = join(homedir(), ".claude");
  const settings = { ...object(join(user, "settings.json")), ...object(join(config.claudeHome, "settings.json")) };
  const source = object(existsSync(join(user, ".config.json")) ? join(user, ".config.json") : join(homedir(), ".claude.json"));
  return { settings, mcpServers: source.mcpServers ?? {} };
}

/** Called only during an explicit setup/update; existing user directories and agent edits are preserved. */
export function activateNativeExtensions(config: Config, agent: string): void {
  mkdirSync(config.claudeHome, { recursive: true, mode: 0o700 });
  const user = join(homedir(), ".claude");
  for (const name of ["plugins", "skills", "commands", "CLAUDE.md"]) {
    const target = join(config.claudeHome, name), source = join(user, name);
    if (existsSync(source) && !lstatSync(target, { throwIfNoEntry: false })) symlinkSync(source, target);
  }
  // Agents are copied only as links to individual files so our wrapper can coexist with them.
  mkdirSync(join(config.claudeHome, "agents"), { recursive: true, mode: 0o700 });
  if (existsSync(join(user, "agents"))) for (const name of readdirSync(join(user, "agents"))) {
    const target = join(config.claudeHome, "agents", name);
    if (!lstatSync(target, { throwIfNoEntry: false })) symlinkSync(join(user, "agents", name), target);
  }
  const wrapper = join(config.claudeHome, "agents", "codex-wrapper.md");
  if (!existsSync(wrapper)) atomicWrite(wrapper, agent, 0o600);
  const path = join(config.claudeHome, "settings.json");
  // User settings are merged in memory by nativeExtensions; do not duplicate their keys/env on disk.
  const settings = { ...object(path), syncClaudeAiSkills: true, syncClaudeAiPlugins: true };
  atomicWrite(path, JSON.stringify(settings, null, 2) + "\n", 0o600);
}
