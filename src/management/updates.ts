import { createHash, randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import type { Config } from "../config.js";
import { verifyBundle } from "../security/bundle.js";
import { atomicWrite } from "./files.js";
import { compareSemver } from "./shimSelect.js";

const REPO = "KillermyB/ccodex";
const MAX_BYTES = 300_000_000;
const execute = promisify(execFile);

/** Releases use plain USTAR regular files/directories, without links or extended headers. */
export function extractRuntimeArchive(archive: Buffer, root: string): void {
  const bytes = gunzipSync(archive, { maxOutputLength: MAX_BYTES });
  let offset = 0, count = 0;
  const octal = (b: Buffer) => { const value = b.toString("ascii").replace(/\0.*$/su, "").trim(); if (!/^[0-7]*$/u.test(value)) throw new Error("Invalid tar number."); return Number.parseInt(value || "0", 8); };
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512); offset += 512;
    if (header.every((b) => b === 0)) return;
    if (++count > 30_000) throw new Error("Update contains too many files.");
    const text = (a: number, b: number) => header.subarray(a, b).toString("utf8").replace(/\0.*$/su, "");
    const prefix = text(345, 500), name = (prefix ? prefix + "/" : "") + text(0, 100);
    if (!name || name.startsWith("/") || name.split("/").some((part) => part === ".." || part === ".") || /[\x00-\x1f\x7f\\]/u.test(name)) throw new Error("Unsafe update path.");
    const sum = header.reduce((n, b, i) => n + (i >= 148 && i < 156 ? 32 : b), 0);
    if (sum !== octal(header.subarray(148, 156))) throw new Error("Invalid tar checksum.");
    const type = header[156], size = octal(header.subarray(124, 136));
    if (![0, 48, 53].includes(type!) || offset + size > bytes.length) throw new Error("Update links and extended headers are not supported.");
    const target = resolve(root, name);
    if (!target.startsWith(resolve(root) + "/")) throw new Error("Unsafe update destination.");
    if (type === 53) { if (size) throw new Error("Invalid directory."); mkdirSync(target, { recursive: true, mode: 0o700 }); }
    else { mkdirSync(dirname(target), { recursive: true, mode: 0o700 }); writeFileSync(target, bytes.subarray(offset, offset + size), { flag: "wx", mode: octal(header.subarray(100, 108)) & 0o111 ? 0o755 : 0o644 }); }
    offset += Math.ceil(size / 512) * 512;
  }
  throw new Error("Incomplete update archive.");
}

async function download(url: string, max: number): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { "User-Agent": "ccodex-personal-updater", Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`GitHub update request failed (${response.status}).`);
  const chunks: Uint8Array[] = []; let size = 0;
  for await (const chunk of response.body!) { size += chunk.length; if (size > max) { await response.body?.cancel().catch(() => undefined); throw new Error("Update download is too large."); } chunks.push(chunk); }
  return Buffer.concat(chunks);
}

export async function updateFromGitHub(config: Config, current: string, check: boolean): Promise<string> {
  const releases = JSON.parse((await download(`https://api.github.com/repos/${REPO}/releases?per_page=20`, 2_000_000)).toString("utf8")) as any[];
  const release = releases.filter((r) => !r.draft && /^v\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/iu.test(r.tag_name)).sort((a, b) => compareSemver(b.tag_name.slice(1), a.tag_name.slice(1)))[0];
  if (!release || compareSemver(release.tag_name.slice(1), current) <= 0) return `CCodex ${current} : aucune version plus récente publiée sur ${REPO}.`;
  const version = release.tag_name.slice(1), name = `ccodex-personal-runtime-${version}.tgz`;
  const asset = release.assets?.find((a: any) => a.name === name), checksum = release.assets?.find((a: any) => a.name === name + ".sha256");
  if (!asset || !checksum) throw new Error("The fork release does not contain a complete installable runtime.");
  if (check) return `CCodex ${version} disponible sur https://github.com/${REPO}/releases/tag/${release.tag_name}`;
  for (const entry of [asset, checksum]) if (!entry.browser_download_url.startsWith(`https://github.com/${REPO}/releases/download/`)) throw new Error("Unexpected update origin.");
  const expected = (await download(checksum.browser_download_url, 1024)).toString("utf8").trim().split(/\s+/u)[0];
  const archive = await download(asset.browser_download_url, MAX_BYTES);
  if (!/^[a-f0-9]{64}$/u.test(expected!) || createHash("sha256").update(archive).digest("hex") !== expected) throw new Error("Update checksum mismatch.");
  const staging = join(config.productHome, "update-" + randomUUID());
  mkdirSync(staging, { mode: 0o700 });
  try {
    extractRuntimeArchive(archive, staging); verifyBundle(staging);
    const pkg = JSON.parse(readFileSync(join(staging, "package.json"), "utf8"));
    if (pkg.version !== version || pkg.name !== "@gkorepanov/ccodex") throw new Error("Unexpected update package.");
    await execute(process.execPath, [join(staging, "dist/cli/main.js"), "setup"], { env: { ...process.env, CCODEX_HOME: config.productHome }, timeout: 120_000 });
    return `CCodex ${version} installé. Quitte et rouvre Codex pour charger la mise à jour.`;
  } finally { rmSync(staging, { recursive: true, force: true }); }
}

/** Check at most once every six hours; installation is deferred to a child and never restarts the active gateway. */
export function scheduleAutoUpdate(config: Config): void {
  if (!config.autoUpdate) return;
  const marker = join(config.productHome, "last-update-check");
  if (existsSync(marker) && Date.now() - statSync(marker).mtimeMs < 6 * 60 * 60_000) return;
  atomicWrite(marker, new Date().toISOString() + "\n", 0o600);
  const child = spawn(process.execPath, [fileURLToPath(new URL("../cli/main.js", import.meta.url)), "update", "--auto"], { detached: true, stdio: "ignore", env: { ...process.env, CCODEX_HOME: config.productHome } });
  child.once("error", () => undefined); child.unref();
}
