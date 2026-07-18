import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MakeThisBetterClient } from "../api/client.js";
import { runTool } from "./shared.js";

export function registerDismissTool(server: McpServer, client: MakeThisBetterClient): void {
  server.registerTool("dismiss", {
    title: "Dismiss Feedback",
    description: [
      "Decline a feedback you have reviewed and will not fix.",
      "Sets status to closed with close_reason not_planned (or duplicate).",
      "Use when a feedback is a duplicate, out of scope, or not actionable.",
    ].join(" "),
    inputSchema: {
      feedback_id: z.string().min(1).describe("Feedback prefix ID (e.g. fdb_xxx)."),
      close_reason: z.enum(["not_planned", "duplicate"]).optional()
        .describe("Close reason label. Defaults to not_planned."),
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ feedback_id, close_reason }) => runTool(async () => {
    return client.updateFeedback(feedback_id, {
      status: "closed",
      labels: { close_reason: close_reason ?? "not_planned" },
    });
  }));
}
