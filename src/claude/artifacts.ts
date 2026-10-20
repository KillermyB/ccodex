import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { atomicWrite } from "../management/files.js";
import { visualizationFolder } from "./visualize.js";

export function publishArtifact(threadId: string, html: string, title: string): { path: string; directive: string } {
  const folder = visualizationFolder(threadId);
  if (!folder) throw new Error("Start a new Codex conversation to publish an inline animation preview.");
  if (Buffer.byteLength(html, "utf8") > 1_000_000) throw new Error("Use an HTML fragment smaller than 1 MB.");
  if (/<(?:!doctype|html|head|body)\b/iu.test(html)) throw new Error("Provide an HTML fragment with its style/script elements, without doctype/html/head/body wrappers.");
  const label = title.replace(/[\u0000-\u001f\u007f]/gu, " ").trim().slice(0, 100) || "Animation";
  const slug = label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 60) || "animation";
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const path = join(folder, `${slug}-${randomUUID().slice(0, 8)}.html`);
  atomicWrite(path, html, 0o600);
  return { path, directive: `::codex-inline-vis{path=${JSON.stringify(path)} title=${JSON.stringify(label)}}` };
}

export function artifactServer(threadId: string) {
  return createSdkMcpServer({ name: "artifacts", version: "1.0.0", alwaysLoad: true,
    tools: [tool("publish_html", "Display an interactive animation, motion test or interface preview directly in this Codex conversation. Supply an HTML fragment (no html/head/body/doctype), with inline style/script as needed. Theme colors should use CSS variables with fallbacks. Browser requests are limited by Codex's preview sandbox; use self-contained CSS/JS or the allowed CDNs cdnjs.cloudflare.com, esm.sh, cdn.jsdelivr.net, unpkg.com, fonts.googleapis.com, fonts.gstatic.com, fonts.bunny.net. Do not use fetch/XHR. This creates only response content in this chat's preview folder. For full project apps use native Bash to run a preview server and provide its local URL.",
      { html: z.string().min(1).max(1_000_000), title: z.string().min(1).max(100) }, async ({ html, title }) => {
        try {
          const result = publishArtifact(threadId, html, title);
          return { content: [{ type: "text" as const, text: `Preview saved. Include this exact directive on its own line in your next assistant response so Codex renders it:\n${result.directive}\nDo not turn it into a code fence or a download link.` }] };
        } catch (error) { return { content: [{ type: "text" as const, text: String((error as Error).message) }], isError: true }; }
      })],
  });
}
