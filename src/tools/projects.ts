import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MakeThisBetterClient } from "../api/client.js";
import { runTool } from "./shared.js";

export function registerProjectListTool(server: McpServer, client: MakeThisBetterClient): void {
  server.registerTool("project_list", {
    title: "List Projects",
    description: [
      "Browse the projects (feedback boards) in your account.",
      "Returns id, name, domain, feedback visibility, feedback count, and timestamps for each project.",
      "Use 'project_show' to read the widget API key and board URL for one project,",
      "or 'project_create' to add a new one.",
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
      "Also returns the identity-verification signing secret when you are an account admin.",
      "Use 'project_list' to find the project handle first.",
    ].join(" "),
    inputSchema: {
      id: z.string().min(3).describe("Project handle (e.g. acme)."),
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
      "the signing secret is only ever shown to account admins.",
      "Requires account admin permissions.",
    ].join(" "),
    inputSchema: {
      name: z.string().min(1).describe("Project name."),
      handle: z.string().min(3).describe("Globally unique project handle."),
      domain: z.string().min(1).optional().describe("Domain the widget will run on (optional)."),
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ name, handle, domain }) => runTool(async () => client.createProject({ name, handle, domain })));
}
