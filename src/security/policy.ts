import { verifyEngine } from "./engine.js";
import { authenticationKeychain } from "./keychain.js";
import { spawn } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Options } from "@anthropic-ai/claude-agent-sdk";
import type { Config } from "../config.js";

export function canonical(path: string): string {
  const absolute = resolve(path);
  if (existsSync(absolute)) return realpathSync(absolute);
  const parent = dirname(absolute);
  if (parent === absolute) throw new Error("Cannot resolve path");
  return join(canonical(parent), absolute.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)));
}

export function within(path: string, root: string): boolean {
  const child = relative(root, path);
  return child === "" || (child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child));
}

export function workspace(path: string, mode: "project" | "personal" = "project"): string {
  const root = canonical(path);
  if (mode === "personal") { if (!lstatSync(root).isDirectory()) throw new Error("Choose an existing folder."); return root; }
  if (within(canonical(homedir()), root) || root.split(sep).some((part) => PROTECTED.test(part)) || !lstatSync(root).isDirectory()) {
    throw new Error("Choose a dedicated project folder, not your home or filesystem root.");
  }
  return root;
}

const PROTECTED = /^(?:\.git|\.claude|\.codex|\.ccodex(?:-secure)?|\.ssh|\.aws|\.azure|\.gnupg|\.npmrc|\.netrc|\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx)|credentials(?:\.json)?)$/iu;

/** Tool-level policy is complemented by Seatbelt, which checks resolved kernel paths. */
export function permittedPath(path: string, cwd: string, mode: "project" | "personal" = "project"): boolean {
  try {
    const root = workspace(cwd, mode);
    if (mode === "personal") { canonical(resolve(root, path)); return true; }
    const absolute = resolve(root, path);
    if (!within(absolute, root) || relative(root, absolute).split(sep).some((part) => PROTECTED.test(part))) return false;
    let cursor = absolute;
    while (cursor !== root) {
      const stat = lstatSync(cursor, { throwIfNoEntry: false });
      if (stat?.isSymbolicLink() || (stat?.isFile() && stat.nlink > 1)) return false;
      const parent = dirname(cursor);
      if (parent === cursor) return false;
      cursor = parent;
    }
    return within(canonical(absolute), root);
  } catch { return false; }
}

export function toolDecision(name: string, input: Record<string, unknown>, cwd: string, readOnly: boolean, mode: "project" | "personal" = "project"): "deny" | "ask" | "pass" {
  if (name === "AskUserQuestion" || name === "TodoWrite" || name === "ExitPlanMode") return "pass";
  if (mode === "personal") {
    if (name === "mcp__artifacts__publish_html") return "pass";
    if (["Bash", "TaskStop"].includes(name)) return readOnly ? "deny" : "ask";
    if (["WebFetch", "WebSearch"].includes(name)) return "ask";
    if (name === "TaskOutput") return "pass";
  }
  if (name === "mcp__secure__shell") return input.dangerouslyDisableSandbox || readOnly ? "deny" : "ask";
  if (name === "Bash") return "deny";
  const read = ["Read", "Glob", "Grep"].includes(name);
  const write = ["Edit", "Write", "NotebookEdit"].includes(name);
  if (!read && !write) return "deny";
  if (write && readOnly) return "deny";
  const path = input.file_path ?? input.notebook_path ?? input.path ?? cwd;
  if (typeof path !== "string" || !permittedPath(path, cwd, mode)) return "deny";
  return write ? "ask" : "pass";
}

