import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MakeThisBetterClient } from "../api/client.js";
import { projectHandleSchema } from "../project-handle.js";
import { errorToolResult, runTool } from "./shared.js";

export function registerProjectListTool(server: McpServer, client: MakeThisBetterClient): void {
  server.registerTool("project_list", {
    title: "List Projects",
    description: [
      "Browse the projects (feedback boards) in your account.",
      "Returns id, name, domain, feedback visibility, feedback count, and timestamps for each project.",
      "Use 'project_show' to read the widget API key and board URL for one project,",
      "or use 'project_create' and 'project_update' to manage them when your role allows it.",
    ].join(" "),
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  }, async () => runTool(async () => client.listProjects()));
}

export function registerProjectShowTool(server: McpServer, client: MakeThisBetterClient): void {
  server.registerTool("project_show", {
    title: "Project Detail",
    description: [
      "Read full details for one project, including its widget API key and board URL.",
      "Also returns the identity-verification signing secret for account Owners/Admins and Active Pro Members.",
      "Use 'project_list' to find the project handle first.",
    ].join(" "),
    inputSchema: {
      id: projectHandleSchema.describe("Project handle (e.g. acme)."),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  }, async ({ id }) => runTool(async () => client.getProject(id)));
}

export function registerProjectCreateTool(server: McpServer, client: MakeThisBetterClient): void {
  server.registerTool("project_create", {
    title: "Create Project",
    description: [
      "Create a new project (feedback board) in your account.",
      "Returns the created project's widget API key and signing secret — save these now,",
      "Account Owners/Admins and Active Pro Members can create projects.",
      "domain is required: the widget only runs on the project's own domain.",
    ].join(" "),
    inputSchema: {
      name: z.string().min(1).describe("Project name."),
      handle: projectHandleSchema.describe("Globally unique project handle."),
      domain: z.string().min(1).describe("Domain the widget will run on (required)."),
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ name, handle, domain }) => runTool(async () => client.createProject({ name, handle, domain })));
}

export function registerProjectUpdateTool(server: McpServer, client: MakeThisBetterClient): void {
  server.registerTool("project_update", {
    title: "Update Project",
    description: [
      "Update mutable settings for an existing project.",
      "Account Owners/Admins and Active Pro Members can update projects; Team Members cannot.",
      "The project handle is immutable. Supply one or more of name, domain, or ai_context.",
    ].join(" "),
    inputSchema: {
      id: projectHandleSchema.describe("Project handle (e.g. acme)."),
      name: z.string().min(1).optional().describe("New project name."),
      domain: z.string().min(1).optional().describe("New domain the widget will run on."),
      ai_context: z.string().optional().describe("Product context used by AI triage. Pass an empty string to clear it."),
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ id, name, domain, ai_context }) => {
    if (name === undefined && domain === undefined && ai_context === undefined) {
      return errorToolResult(new Error("Supply at least one of name, domain, or ai_context."));
    }

    return runTool(async () => client.updateProject(id, { name, domain, ai_context }));
  });
}
