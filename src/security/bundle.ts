import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Detect incomplete, changed, symlinked or augmented bundles before copying executable code. */
export function verifyBundle(root: string): void {
  const manifest = "BUNDLE-SHA256.json";
  const entries: unknown = JSON.parse(readFileSync(join(root, manifest), "utf8"));
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) throw new Error("Invalid bundle manifest.");
  const expected = entries as Record<string, unknown>;
  for (const required of ["package.json", "dist/cli/main.js", "node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs"]) {
    if (!Object.hasOwn(expected, required)) throw new Error(`Incomplete bundle manifest: ${required}`);
  }
  const pending = new Set(Object.keys(expected));
  for (const [file, hash] of Object.entries(expected)) {
    if (file === manifest || file.startsWith("/") || file.split("/").some((part) => !part || part === "." || part === "..")
      || typeof hash !== "string" || !/^[a-f0-9]{64}$/u.test(hash)) throw new Error(`Invalid bundle entry: ${file}`);
  }
  const visit = (relative: string): void => {
    const path = join(root, relative);
    const info = lstatSync(path);
    if (info.isSymbolicLink()) throw new Error(`Symlink in bundle: ${relative}`);
    if (info.isDirectory()) {
      for (const file of readdirSync(path)) visit(relative ? `${relative}/${file}` : file);
    } else {
      if (!info.isFile()) throw new Error(`Unsupported bundle entry: ${relative}`);
      if (relative === manifest) return;
      const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
      if (!pending.delete(relative) || expected[relative] !== hash) throw new Error(`Bundle integrity check failed: ${relative}`);
    }
  };
  visit("");
  if (pending.size) throw new Error(`Missing bundle file: ${pending.values().next().value}`);
}
