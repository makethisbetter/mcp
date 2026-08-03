import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MakeThisBetterClient } from "../api/client.js";
import { feedbackReferenceSchema } from "../project-handle.js";
import { runTool } from "./shared.js";

export function registerArchiveTool(server: McpServer, client: MakeThisBetterClient): void {
  server.registerTool("archive", {
    title: "Archive Feedback",
    description: "Hide one Unclaimed Feedback from active views. The operation is reversible with restore.",
    inputSchema: {
      feedback_id: feedbackReferenceSchema.describe("Project-scoped feedback reference (e.g. acme/FB-42)."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ feedback_id }) => runTool(() => client.archiveFeedback(feedback_id)));
}

export function registerRestoreTool(server: McpServer, client: MakeThisBetterClient): void {
  server.registerTool("restore", {
    title: "Restore Feedback",
    description: "Return one archived Feedback to active received state.",
    inputSchema: {
      feedback_id: feedbackReferenceSchema.describe("Project-scoped feedback reference (e.g. acme/FB-42)."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ feedback_id }) => runTool(() => client.restoreFeedback(feedback_id)));
}
