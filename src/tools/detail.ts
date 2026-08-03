import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MakeThisBetterClient } from "../api/client.js";
import { feedbackReferenceSchema } from "../project-handle.js";
import { runHybridTool } from "./shared.js";

export function registerDetailTool(server: McpServer, client: MakeThisBetterClient): void {
  server.registerTool("detail", {
    title: "Feedback Detail",
    description: [
      "Read the full context of a feedback without changing its status.",
      "Returns the same rich detail as pick: description, DOM snapshot, console errors,",
      "triage analysis, page URL, browser, and OS.",
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
      "Use this to inspect a feedback before deciding whether to pick, ready, decline, or mark it duplicate.",
    ].join(" "),
    inputSchema: {
      feedback_id: feedbackReferenceSchema.describe("Project-scoped feedback reference (e.g. acme/FB-42)."),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  }, async ({ feedback_id }) => runHybridTool(async () => {
    return client.getFeedbackIncludingArchived(feedback_id);
  }));
}
