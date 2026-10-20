import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readFileSync, readSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../config.js";
import { atomicWrite } from "../management/files.js";

export function fileDigest(path: string): string {
  const hash = createHash("sha256");
  const descriptor = openSync(path, "r");
  const bytes = Buffer.alloc(256 * 1024);
  try { for (let count = readSync(descriptor, bytes); count; count = readSync(descriptor, bytes)) hash.update(bytes.subarray(0, count)); }
  finally { closeSync(descriptor); }
  return hash.digest("hex");
}

export function pinEngine(config: Pick<Config, "productHome" | "claudeBinary">): void {
  const path = realpathSync(config.claudeBinary);
  atomicWrite(join(config.productHome, "engine-pin.json"), JSON.stringify({ path, sha256: fileDigest(path) }) + "\n", 0o600);
}

const verified = new Map<string, string>();
export function verifyEngine(config: Pick<Config, "productHome" | "claudeBinary">): void {
  const manifest = join(config.productHome, "engine-pin.json");
  if (!existsSync(manifest)) throw new Error("Claude has not been pinned by the local secure installer. Run the installer first.");
  const pin = JSON.parse(readFileSync(manifest, "utf8")) as { path: string; sha256: string };
  const path = realpathSync(config.claudeBinary);
  const info = statSync(path);
  const key = `${path}:${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
  if (path !== pin.path || (verified.get(key) ?? fileDigest(path)) !== pin.sha256) {
    throw new Error("The Claude executable changed after installation. Verify and reinstall the local secure bundle before using the new engine.");
  }
  verified.set(key, pin.sha256);
}
