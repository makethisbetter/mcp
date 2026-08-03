import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MakeThisBetterClient } from "../api/client.js";
import { feedbackReferenceSchema } from "../project-handle.js";
import { runTool } from "./shared.js";

export function registerReopenTool(server: McpServer, client: MakeThisBetterClient): void {
  server.registerTool("reopen", {
    title: "Reopen Feedback",
    description: "Return closed feedback to received for a new work cycle. Available to Account Owners/Admins, Active Pro Members, and assigned Team Members.",
    inputSchema: {
      feedback_id: feedbackReferenceSchema.describe("Project-scoped feedback reference (e.g. acme/FB-42)."),
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ feedback_id }) => runTool(() => client.updateFeedback(feedback_id, { status: "received" })));
}