export function secureEnvironment(config: Config): Record<string, string> {
  const temporary = join(config.dataDir, "tmp");
  mkdirSync(temporary, { recursive: true, mode: 0o700 });
  mkdirSync(config.claudeHome, { recursive: true, mode: 0o700 });
  return {
    HOME: homedir(), PATH: config.accessMode === "personal" ? process.env.PATH ?? "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" : "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    LANG: "en_US.UTF-8", TERM: "dumb", TMPDIR: temporary, CLAUDE_CODE_TMPDIR: temporary,
    CLAUDE_CONFIG_DIR: config.claudeHome, CLAUDE_SECURESTORAGE_CONFIG_DIR: config.claudeHome,
    CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: "1",
    DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1", DISABLE_AUTOUPDATER: "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL: "1", ...(config.accessMode === "personal" ? {} : { CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1" }), CLAUDE_CODE_DISABLE_CRON: "1",
    CLAUDE_CODE_ENTRYPOINT: "sdk-ts", CLAUDE_AGENT_SDK_VERSION: "0.3.296", CLAUDE_CODE_SDK_READS_SESSION_STATE: "1",
  };
}

const quote = (value: string) => JSON.stringify(value);
const subpath = (path: string) => `(subpath ${quote(canonical(path))})`;

/** Outer boundary for the native Claude process, including its direct file tools. */
export function seatbeltProfile(readRoots: readonly string[], writeRoots: readonly string[], protectedRoots: readonly string[], _secretRoots: readonly string[] = [], network = true, keychain = true, authenticationFiles: readonly string[] = []): string {
  // Character classes avoid ambiguity in SBPL regex escaping. Applied to all aliases of a path.
  const secretRules = `(deny file-read* file-write* (require-all (regex #"/([.]git|[.]claude|[.]codex|[.]ccodex|credentials([.]json)?|[.]ssh|[.]aws|[.]azure|[.]gnupg|[.]npmrc|[.]netrc|[.]env([.][^/]*)?|[^/]+[.](pem|key|p12|pfx))(/|$)") (require-not (require-any (literal "/private/etc/ssl/cert.pem") (literal "/etc/ssl/cert.pem")))))`;
  return `(version 1)
(deny default)
(allow process-fork process-exec sysctl-read mach-lookup ipc-posix-shm)
(allow signal (target same-sandbox))
${keychain ? "(allow process-info*)" : ""}
(allow file-read-metadata file-test-existence)
(allow file-read-data file-write-data (subpath "/dev/fd"))
(allow file-read* (literal "/") (literal ${quote(join(homedir(), ".CFUserTextEncoding"))}))
(allow file-read* ${["/System", "/usr", "/bin", "/sbin", "/Library", "/opt/homebrew", "/usr/local", "/private/etc", "/private/var/db/timezone", "/dev", ...readRoots].map(subpath).join(" ")})
(allow file-write* (literal "/dev/null") (literal "/dev/tty") ${writeRoots.map(subpath).join(" ")})
${protectedRoots.length ? `(deny file-write* ${protectedRoots.map(subpath).join(" ")})` : ""}
${network ? `(allow file-read-data (literal "/private/var/run/resolv.conf"))
(allow network-outbound (literal "/private/var/run/mDNSResponder") (remote tcp "*:443"))` : `(deny network*)`}
${keychain ? authenticationFiles.length ? `(allow file-read-data ${authenticationFiles.map((path) => `(literal ${quote(canonical(path))})`).join(" ")})` : "" : "(deny mach-lookup)"}
${secretRules}
${_secretRoots.map((root) => `(deny file-read* file-write* (require-all ${subpath(root)} (regex #"/[.]ccodex-secure(/|$)")))`).join("\n")}
`;
}

export function secureOptions(config: Config, cwd?: string, readOnly = true): Options {
  const root = cwd ? workspace(cwd, config.accessMode) : undefined;
  const runtime = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
  const privatePaths = [config.claudeHome, config.dataDir];
  const protectedPaths = root ? [".git", ".claude", ".env", ".env.local", ".env.production"].map((p) => join(root, p)) : [];
  return {
    ...(config.accessMode === "personal" ? { additionalDirectories: [homedir(), ...["/Volumes", "/Users/Shared"].filter(existsSync)] } : {}),
    settingSources: [], strictMcpConfig: true, mcpServers: {}, plugins: [], skills: [],
    settings: { syncClaudeAiSkills: false, syncClaudeAiPlugins: false },
    env: secureEnvironment(config),
    allowDangerouslySkipPermissions: false,
    // The native Bash tool is disabled. Our host-side shell tool has its own non-networked Seatbelt process.
    sandbox: { enabled: false },
    spawnClaudeCodeProcess: (options) => {
      if (config.accessMode === "personal") {
        verifyEngine(config);
        return spawn(options.command, options.args, { cwd: options.cwd, env: { ...secureEnvironment(config), HOME: options.env.HOME ?? homedir() }, signal: options.signal, stdio: ["pipe", "pipe", "pipe"] });
      }
      if (process.platform !== "darwin" || !existsSync("/usr/bin/sandbox-exec")) throw new Error("CCodex Secure requires macOS Seatbelt; refusing an unsandboxed launch.");
      verifyEngine(config);
      const binary = realpathSync(config.claudeBinary);
      const readRoots = [runtime, binary, ...privatePaths, ...(root ? [root] : [])];
      const profile = seatbeltProfile(readRoots, [...privatePaths, ...(root && !readOnly ? [root] : [])], protectedPaths, root ? [root] : [], true, true, authenticationKeychain(options.env.HOME ?? homedir()));
      return spawn("/usr/bin/sandbox-exec", ["-p", profile, options.command, ...options.args], {
        cwd: options.cwd, env: { ...secureEnvironment(config), HOME: options.env.HOME ?? homedir() }, signal: options.signal, stdio: ["pipe", "pipe", "pipe"],
      });
    },
  };
}
