# Distribution and third-party terms

Project-owned CCodex source is distributed under the MIT License in `LICENSE`.

- OpenAI Codex CLI development dependency `0.156.0` is used and linked under Apache-2.0. It is installed separately for desktop operation.
- Claude Agent SDK `0.3.296` is installed from Anthropic's npm package as an exact runtime dependency; CCodex does not copy or rehost its platform binaries. Use remains subject to Anthropic's applicable legal agreements.
- Each user authenticates locally with their own Codex and Claude Code sessions. CCodex does not collect, proxy, share, or bundle provider credentials.
- Provider authentication and subscription policies can change independently of CCodex. Compatibility with a current login flow is not a guarantee of future provider support.
- `THIRD_PARTY_NOTICES.md` retains upstream notices, including historical relay dependencies. This fork removes the Rust relay; current JavaScript dependency versions and integrity values are recorded in `npm-shrinkwrap.json`. No automatic npm publication is configured.

CCodex is independent and unofficial. It is not affiliated with or endorsed by OpenAI or Anthropic. Codex, Claude, and related marks belong to their respective owners.
