import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MakeThisBetterClient } from "../api/client.js";
import { feedbackReferenceSchema } from "../project-handle.js";
import { runTool } from "./shared.js";

export function registerRespondTool(server: McpServer, client: MakeThisBetterClient): void {
  server.registerTool("respond", {
    title: "Respond and Close Feedback",
    description: [
      "Send the final user-confirmed One-way Reporter Notice and close received Feedback.",
      "Do not generate and send a response autonomously. The body must be the user's final text.",
      "The optional subject defaults to the Reporter Language when omitted.",
    ].join(" "),
    inputSchema: {
      feedback_id: feedbackReferenceSchema.describe("Project-scoped feedback reference (e.g. acme/FB-42)."),
      body: z.string().min(1).describe("Final user-confirmed response body."),
      subject: z.string().min(1).optional().describe("Email subject. Omit to use the Reporter Language default."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ feedback_id, body, subject }) => runTool(
    () => client.respondFeedback(feedback_id, { body, subject }),
  ));
}
