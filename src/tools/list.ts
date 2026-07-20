import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MakeThisBetterClient } from "../api/client.js";
import type { Feedback } from "../api/types.js";
import { runTool } from "./shared.js";

export function registerListTool(server: McpServer, client: MakeThisBetterClient): void {
  server.registerTool("list", {
    title: "List Feedbacks",
    description: [
      "Browse feedbacks waiting for attention.",
      "Use this as the starting point to find feedbacks to work on.",
      "Returns a lean summary of each feedback (ID, status, type, priority, truncated description, last update).",
      "Use 'detail' or 'pick' to read the full context of a feedback.",
      "Filter by status: received (new), in_progress (claimed), pending_release (shipped but unreleased), closed (done).",
      "Filter by type: bug, feature, improvement, question.",
    ].join(" "),
    inputSchema: {
      project_handle: z.string().min(3).describe("Project handle."),
      status: z.enum(["received", "in_progress", "pending_release", "closed"]).optional()
        .describe("Filter by feedback status."),
      type: z.enum(["bug", "feature", "improvement", "question"]).optional()
        .describe("Filter by feedback type."),
      limit: z.number().int().positive().max(100).default(20)
        .describe("Maximum number of results. Default 20."),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  }, async ({ project_handle, status, type, limit }) => runTool(async () => {
    const feedbacks = await client.listFeedbacks({ project_handle, status, feedback_type: type, limit });
    return feedbacks.map(summarize);
  }));
}

const DESCRIPTION_PREVIEW_LENGTH = 80;

function summarize(f: Feedback) {
  return {
    id: f.id,
    reference: f.reference,
    status: f.status,
    feedback_type: f.feedback_type,
    priority: f.priority,
    description: f.description?.slice(0, DESCRIPTION_PREVIEW_LENGTH) ?? null,
    updated_at: f.updated_at,
  };
}
