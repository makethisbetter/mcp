import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MakeThisBetterClient } from "./api/client.js";
import { createMcpServer } from "./server.js";

describe("createMcpServer", () => {
  const servers: Array<{ close: () => Promise<void> }> = [];
  const clients: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.close()));
    await Promise.all(servers.splice(0).map((s) => s.close()));
  });

  it("registers the eight feedback and project tools with JSON schemas", async () => {
    const { client } = await connectTestServer(mockApiClient());

    const result = await client.listTools();
    expect(result.tools.map((t) => t.name).sort()).toEqual([
      "detail",
      "dismiss",
      "list",
      "pick",
      "project_create",
      "project_list",
      "project_show",
      "resolve",
    ]);
  });

  it("calls list through the MCP protocol and returns lean summaries", async () => {
    const api = mockApiClient();
    api.listFeedbacks.mockResolvedValue([
      { id: "fdb_1", status: "received", feedback_type: "bug", priority: "high", description: "Broken", reporter_name: "Jo", upvotes_count: 2, created_at: "2026-01-01", updated_at: "2026-01-03" },
      { id: "fdb_2", status: "received", feedback_type: null, priority: null, description: null, reporter_name: null, upvotes_count: 0, created_at: "2026-01-02", updated_at: "2026-01-04" },
    ]);
    const { client } = await connectTestServer(api);

    const result = await client.callTool({ name: "list", arguments: { status: "received", limit: 5 } }) as CallToolResult;
    expect(api.listFeedbacks).toHaveBeenCalledWith({ status: "received", feedback_type: undefined, limit: 5 });
    const first = result.content[0];
    const text = first.type === "text" ? first.text : "";
    const parsed = JSON.parse(text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ id: "fdb_1", status: "received", feedback_type: "bug", priority: "high", description: "Broken", updated_at: "2026-01-03" });
  });

  it("pick claims and returns the full feedback", async () => {
    const api = mockApiClient();
    api.updateFeedback.mockResolvedValue({ id: "fdb_1", status: "in_progress" });
    api.getFeedback.mockResolvedValue({ id: "fdb_1", status: "in_progress", description: "Bug report", feedback_type: "bug" });
    const { client } = await connectTestServer(api);

    const result = await client.callTool({ name: "pick", arguments: { feedback_id: "fdb_1" } }) as CallToolResult;
    expect(api.updateFeedback).toHaveBeenCalledWith("fdb_1", { status: "in_progress" });
    const first = result.content[0];
    expect(JSON.parse(first.type === "text" ? first.text : "")).toMatchObject({ id: "fdb_1", status: "in_progress", description: "Bug report", feedback_type: "bug" });
  });

  it("dismiss closes with not_planned", async () => {
    const api = mockApiClient();
    api.updateFeedback.mockResolvedValue({ id: "fdb_1", status: "closed", close_reason: "not_planned" });
    const { client } = await connectTestServer(api);

    await client.callTool({ name: "dismiss", arguments: { feedback_id: "fdb_1" } });
    expect(api.updateFeedback).toHaveBeenCalledWith("fdb_1", { status: "closed", labels: { close_reason: "not_planned" } });
  });

  it("resolve ships and records the PR URL in labels", async () => {
    const api = mockApiClient();
    api.updateFeedback.mockResolvedValue({ id: "fdb_1", status: "closed", close_reason: "shipped" });
    const { client } = await connectTestServer(api);

    await client.callTool({ name: "resolve", arguments: { feedback_id: "fdb_1", pr_url: "https://github.com/acme/app/pull/1" } });
    expect(api.updateFeedback).toHaveBeenCalledWith("fdb_1", {
      status: "closed",
      labels: { close_reason: "shipped", pr_url: "https://github.com/acme/app/pull/1" },
    });
  });

  it("resolve without pr_url omits it from labels", async () => {
    const api = mockApiClient();
    api.updateFeedback.mockResolvedValue({ id: "fdb_1", status: "closed", close_reason: "shipped" });
    const { client } = await connectTestServer(api);

    await client.callTool({ name: "resolve", arguments: { feedback_id: "fdb_1" } });
    expect(api.updateFeedback).toHaveBeenCalledWith("fdb_1", { status: "closed", labels: { close_reason: "shipped" } });
  });

  it("detail returns full feedback read-only", async () => {
    const api = mockApiClient();
    api.getFeedback.mockResolvedValue({ id: "fdb_1", description: "Full details" });
    const { client } = await connectTestServer(api);

    const result = await client.callTool({ name: "detail", arguments: { feedback_id: "fdb_1" } }) as CallToolResult;
    expect(api.getFeedback).toHaveBeenCalledWith("fdb_1");
    const first = result.content[0];
    expect(JSON.parse(first.type === "text" ? first.text : "")).toMatchObject({ id: "fdb_1" });
  });

  it("detail returns markdown text plus structuredContent through the MCP protocol", async () => {
    const api = mockApiClient();
    api.getFeedback.mockResolvedValue({ id: "fdb_1", description: "Full details", markdown: "# fdb_1 — Received" });
    const { client } = await connectTestServer(api);

    const result = await client.callTool({ name: "detail", arguments: { feedback_id: "fdb_1" } }) as CallToolResult;
    expect(result.content).toEqual([{ type: "text", text: "# fdb_1 — Received" }]);
    expect(result.structuredContent).toEqual({ id: "fdb_1", description: "Full details" });
  });

  it("returns tool errors as MCP error content", async () => {
    const api = mockApiClient();
    api.getFeedback.mockRejectedValue(new Error("not found"));
    const { client } = await connectTestServer(api);

    const result = await client.callTool({ name: "detail", arguments: { feedback_id: "fdb_missing" } }) as CallToolResult;
    expect(result).toMatchObject({
      isError: true,
      content: [{ type: "text", text: "not found" }],
    });
  });

  it("project_list returns the projects array through the MCP protocol", async () => {
    const api = mockApiClient();
    api.listProjects.mockResolvedValue([{ id: "project_1", name: "Acme", feedbacks_count: 2 }]);
    const { client } = await connectTestServer(api);

    const result = await client.callTool({ name: "project_list", arguments: {} }) as CallToolResult;
    const first = result.content[0];
    expect(JSON.parse(first.type === "text" ? first.text : "")).toEqual([{ id: "project_1", name: "Acme", feedbacks_count: 2 }]);
  });

  it("project_show returns full project detail through the MCP protocol", async () => {
    const api = mockApiClient();
    api.getProject.mockResolvedValue({ id: "project_1", name: "Acme", api_key: "mtb_proj_abc" });
    const { client } = await connectTestServer(api);

    const result = await client.callTool({ name: "project_show", arguments: { id: "project_1" } }) as CallToolResult;
    expect(api.getProject).toHaveBeenCalledWith("project_1");
    const first = result.content[0];
    expect(JSON.parse(first.type === "text" ? first.text : "")).toMatchObject({ id: "project_1", api_key: "mtb_proj_abc" });
  });

  it("project_create creates a project through the MCP protocol", async () => {
    const api = mockApiClient();
    api.createProject.mockResolvedValue({ id: "project_1", name: "New", domain: "example.com" });
    const { client } = await connectTestServer(api);

    await client.callTool({ name: "project_create", arguments: { name: "New", domain: "example.com" } });
    expect(api.createProject).toHaveBeenCalledWith({ name: "New", domain: "example.com" });
  });

  async function connectTestServer(api: MockMakeThisBetterClient): Promise<{ client: Client }> {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createMcpServer(api as unknown as MakeThisBetterClient);
    const client = new Client({ name: "test-client", version: "0.1.0" }, { capabilities: {} });

    servers.push(server);
    clients.push(client);
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    return { client };
  }
});

type MockMakeThisBetterClient = ReturnType<typeof mockApiClient>;

function mockApiClient() {
  return {
    listFeedbacks: vi.fn(),
    getFeedback: vi.fn(),
    updateFeedback: vi.fn(),
    listProjects: vi.fn(),
    getProject: vi.fn(),
    createProject: vi.fn(),
  };
}
