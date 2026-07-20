import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MakeThisBetterClient } from "../api/client.js";
import { runHybridTool } from "./shared.js";

export function registerDetailTool(server: McpServer, client: MakeThisBetterClient): void {
  server.registerTool("detail", {
    title: "Feedback Detail",
    description: [
      "Read the full context of a feedback without changing its status.",
      "Returns the same rich detail as pick: description, screenshot URL,",
      "DOM snapshot, console errors, triage analysis, page URL, browser, and OS.",
      "Use this to inspect a feedback before deciding whether to pick or dismiss it.",
    ].join(" "),
    inputSchema: {
      feedback_id: z.string().min(1).describe("Project-scoped feedback reference (e.g. acme/FB-42)."),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  }, async ({ feedback_id }) => runHybridTool(async () => {
    return client.getFeedback(feedback_id);
  }));
}
