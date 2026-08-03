import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MakeThisBetterClient } from "../api/client.js";
import type { Feedback } from "../api/types.js";
import { projectHandleSchema } from "../project-handle.js";
import { runTool } from "./shared.js";

export function registerListTool(server: McpServer, client: MakeThisBetterClient): void {
  server.registerTool("list", {
    title: "List Feedbacks",
    description: [
      "Browse feedbacks waiting for attention.",
      "Use this as the starting point to find feedbacks to work on.",
      "Returns a lean summary of each feedback (ID, status, labels, priority, truncated description, last update).",
      "Use 'detail' or 'pick' to read the full context of a feedback.",
      "Filter by status: received (new), in_progress (claimed), pending_release (shipped but unreleased), closed (done).",
      "Filter by one project label. Labels are AI-managed and shown on feedback details.",
    ].join(" "),
    inputSchema: {
      project_handle: projectHandleSchema.describe("Project handle."),
      status: z.enum(["received", "in_progress", "pending_release", "closed"]).optional()
        .describe("Filter by feedback status."),
      label: z.string().min(1).max(50).optional()
        .describe("Filter by one project label."),
      priority: z.enum(["critical", "high", "medium", "low"]).optional()
        .describe("Filter by priority."),
      archived: z.boolean().default(false)
        .describe("List archived Feedback. Cannot be combined with status."),
      limit: z.number().int().positive().max(100).default(20)
        .describe("Maximum number of results. Default 20."),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  }, async ({ project_handle, status, label, priority, archived, limit }) => runTool(async () => {
    if (archived && status) {
      throw new Error("archived and status cannot be used together");
    }

    const params = { project_handle, status, label, priority, limit };
    const feedbacks = archived
      ? await client.listArchivedFeedbacks({ project_handle, label, priority, limit })
      : await client.listFeedbacks(params);
    return feedbacks.map(summarize);
  }));
}

const DESCRIPTION_PREVIEW_LENGTH = 80;

function summarize(f: Feedback) {
  const summary = {
    id: f.id,
    reference: f.reference,
    status: f.status,
    labels: f.labels,
    priority: f.priority,
    description: f.description?.slice(0, DESCRIPTION_PREVIEW_LENGTH) ?? null,
    updated_at: f.updated_at,
  };
  return f.archived_at ? {...summary, archived_at: f.archived_at} : summary;
}
