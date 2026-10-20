import { mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Options } from "@anthropic-ai/claude-agent-sdk";
import { codexHome } from "../config.js";
import type { JsonObject } from "../protocol/codex.js";

/** Codex's reference line for a visual: Claude cannot write it (its private-use characters never reach the chat). */
const REFERENCE = /\u{E200}visualize\u{E202}(\{.*?\})\u{E201}/gu;

/** Desktop's own directive, which it turns the reference line into. */
function directive(reference: string): string {
  const { path, title, mode } = JSON.parse(reference) as { path: string; title?: string; mode?: string };
  return `::codex-inline-vis{path="${path}"${title ? ` title="${title}"` : ""}${mode === "wide" ? ` mode="wide"` : ""}}`;
}

/** The skill as Claude reads it: the reference line is Desktop's directive. */
export function claudeVisualizeSkill(skill: string): string {
  return skill.replace(REFERENCE, (_line, reference: string) => directive(reference))
    .replaceAll("`\"mode\":\"wide\"`", "`mode=\"wide\"`")
    .replace("The JSON object may also include a `title`", "The directive may also include `title=\"…\"`");
}

/** The SKILL.md of Codex's bundled visualize skill, while stock lists it (its plugin enabled). */
export function stockVisualizeSkill(stockSkills: JsonObject): string | undefined {
  return stockSkills.data.flatMap((entry: JsonObject) => entry.skills)
    .find((skill: JsonObject) => skill.name === "visualize:visualize" && skill.enabled)?.path;
}

/**
 * Codex's visualize skill as a Claude plugin in `directory`: Claude lists it among its skills as `visualize:visualize`
 * (what Desktop sends for stock's), its other files where the skill says they are.
 */
export function writeVisualizePlugin(directory: string, skillFile: string): void {
  const source = dirname(skillFile);
  const skill = join(directory, "skills", "visualize");
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(join(directory, ".claude-plugin"), { recursive: true });
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(directory, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "visualize" }));
  writeFileSync(join(skill, "SKILL.md"), claudeVisualizeSkill(readFileSync(skillFile, "utf8")));
  for (const name of readdirSync(source)) if (name !== "SKILL.md") symlinkSync(join(source, name), join(skill, name));
}

/**
 * Desktop's folder for a chat's visuals, which it reads them from: by the UTC day of the chat's UUIDv7 (it makes it at
 * every turn, and gives it to stock as a writable root).
 */
export function visualizationFolder(threadId: string): string | undefined {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(threadId)) return undefined;
  const day = new Date(Number.parseInt(`${threadId.slice(0, 8)}${threadId.slice(9, 13)}`, 16)).toISOString().slice(0, 10);
  return join(codexHome(), "visualizations", ...day.split("-"), threadId);
}

/** The skill for a Claude chat, and its visuals' folder as Claude's own (the skill writes there, given as a writable root). */
export function visualizeOptions(plugin: string | undefined, threadId: string): Options {
  if (!plugin) return {};
  const folder = visualizationFolder(threadId);
  if (folder) mkdirSync(folder, { recursive: true });
  return { plugins: [{ type: "local", path: plugin }], ...(folder ? { additionalDirectories: [folder] } : {}) };
}
