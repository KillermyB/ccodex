import { verifyNetwork } from "../security/network.js";
import { assertAuthenticated } from "../security/authentication.js";
import { verifyBundle } from "../security/bundle.js";
import { pinEngine, verifyEngine } from "../security/engine.js";
import { selfCheck } from "../security/selfcheck.js";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { secureEnvironment } from "../security/policy.js";
import { promisify } from "node:util";
import { delegate } from "../cli/delegate.js";
import { claudeHome, defaultConfigToml, displacedCodexPath, findInstalledCodex, isCcodex, productHome, remoteCodexPath, type Config, loadConfig } from "../config.js";
import { probeAppServer } from "../daemon/probe.js";
import { reconcileManagedProcess, stopManagedProcess } from "../daemon/supervisor.js";
import { reconcileOwnedGateway, stopSocketOwner } from "../daemon/ownership.js";
import { installCliPathAgent, uninstallCliPathAgent, type CliPathAgentInstall } from "../desktop/launchAgent.js";
import { relayBinary } from "../gateway/remote.js";
import { atomicSymlink, atomicWrite } from "./files.js";
import { compareSemver } from "./shimSelect.js";

const execute = promisify(execFile);
const PACKAGE = "@gkorepanov/ccodex";
const BEGIN = "# >>> ccodex secure >>>";
const END = "# <<< ccodex secure <<<";

/** `~/.ccodex/install.json`, kept compatible with 0.4 so upgrades and uninstall keep working. */
interface Manifest {
  readonly schemaVersion: 1;
  readonly package: typeof PACKAGE;
  readonly activeVersion: string;
  readonly delegateCodex?: string | null;
  readonly publicSocket?: string;
  readonly managedShellFiles: string[];
  readonly shimHashes: Record<string, string>;
  readonly remoteCodexShim?: { path: string; target: string; backupPath?: string };
  readonly desktopCliPath?: CliPathAgentInstall;
  readonly nodeExecutable: string;
  readonly installedAt: string;
}

const layout = () => {
  const home = productHome();
  return {
    home, bin: join(home, "bin"), versions: join(home, "versions"), state: join(home, "state"),
    current: join(home, "current"), manifest: join(home, "install.json"),
  };
};

