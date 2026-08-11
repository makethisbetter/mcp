import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MakeThisBetterClient } from "../api/client.js";
import { feedbackReferenceSchema } from "../project-handle.js";
import { runTool } from "./shared.js";

export function registerDeclineTool(server: McpServer, client: MakeThisBetterClient): void {
  server.registerTool("decline", {
    title: "Decline Feedback",
    description: "Close reviewed feedback as not planned without notifying the Reporter.",
    inputSchema: {
      feedback_id: feedbackReferenceSchema.describe("Project-scoped feedback reference (e.g. acme/FB-42)."),
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ feedback_id }) => runTool(() => client.updateFeedback(feedback_id, {
    status: "closed",
    close_reason: "not_planned",
  })));
}
