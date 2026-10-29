import { DESKTOP_RUNTIME_PATHS } from "./nativeRuntime.js";

const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";

/** The startup policy check reaches the official engine even if Node or this fork is broken. */
export function entryShim(node: string): string {
  return `#!/bin/sh
set -eu
CCODEX_USER_HOME=\${HOME:-}
CCODEX_NATIVE_REQUEST=0
for CCODEX_ARG in "$@"; do
  case "$CCODEX_ARG" in --print-startup-*|--startup-*) CCODEX_NATIVE_REQUEST=1 ;; esac
done
if [ "$CCODEX_NATIVE_REQUEST" = 1 ]; then
  if [ -n "\${CCODEX_DESKTOP_APP:-}" ]; then
    CCODEX_APP_ROOTS="$CCODEX_DESKTOP_APP"
  else
    CCODEX_APP_ROOTS=""
  fi
  # Quoted roots keep app names and user directories intact. No eval or PATH lookup.
  for CCODEX_APP in "\${CCODEX_APP_ROOTS:-/Applications/ChatGPT.app}" "\${CCODEX_APP_ROOTS:-/Applications/Codex.app}" "\${CCODEX_APP_ROOTS:-$CCODEX_USER_HOME/Applications/ChatGPT.app}" "\${CCODEX_APP_ROOTS:-$CCODEX_USER_HOME/Applications/Codex.app}"; do
    for CCODEX_SUFFIX in ${DESKTOP_RUNTIME_PATHS.map(quote).join(" ")}; do
      CCODEX_NATIVE="$CCODEX_APP/$CCODEX_SUFFIX"
      if [ -x "$CCODEX_NATIVE" ] && [ ! -d "$CCODEX_NATIVE" ] && [ ! "$CCODEX_NATIVE" -ef "$0" ] && [ ! "$CCODEX_NATIVE" -ef "\${CCODEX_HOME:-$CCODEX_USER_HOME/.ccodex-secure}/bin/codex" ] && [ ! "$CCODEX_NATIVE" -ef "\${CCODEX_HOME:-$CCODEX_USER_HOME/.ccodex-secure}/bin/ccodex" ]; then
        unset CODEX_CLI_PATH CCODEX_SHIM_ACTIVE
        exec "$CCODEX_NATIVE" "$@"
      fi
    done
  done
fi
if [ "\${CCODEX_SHIM_ACTIVE:-}" = 1 ]; then
  printf '%s\\n' 'CCodex recursion guard: managed shim attempted to invoke itself.' >&2
  exit 70
fi
CCODEX_SHIM_ACTIVE=1
CCODEX_HOME=\${CCODEX_HOME:-"$HOME/.ccodex-secure"}
CCODEX_NODE=${quote(node)}
if [ ! -x "$CCODEX_NODE" ]; then
  for CCODEX_CANDIDATE in /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "$CCODEX_CANDIDATE" ]; then CCODEX_NODE="$CCODEX_CANDIDATE"; break; fi
  done
fi
if [ ! -x "$CCODEX_NODE" ]; then
  CCODEX_NODE=$(command -v node 2>/dev/null || true)
fi
if [ -z "$CCODEX_NODE" ] || [ ! -x "$CCODEX_NODE" ]; then
  printf '%s\\n' 'CCodex Node runtime is missing. Reinstall Node.js, then rerun the local CCodex installer.' >&2
  exit 69
fi
export CCODEX_SHIM_ACTIVE CCODEX_HOME
exec "$CCODEX_NODE" "$CCODEX_HOME/current/node_modules/@gkorepanov/ccodex/dist/cli/main.js" "$@"
`;
}
