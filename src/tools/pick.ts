import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MakeThisBetterClient } from "../api/client.js";
import { runHybridTool } from "./shared.js";

export function registerPickTool(server: McpServer, client: MakeThisBetterClient): void {
  server.registerTool("pick", {
    title: "Pick Feedback",
    description: [
      "Claim a feedback and start working on it.",
      "Sets status to in_progress and returns the full context needed to fix it:",
      "description, screenshot URL, DOM snapshot, console errors, triage analysis,",
      "page URL, browser, and OS.",
      "One call = claim + read. Use 'detail' for read-only inspection first.",
    ].join(" "),
    inputSchema: {
      feedback_id: z.string().min(1).describe("Feedback prefix ID (e.g. fdb_xxx)."),
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ feedback_id }) => runHybridTool(async () => {
    await client.updateFeedback(feedback_id, { status: "in_progress" });
    return client.getFeedback(feedback_id);
  }));
}
