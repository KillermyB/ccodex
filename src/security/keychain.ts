import { execFileSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";

/** Accept one existing keychain database in the user's standard keychain directory. */
export function trustedKeychainPath(candidate: string, home: string): string | undefined {
  try {
    if (!isAbsolute(candidate) || !/\.keychain(?:-db)?$/u.test(candidate)) return undefined;
    const root = realpathSync(join(home, "Library", "Keychains"));
    const path = realpathSync(candidate);
    const child = relative(root, path);
    const info = lstatSync(path);
    if (!child || child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child) || !info.isFile() || info.nlink !== 1) return undefined;
    return path;
  } catch { return undefined; }
}

/** Read only the default keychain's path, never any entry or credential. */
export function authenticationKeychain(home = homedir()): string[] {
  if (process.platform !== "darwin") return [];
  try {
    const output = execFileSync("/usr/bin/security", ["default-keychain", "-d", "user"], {
      encoding: "utf8", timeout: 5_000, maxBuffer: 16_384,
      env: { HOME: home, PATH: "/usr/bin:/bin", LANG: "en_US.UTF-8" }, stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const candidate: unknown = JSON.parse(output);
    if (typeof candidate !== "string") return [];
    const path = trustedKeychainPath(candidate, home);
    return path ? [path] : [];
  } catch { return []; }
}
