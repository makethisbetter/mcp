import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MakeThisBetterClient } from "../api/client.js";
import { feedbackReferenceSchema } from "../project-handle.js";
import { runTool } from "./shared.js";

export function registerDuplicateTool(server: McpServer, client: MakeThisBetterClient): void {
  server.registerTool("duplicate", {
    title: "Mark Feedback Duplicate",
    description: "Close feedback as a duplicate and notify the Reporter after the canonical response is prepared.",
    inputSchema: {
      feedback_id: feedbackReferenceSchema.describe("Project-scoped feedback reference (e.g. acme/FB-42)."),
      canonical_feedback_id: feedbackReferenceSchema.describe("Canonical Feedback in the same Project."),
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ feedback_id, canonical_feedback_id }) => runTool(() => client.updateFeedback(feedback_id, {
    status: "closed",
    close_reason: "duplicate",
    canonical_feedback_id,
  })));
}
