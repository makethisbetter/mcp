import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MakeThisBetterClient } from "../api/client.js";
import { feedbackReferenceSchema } from "../project-handle.js";
import { runTool } from "./shared.js";

export function registerReadyTool(server: McpServer, client: MakeThisBetterClient): void {
  server.registerTool("ready", {
    title: "Mark Feedback Ready",
    description: [
      "Save the factual implementation summary and move in-progress Feedback to pending_release.",
      "Call this only after focused verification passes, the implementation is committed, and",
      "the reachable Git history contains the exact `Feedback: <handle/FB-n>` commit trailer.",
      "This tool does not inspect Git, release the Feedback, or notify the Reporter.",
    ].join(" "),
    inputSchema: {
      feedback_id: feedbackReferenceSchema.describe("Project-scoped feedback reference (e.g. acme/FB-42)."),
      resolution_summary: z.string().trim().min(1).describe("Factual internal summary of what changed."),
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ feedback_id, resolution_summary }) => runTool(
    () => client.readyFeedback(feedback_id, resolution_summary),
  ));
}
