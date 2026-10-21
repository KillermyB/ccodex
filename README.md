# CCodex — Claude Code in OpenAI Codex for macOS

Run **Claude Code inside the OpenAI Codex desktop interface** on **macOS Apple Silicon**, with native tools, MCP servers, skills, plugins, remote pairing and interactive HTML previews.

**Version: `0.7.0-personal.2` · Experimental.**

Fork of [gkorepanov/ccodex](https://github.com/gkorepanov/ccodex), created by George Korepanov, based on [`479aa13`](https://github.com/gkorepanov/ccodex/commit/479aa13d66c9b54685348d0f7b9bdc1c7445a7bf). The [MIT license](LICENSE) is preserved. Independent project, not affiliated with OpenAI or Anthropic.

## Features

| Feature | Personal Mac mode | Isolated project mode |
|---|---|---|
| Files and commands | Native Claude tools, Bash, Git, cross-folder and network access | Selected project, dedicated shell under Seatbelt, no network |
| Permissions | Native Standard, Full Access, auto and Plan modes; tool-controlled read-only access | Full Access refused; project restrictions preserved |
| Extensions | User, project and local skills, agents, plugins, hooks and MCP | External loading disabled |
| Delegation | Claude subagents and Codex MCP tools | Disabled |
| Conversation models | Switch between GPT and Claude with history | Provider switching refused |
| Interactive previews | `mcp__artifacts__publish_html` and the Codex visualization skill | Disabled |

Personal mode runs with the macOS account's permissions. Native permissions apply; no additional Seatbelt isolation is added to the engine. Project configurations can execute hooks and MCP servers. User extensions are made available to the dedicated Claude connection without copying its login credentials.

## Remote access

The upstream relay supports enable/disable controls, status reporting and pairing with a remote device. Claude and Codex sessions use the same local gateway.

- Enable it in Codex Remote settings or **CCodex Personnel → Activer l’accès à distance**.
- Authentication and pairing use the upstream Codex transport; no public TCP server is added.
- `@gkorepanov/ccodex-relay-darwin-arm64@0.5.11` is bundled with a pinned checksum. No arbitrary binary is searched for on PATH.
- Sources and provenance: [Rust relay](relay), [version and checksums](config/remote-relay.json), [binary verification](src/security/relay.ts).

Codex SSH retains its managed launcher. macOS SSH and Screen Sharing services are not changed.

## Interactive animation previews

`mcp__artifacts__publish_html` publishes an HTML/CSS/JavaScript fragment in the conversation folder and returns a Codex display directive.

- Maximum **1,000,000 bytes**, without `doctype`, `html`, `head` or `body` wrappers.
- Requires a UUIDv7 conversation ID; publishing is available as response content in read-only mode.
- The Codex visualization sandbox blocks API requests from the fragment; only static assets from allowed CDNs can load.
- Full applications use a local server and a URL to open.

Example: “Show an inline transition demo with play/pause and a speed control.”

## Titles, diagnostics and updates

- **GPT titles:** the first message of a new conversation is sent to the Codex title model, including Claude conversations. Set `rename_prompt = ""` to disable this.
- **RPC captures:** exchanges can be recorded locally. Captures are enabled in the supplied personal settings; set `rpc_capture = false` to disable them. These files may contain conversation text and sensitive data.
- **Updates:** this fork uses its own GitHub releases, verifying the archive checksum and a manifest of every file. Extraction rejects links and path traversal. Automatic checks run at most every six hours when starting an interface; set `auto_update = false` to disable them. New versions load after closing and reopening Codex.
- Personal mode follows the native Claude engine installation. Pinning an older engine version remains specific to isolated project mode.

Settings live in `~/.ccodex-secure/config.toml`. [Example configuration](examples/config.toml).

## Installation

Requires an Apple Silicon Mac, Node.js `>=22.13 <27`, the official Codex desktop app and CLI, and a separately installed official Claude Code binary. SDK: `0.3.296`; locally validated engine: `2.1.304`.

1. Download the macOS package from [this fork’s releases](https://github.com/KillermyB/ccodex/releases).
2. Quit Codex, open **CCodex Personnel**, then choose **Installer**.
3. Choose **Connecter Claude** and complete the official browser sign-in.
4. Verify connectivity, reopen Codex and select a Claude model.

The app is locally signed, without Apple notarization. Installation preserves the signed Codex app and adds reversible launchers. Uninstalling retains conversations and the dedicated connection. The technical package name `@gkorepanov/ccodex` is preserved for paths; this fork is not published on npm.

## Validation and limitations

**37 dedicated tests passed locally:** permissions, cross-project files, Git, local server, extensions, MCP delegation, pairing lifecycle with a mock relay, crash recovery and update archive validation. [Tests](tests/security) · [macOS CI](.github/workflows/ci.yml).

```sh
npm ci --ignore-scripts --omit=optional
npm run check
npm run check:public-tree
npm test
# Explicit offline step after compilation:
node scripts/prepare-remote-relay.mjs /path/to/ccodex-relay-darwin-arm64-0.5.11.tgz
```

The preparation step verifies the archive and binary; it does not download or execute them. Activation requires a complete runtime with its `BUNDLE-SHA256.json` manifest.

- Real phone pairing and the display of a Claude-generated preview still need confirmation in actual use. Tests do not send a model message through a user account.
- The relay is the upstream precompiled binary, checksum-verified but not independently rebuilt. Security advisories for dependencies in its Rust lockfile still apply; those dependencies are not patched in this version.
- Visual screen/mouse control is not integrated. Finder, Spotlight and AppleScript depend on macOS permissions.
- Historical Linux build scripts, `0.4 → 0.5` migration scripts and release preparation sources are restored. They do not run automatically on user data. Publication to the original author’s npm account is not enabled; this fork distributes through its GitHub releases.