export function packageVersion(): string {
  return (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;
}

function readManifest(): Manifest | undefined {
  const path = layout().manifest;
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as Manifest : undefined;
}

const sha256 = (content: string | Buffer) => createHash("sha256").update(content).digest("hex");
const quote = (value: string) => `'${value.replaceAll("'", "'\"'\"'")}'`;

function shim(name: "codex" | "ccodex", node: string): string {
  const prelude = `#!/bin/sh
set -eu
if [ "\${CCODEX_SHIM_ACTIVE:-}" = 1 ]; then
  printf '%s\\n' 'CCodex recursion guard: managed shim attempted to invoke itself.' >&2
  exit 70
fi
CCODEX_SHIM_ACTIVE=1
CCODEX_HOME=\${CCODEX_HOME:-"$HOME/.ccodex-secure"}
CCODEX_NODE=${quote(node)}
if [ ! -x "$CCODEX_NODE" ]; then
  CCODEX_NODE=$(command -v node 2>/dev/null || true)
fi
if [ -z "$CCODEX_NODE" ] || [ ! -x "$CCODEX_NODE" ]; then
  printf '%s\\n' 'CCodex Node runtime is missing. Reinstall Node.js, then rerun the local CCodex Secure installer' >&2
  exit 69
fi
export CCODEX_SHIM_ACTIVE CCODEX_HOME
`;
  const current = `exec "$CCODEX_NODE" "$CCODEX_HOME/current/node_modules/${PACKAGE}/dist/cli/main.js" "$@"\n`;
  if (name === "codex") return `${prelude}${current}`;
  return `${prelude}${current}`;

}

const fishQuote = (value: string) => "'" + value.replaceAll("\\", "\\\\").replaceAll("'", "\\'") + "'";

function shellBlock(fish: boolean, bin: string): string {
  const cliPath = process.platform === "darwin"
    ? fish ? `set -gx CODEX_CLI_PATH ${fishQuote(`${bin}/codex`)}\n` : `export CODEX_CLI_PATH=${quote(`${bin}/codex`)}\n`
    : "";
  return `${BEGIN}\n${fish ? `fish_add_path --move --prepend ${fishQuote(bin)}` : `export PATH=${quote(bin)}:"$PATH"`}\n${cliPath}${END}\n`;
}

const BLOCK_PATTERN = new RegExp(`${BEGIN}\\n[\\s\\S]*?${END}\\n?`, "u");

function shellFiles(): string[] {
  const home = homedir();
  const login = existsSync(join(home, ".bash_profile")) ? join(home, ".bash_profile") : join(home, ".profile");
  return [login, join(home, ".bashrc"), join(home, ".zprofile"), join(home, ".zshrc"), join(home, ".config", "fish", "config.fish")];
}

function writeShellBlock(path: string, bin: string): void {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const block = shellBlock(path.endsWith(".fish"), bin);
  const next = BLOCK_PATTERN.test(existing)
    ? existing.replace(BLOCK_PATTERN, block)
    : `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}${block}`;
  if (next !== existing) atomicWrite(path, next, existsSync(path) ? statSync(path).mode & 0o777 : 0o600);
}

/**
 * `~/.local/bin/codex` → the managed shim: Desktop over SSH puts that directory first on PATH. A codex found there
 * (Codex's installer puts it there, also over our link) moves aside and stays CCodex's stock codex.
 */
/** 0.4 moved an installer's relative `codex` link into the backup as is, where it dangles: it points again where it did. */
function healDisplacedCodex(home: string): void {
  const backupPath = displacedCodexPath(home);
  if (existsSync(backupPath) || !lstatSync(backupPath, { throwIfNoEntry: false })?.isSymbolicLink()) return;
  const target = resolve(dirname(remoteCodexPath()), readlinkSync(backupPath));
  if (existsSync(target)) atomicSymlink(target, backupPath);
}

function installRemoteShim(home: string, bin: string): Manifest["remoteCodexShim"] {
  const path = remoteCodexPath();
  const target = join(bin, "codex");
  if (path === target) return undefined;
  const backupPath = displacedCodexPath(home);
  if (existsSync(path) && !isCcodex(path, home)) {
    mkdirSync(dirname(backupPath), { recursive: true, mode: 0o700 });
    // The installer's link points at `…/standalone/current/…`, which follows its updates: keep pointing there.
    if (lstatSync(path).isSymbolicLink()) atomicSymlink(resolve(dirname(path), readlinkSync(path)), backupPath);
    else renameSync(path, backupPath);
  }
  mkdirSync(dirname(path), { recursive: true });
  atomicSymlink(target, path);
  return { path, target, ...(existsSync(backupPath) ? { backupPath } : {}) };
}

export async function setup(args: readonly string[]): Promise<number> {
  if (process.getuid?.() === 0) throw new Error("Do not run CCodex setup as root or with sudo.");
  const version = packageVersion();
  if (args.includes("--version") || args.includes("--repair")) throw new Error("Install this verified local bundle directly; registry setup is disabled.");
  const paths = layout();
  if (existsSync(join(homedir(), ".ccodex", "install.json"))) throw new Error("Uninstall the original CCodex before activating this fork; refusing to overwrite its launch configuration.");
  if (!findInstalledCodex(paths.home)) throw new Error("Install the official Codex CLI first. This fork never downloads another engine.");
  await selfCheck({ ...loadConfig(), productHome: paths.home });
  const source = fileURLToPath(new URL("../../", import.meta.url));
  verifyBundle(source);
  for (const directory of [paths.home, paths.bin, paths.versions, paths.state, claudeHome()]) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = join(paths.versions, version);
  const installedRoot = join(target, "node_modules", PACKAGE);
  if (resolve(source) !== resolve(installedRoot)) {
    if (existsSync(target)) throw new Error("This version is already installed. Remove it with this bundle's uninstall command before reinstalling.");
    mkdirSync(installedRoot, { recursive: true, mode: 0o700 });
    cpSync(source, installedRoot, { recursive: true, dereference: false });
  }
  const isolatedSettings = join(claudeHome(), "settings.json");
  if (!existsSync(isolatedSettings)) atomicWrite(isolatedSettings, JSON.stringify({ syncClaudeAiSkills: false, syncClaudeAiPlugins: false }) + "\n", 0o600);
  pinEngine(loadConfig());
  healDisplacedCodex(paths.home);
  const previous = readManifest();
  const managedShellFiles = shellFiles();
  const snapshots = managedShellFiles.map((path) => ({ path, content: existsSync(path) ? readFileSync(path) : undefined, mode: existsSync(path) ? statSync(path).mode & 0o777 : 0o600 }));
  const written = new Map<string, string>();
  const oldCurrent = lstatSync(paths.current, { throwIfNoEntry: false })?.isSymbolicLink() ? readlinkSync(paths.current) : undefined;
  const oldShims = new Map(["codex", "ccodex"].map((name) => [name, existsSync(join(paths.bin, name)) ? readFileSync(join(paths.bin, name)) : undefined]));
  if (!previous && [...oldShims.values()].some(Boolean)) throw new Error("Refusing to overwrite unmanaged secure launchers.");
  let remoteCodexShim: Manifest["remoteCodexShim"];
  let desktopCliPath: CliPathAgentInstall | undefined;
  try {
  atomicSymlink(join("versions", version), paths.current);
  const shimHashes: Record<string, string> = {};
  for (const name of ["codex", "ccodex"] as const) {
    const content = shim(name, process.execPath);
    atomicWrite(join(paths.bin, name), content, 0o755);
    shimHashes[name] = sha256(content);
  }
  for (const path of managedShellFiles) { writeShellBlock(path, paths.bin); written.set(path, sha256(readFileSync(path))); }
  remoteCodexShim = installRemoteShim(paths.home, paths.bin);
  const configPath = join(paths.home, "config.toml");
  if (!existsSync(configPath)) atomicWrite(configPath, defaultConfigToml(), 0o600);
  desktopCliPath = process.platform === "darwin" ? installCliPathAgent(join(paths.bin, "codex"), previous?.desktopCliPath) : undefined;
  const manifest: Manifest = {
    schemaVersion: 1,
    package: PACKAGE,
    activeVersion: version,
    delegateCodex: previous?.delegateCodex ?? null,
    publicSocket: previous?.publicSocket ?? join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "app-server-control", "app-server-control.sock"),
    managedShellFiles,
    shimHashes,
    ...(remoteCodexShim ? { remoteCodexShim } : {}),
    ...(desktopCliPath ? { desktopCliPath } : {}),
    nodeExecutable: process.execPath,
    installedAt: new Date().toISOString(),
  };
  atomicWrite(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`, 0o600);
  } catch (error) {
    if (desktopCliPath) uninstallCliPathAgent(desktopCliPath);
    for (const snapshot of snapshots) {
      if (written.get(snapshot.path) !== (existsSync(snapshot.path) ? sha256(readFileSync(snapshot.path)) : undefined)) continue;
      if (snapshot.content === undefined) rmSync(snapshot.path, { force: true });
      else atomicWrite(snapshot.path, snapshot.content.toString("utf8"), snapshot.mode);
    }
    if (remoteCodexShim && lstatSync(remoteCodexShim.path, { throwIfNoEntry: false })?.isSymbolicLink()
      && resolve(dirname(remoteCodexShim.path), readlinkSync(remoteCodexShim.path)) === resolve(remoteCodexShim.target)) {
      rmSync(remoteCodexShim.path);
      if (remoteCodexShim.backupPath) renameSync(remoteCodexShim.backupPath, remoteCodexShim.path);
    }
    for (const [name, content] of oldShims) {
      if (content) atomicWrite(join(paths.bin, name), content.toString("utf8"), 0o755);
      else rmSync(join(paths.bin, name), { force: true });
    }
    if (oldCurrent) atomicSymlink(oldCurrent, paths.current);
    else rmSync(paths.current, { force: true });
    if (resolve(source) !== resolve(installedRoot) && !previous) rmSync(target, { recursive: true, force: true });
    throw new Error(`Secure activation failed; startup configuration restored: ${String(error)}`);
  }
  // Old versions stay only as long as they are the one just replaced.
  for (const name of readdirSync(paths.versions)) {
    if (name !== version && name !== previous?.activeVersion) rmSync(join(paths.versions, name), { recursive: true, force: true });
  }
  for (const stale of ["staging", "previous"]) rmSync(join(paths.home, stale), { recursive: true, force: true });
  // Do not modify Claude's existing settings, agents, retention or MCP configuration.
  // Read from the activated version: 0.4 hands over to this setup from ~/.ccodex/staging, removed above.
  process.stdout.write(`CCodex ${version} activated. Quit and reopen Codex before starting a test conversation.\n`);
  return 0;
}

export async function update(args: readonly string[]): Promise<number> {
  throw new Error("Registry updates are disabled. Review and install a new local secure bundle.");
}

export async function uninstall(args: readonly string[]): Promise<number> {
  const purge = args.includes("--purge");
  if (purge && !args.includes("--yes")) throw new Error("Purging removes all CCodex state. Confirm with: ccodex uninstall --purge --yes");
  const paths = layout();
  const manifest = readManifest();
  if (!manifest) throw new Error("CCodex is not activated.");
  const pidFile = join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "app-server-daemon", "app-server.pid");
  const managed = reconcileManagedProcess(pidFile);
  if (managed) await stopManagedProcess(pidFile, managed);
  else if (manifest.publicSocket) {
    const owner = reconcileOwnedGateway(manifest.publicSocket);
    if (owner) await stopSocketOwner(manifest.publicSocket, owner);
  }
  for (const path of manifest.managedShellFiles) {
    if (!existsSync(path)) continue;
    const content = readFileSync(path, "utf8");
    if (BLOCK_PATTERN.test(content)) atomicWrite(path, content.replace(BLOCK_PATTERN, ""), statSync(path).mode & 0o777);
  }
  const remote = manifest.remoteCodexShim;
  if (remote && existsSync(remote.path) && lstatSync(remote.path).isSymbolicLink() && resolve(dirname(remote.path), readlinkSync(remote.path)) === resolve(remote.target)) {
    rmSync(remote.path);
    if (remote.backupPath && existsSync(remote.backupPath)) renameSync(remote.backupPath, remote.path);
  }
  if (manifest.desktopCliPath) uninstallCliPathAgent(manifest.desktopCliPath);
  for (const name of Object.keys(manifest.shimHashes)) rmSync(join(paths.bin, name), { force: true });
  for (const path of [paths.current, join(paths.home, "previous"), paths.versions, join(paths.home, "staging"), paths.manifest, paths.bin]) {
    rmSync(path, { recursive: true, force: true });
  }
  if (purge) rmSync(paths.home, { recursive: true, force: true });
  process.stdout.write(purge ? "CCodex uninstalled and state purged.\n" : `CCodex uninstalled; state kept in ${paths.state}.\n`);
  return 0;
}

async function version(command: string, args: readonly string[]): Promise<string> {
  const { stdout, stderr } = await execute(command, args, { timeout: 15_000 });
  return `${stdout}${stderr}`.trim().split("\n")[0]!;
}

/** Minimal health report: runtimes, auth, relay, gateway. */
export async function doctor(config: Config, json: boolean): Promise<number> {
  const check = async (id: string, run: () => Promise<string> | string): Promise<{ id: string; ok: boolean; detail: string }> => {
    try {
      return { id, ok: true, detail: await run() };
    } catch (error) {
      return { id, ok: false, detail: error instanceof Error ? error.message.split("\n")[0]! : String(error) };
    }
  };
  const checks = await Promise.all([
    check("node", () => process.version),
    check("codex", async () => `${config.codex} (${await version(config.codex, ["--version"])})`),
    check("codex-auth", async () => {
      const status = await version(config.codex, ["login", "status"]);
      if (/not logged in/iu.test(status)) throw new Error(`${status} → run: ccodex auth codex`);
      return status;
    }),
    check("claude", async () => `${config.claudeBinary} (${await version(config.claudeBinary, ["--version"])})`),
    check("claude-auth", async () => {
      const { stdout } = await execute(config.claudeBinary, ["auth", "status", "--json"], { timeout: 15_000, env: secureEnvironment(config) }).catch((error: { stdout?: string }) => ({ stdout: error.stdout ?? "{}" }));
      const status = JSON.parse(stdout || "{}") as { loggedIn?: boolean; email?: string; authMethod?: string };
      if (!status.loggedIn) throw new Error("not logged in → run: ccodex auth claude");
      return `${status.email ?? "logged in"} (${status.authMethod ?? "unknown"})`;
    }),
    check("security", () => "local secure fork; native relay and remote control disabled"),
    check("gateway", async () => {
      await probeAppServer(config.publicSocket);
      return `listening on ${config.publicSocket}`;
    }),
    check("install", () => {
      const manifest = readManifest();
      if (!manifest) throw new Error("not activated → run: ccodex setup");
      const remote = manifest.remoteCodexShim;
      // Codex's installer (or Desktop's "Update Codex") puts its own codex there, and SSH sessions skip CCodex.
      if (remote && !(existsSync(remote.path) && isCcodex(remote.path))) throw new Error(`${remote.path} is not CCodex, Desktop over SSH bypasses it → run: ccodex setup`);
      return `${manifest.activeVersion} (${basename(readlinkSync(layout().current))})`;
    }),
  ]);
  if (json) process.stdout.write(`${JSON.stringify({ ok: checks.every((item) => item.ok || item.id === "gateway"), checks }, null, 2)}\n`);
  else for (const item of checks) process.stdout.write(`${item.ok ? "✓" : "✗"} ${item.id}: ${item.detail}\n`);
  return checks.every((item) => item.ok || item.id === "gateway") ? 0 : 1;
}

export async function runManagementCommand(args: readonly string[], config: () => Config): Promise<number | undefined> {
  switch (args[0]) {
    case "secure-network-check": { const status = await verifyNetwork(config()); process.stdout.write(`DNS et HTTPS disponibles pour api.anthropic.com (HTTP ${status}). Aucun compte utilisé.\n`); return 0; }
    case "secure-auth-check": await assertAuthenticated(config()); process.stdout.write("Connexion Claude reconnue sous les protections macOS.\n"); return 0;
    case "secure-check": process.stdout.write(`${await selfCheck(config())}\n`); return 0;
    case "setup": return setup(args.slice(1));
    case "update": return update(args.slice(1));
    case "uninstall": return uninstall(args.slice(1));
    case "doctor": return doctor(config(), args.includes("--json"));
    case "auth":
      if (args[1] === "codex") return delegate(config().codex, ["login"]);
      if (args[1] === "claude") {
        const c = config(); verifyEngine(c);
        const code = await delegate(c.claudeBinary, ["auth", "login"], secureEnvironment(c));
        if (code !== 0) return code;
        await assertAuthenticated(c);
        process.stdout.write("Connexion Claude vérifiée sous les protections macOS.\n");
        return 0;
      }
      throw new Error("Usage: ccodex auth codex|claude");
    default: return undefined;
  }
}

