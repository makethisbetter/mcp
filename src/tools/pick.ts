import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MakeThisBetterClient } from "../api/client.js";
import { feedbackReferenceSchema } from "../project-handle.js";
import { runHybridTool } from "./shared.js";

export function registerPickTool(server: McpServer, client: MakeThisBetterClient): void {
  server.registerTool("pick", {
    title: "Pick Feedback",
    description: [
      "Claim a feedback and start working on it.",
      "Sets status to in_progress and returns the full context needed to fix it:",
      "description, DOM snapshot, console errors, triage analysis, page URL, browser, and OS.",
      "It also returns the reporter's own evidence: annotations (where they pointed on the page,",
      "with the element name, text and selector under each mark), breadcrumbs (what they did on",
      "the way there), and ai_clarification_messages (the AI's follow-up questions and their",
      "answers). Read these before interpreting the report — an empty array means none was",
      "recorded, so do not assume there is nothing to look at without checking.",
      "screen_width, screen_height and reporter_language describe the viewport and language to",
      "reproduce in.",
      "ai_triage_status says whether triage ran: pending, processing, completed, failed or",
      "credits_exhausted. Check it before concluding a feedback was never triaged — a failed",
      "triage also leaves ai_structured_summary empty, and ai_triage_error says why it failed.",
      "ai_clarification_status says whether a clarification exchange is idle, active or completed.",
      "screenshot_url and recording_url point to the captured attachments when present;",
      "screenshot_attached and recording_attached are their availability flags.",
      "When another team member already owns the feedback, set takeover to true to take it over.",
      "One call = claim + read. Use 'detail' for read-only inspection first.",
    ].join(" "),
    inputSchema: {
      feedback_id: feedbackReferenceSchema.describe("Project-scoped feedback reference (e.g. acme/FB-42)."),
      takeover: z.boolean().default(false).describe("Force takeover when another team member already owns this feedback."),
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ feedback_id, takeover }) => runHybridTool(async () => {
    await client.updateFeedback(feedback_id, { status: "in_progress", takeover: takeover ?? false });
    return client.getFeedback(feedback_id);
  }));
}
