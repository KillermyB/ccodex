import { accessSync, constants, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fileDigest } from "./engine.js";

/** Only the reviewed, bundled executable is accepted. No environment override or registry lookup. */
export function remoteRelayBinary(): string {
  if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("The bundled remote relay requires macOS Apple silicon.");
  const pin = JSON.parse(readFileSync(new URL("../../config/remote-relay.json", import.meta.url), "utf8")) as { binary_sha256: string };
  const binary = fileURLToPath(new URL("../bin/ccodex-relay", import.meta.url));
  verifyRelayFile(binary, pin.binary_sha256);
  return binary;
}

export function verifyRelayFile(binary: string, expected: string): void {
  accessSync(binary, constants.X_OK);
  if (!/^[a-f0-9]{64}$/u.test(expected) || fileDigest(binary) !== expected) throw new Error("Remote relay integrity check failed.");
}

export function remoteRelayEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { RUST_LOG: "warn" };
  for (const name of ["HOME", "PATH", "LANG", "LC_ALL", "TMPDIR", "CODEX_HOME", "CODEX_SQLITE_HOME", "SSL_CERT_FILE", "SSL_CERT_DIR"]) {
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }
  return environment;
}
