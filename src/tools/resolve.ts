import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MakeThisBetterClient } from "../api/client.js";
import { runTool } from "./shared.js";

export function registerResolveTool(server: McpServer, client: MakeThisBetterClient): void {
  server.registerTool("resolve", {
    title: "Resolve Feedback",
    description: [
      "Mark a feedback as shipped.",
      "Sets status to closed with close_reason shipped.",
      "Optionally links a pull request URL to the feedback.",
      "Call this after you have fixed the issue and the PR is merged.",
      "Triggers a notification to the reporter.",
    ].join(" "),
    inputSchema: {
      feedback_id: z.string().min(1).describe("Project-scoped feedback reference (e.g. acme/FB-42)."),
      pr_url: z.string().url().optional()
        .describe("Pull request URL to link to this feedback."),
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ feedback_id, pr_url }) => runTool(async () => {
    return client.updateFeedback(feedback_id, {
      status: "closed",
      labels: {
        close_reason: "shipped",
        ...(pr_url ? { pr_url } : {}),
      },
    });
  }));
}
