import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MakeThisBetterClient } from "./api/client.js";
import { createMcpServer, SERVER_VERSION } from "./server.js";

const packageVersion = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }
).version;

describe("createMcpServer", () => {
  const servers: Array<{ close: () => Promise<void> }> = [];
  const clients: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.close()));
    await Promise.all(servers.splice(0).map((s) => s.close()));
  });

  it("reports the package.json version to connected clients", async () => {
    const { client } = await connectTestServer(mockApiClient());

    // Clients read this from the initialize handshake; a second hardcoded copy drifts.
    expect(SERVER_VERSION).toBe(packageVersion);
    expect(client.getServerVersion()).toMatchObject({
      name: "@makethisbetter/mcp",
      version: packageVersion,
    });
  });

  it("registers the fourteen feedback and project tools with JSON schemas", async () => {
    const { client } = await connectTestServer(mockApiClient());

    const result = await client.listTools();
    expect(result.tools.map((t) => t.name).sort()).toEqual([
      "archive",
      "decline",
      "detail",
      "duplicate",
      "list",
      "pick",
      "project_create",
      "project_list",
      "project_show",
      "project_update",
      "ready",
      "reopen",
      "respond",
      "restore",
    ]);

    expect(result.tools.find((tool) => tool.name === "archive")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    });
    expect(result.tools.find((tool) => tool.name === "restore")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });
  });

  it("calls list through the MCP protocol and returns lean summaries", async () => {
    const api = mockApiClient();
    api.listFeedbacks.mockResolvedValue([
      { id: "acme/FB-1", status: "received", labels: ["Bug", "Safari"], priority: "high", description: "Broken", reporter_name: "Jo", upvotes_count: 2, created_at: "2026-01-01", updated_at: "2026-01-03" },
      { id: "acme/FB-2", status: "received", labels: [], priority: null, description: null, reporter_name: null, upvotes_count: 0, created_at: "2026-01-02", updated_at: "2026-01-04" },
    ]);
    const { client } = await connectTestServer(api);

    const result = await client.callTool({ name: "list", arguments: { project_handle: "acme", status: "received", limit: 5 } }) as CallToolResult;
    expect(api.listFeedbacks).toHaveBeenCalledWith({ project_handle: "acme", status: "received", label: undefined, limit: 5 });
    const first = result.content[0];
    const text = first.type === "text" ? first.text : "";
    const parsed = JSON.parse(text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ id: "acme/FB-1", status: "received", labels: ["Bug", "Safari"], priority: "high", description: "Broken", updated_at: "2026-01-03" });
  });

  it("lists archived feedback through the dedicated collection", async () => {
    const api = mockApiClient();
    api.listArchivedFeedbacks.mockResolvedValue([
      { id: "acme/FB-4", status: "received", labels: ["Bug"], priority: "low", description: "Old", archived_at: "2026-08-03T12:00:00Z", updated_at: "2026-08-03T12:00:00Z" },
    ]);
    const { client } = await connectTestServer(api);

    const result = await client.callTool({
      name: "list",
      arguments: { project_handle: "acme", archived: true, label: "Bug", priority: "low", limit: 5 },
    }) as CallToolResult;

    expect(api.listArchivedFeedbacks).toHaveBeenCalledWith({
      project_handle: "acme",
      label: "Bug",
      priority: "low",
      limit: 5,
    });
    expect(result.structuredContent).toMatchObject({ result: [{ id: "acme/FB-4", archived_at: "2026-08-03T12:00:00Z" }] });
  });

  it("rejects combining archived and status through the MCP protocol", async () => {
    const api = mockApiClient();
    const { client } = await connectTestServer(api);

    const result = await client.callTool({
      name: "list",
      arguments: { project_handle: "acme", archived: true, status: "received" },
    }) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(api.listFeedbacks).not.toHaveBeenCalled();
    expect(api.listArchivedFeedbacks).not.toHaveBeenCalled();
  });

  it("pick claims and returns the full feedback", async () => {
    const api = mockApiClient();
    api.updateFeedback.mockResolvedValue({ id: "acme/FB-1", status: "in_progress" });
    api.getFeedback.mockResolvedValue({ id: "acme/FB-1", status: "in_progress", description: "Bug report", labels: ["Bug"] });
    const { client } = await connectTestServer(api);

    const result = await client.callTool({ name: "pick", arguments: { feedback_id: "acme/FB-1" } }) as CallToolResult;
    expect(api.updateFeedback).toHaveBeenCalledWith("acme/FB-1", { status: "in_progress", takeover: false });
    const first = result.content[0];
    expect(JSON.parse(first.type === "text" ? first.text : "")).toMatchObject({ id: "acme/FB-1", status: "in_progress", description: "Bug report", labels: ["Bug"] });
  });

  it("decline closes with not_planned", async () => {
    const api = mockApiClient();
    api.updateFeedback.mockResolvedValue({ id: "acme/FB-1", status: "closed", close_reason: "not_planned" });
    const { client } = await connectTestServer(api);

    await client.callTool({ name: "decline", arguments: { feedback_id: "acme/FB-1" } });
    expect(api.updateFeedback).toHaveBeenCalledWith("acme/FB-1", { status: "closed", close_reason: "not_planned" });
  });

  it("respond sends the final structured body and returns safe delivery metadata", async () => {
    const api = mockApiClient();
    api.respondFeedback.mockResolvedValue({
      feedback: { id: "FB-1", reference: "acme/FB-1", status: "closed", close_reason: "responded" },
      delivery: { id: "delivery_1", status: "pending", created_at: "2026-08-03T12:00:00Z" },
    });
    const { client } = await connectTestServer(api);

    const result = await client.callTool({
      name: "respond",
      arguments: { feedback_id: "acme/FB-1", body: "Final user-confirmed response.", subject: "Export help" },
    }) as CallToolResult;

    expect(api.respondFeedback).toHaveBeenCalledWith("acme/FB-1", {
      body: "Final user-confirmed response.",
      subject: "Export help",
    });
    expect(result.structuredContent).toMatchObject({
      feedback: { status: "closed", close_reason: "responded" },
      delivery: { id: "delivery_1", status: "pending" },
    });
    expect(JSON.stringify(result)).not.toContain("response_body");
  });

  it("archives and restores one feedback through dedicated tools", async () => {
    const api = mockApiClient();
    api.archiveFeedback.mockResolvedValue({ id: "acme/FB-4", status: "received", archived_at: "2026-08-03T12:00:00Z" });
    api.restoreFeedback.mockResolvedValue({ id: "acme/FB-4", status: "received", archived_at: null });
    const { client } = await connectTestServer(api);

    await client.callTool({ name: "archive", arguments: { feedback_id: "acme/FB-4" } });
    await client.callTool({ name: "restore", arguments: { feedback_id: "acme/FB-4" } });

    expect(api.archiveFeedback).toHaveBeenCalledWith("acme/FB-4");
    expect(api.restoreFeedback).toHaveBeenCalledWith("acme/FB-4");
  });

  it("ready records the implementation summary through the MCP protocol", async () => {
    const api = mockApiClient();
    api.readyFeedback.mockResolvedValue({ id: "acme/FB-1", status: "pending_release" });
    const { client } = await connectTestServer(api);

    await client.callTool({
      name: "ready",
      arguments: { feedback_id: "acme/FB-1", resolution_summary: "Fixed Safari export." },
    });
    expect(api.readyFeedback).toHaveBeenCalledWith("acme/FB-1", "Fixed Safari export.");
  });

  it("duplicate closes against a canonical feedback", async () => {
    const api = mockApiClient();
    api.updateFeedback.mockResolvedValue({ id: "acme/FB-1", status: "closed", close_reason: "duplicate" });
    const { client } = await connectTestServer(api);

    await client.callTool({ name: "duplicate", arguments: { feedback_id: "acme/FB-1", canonical_feedback_id: "acme/FB-2" } });
    expect(api.updateFeedback).toHaveBeenCalledWith("acme/FB-1", {
      status: "closed",
      close_reason: "duplicate",
      canonical_feedback_id: "acme/FB-2",
    });
  });

  it("detail returns full feedback read-only", async () => {
    const api = mockApiClient();
    api.getFeedbackIncludingArchived.mockResolvedValue({ id: "acme/FB-1", description: "Full details" });
    const { client } = await connectTestServer(api);

    const result = await client.callTool({ name: "detail", arguments: { feedback_id: "acme/FB-1" } }) as CallToolResult;
    expect(api.getFeedbackIncludingArchived).toHaveBeenCalledWith("acme/FB-1");
    const first = result.content[0];
    expect(JSON.parse(first.type === "text" ? first.text : "")).toMatchObject({ id: "acme/FB-1" });
  });

  it("detail returns markdown text plus structuredContent through the MCP protocol", async () => {
    const api = mockApiClient();
    api.getFeedbackIncludingArchived.mockResolvedValue({ id: "acme/FB-1", description: "Full details", markdown: "# acme/FB-1 — Received" });
    const { client } = await connectTestServer(api);

    const result = await client.callTool({ name: "detail", arguments: { feedback_id: "acme/FB-1" } }) as CallToolResult;
    expect(result.content).toEqual([{ type: "text", text: "# acme/FB-1 — Received" }]);
    expect(result.structuredContent).toEqual({ id: "acme/FB-1", description: "Full details" });
  });

  // The reporter's own evidence and the triage outcome reach the agent through the protocol,
  // not just through the tool handler: a client that only reads structuredContent still sees
  // where the reporter pointed, what they did first, whether triage failed, and the screenshot.
  const EVIDENCE_FIELDS = {
    screenshot_attached: true,
    screenshot_url: "https://cdn.example.com/screenshots/FB-1.jpg",
    annotations: [{ x: 12, y: 34, type: "point", targetName: "button", targetText: "Log in", targetSelector: "#login", targetRect: { x: 1, y: 2, width: 3, height: 4 } }],
    breadcrumbs: [{ type: "click", target: "#pricing", unmodelled_key: "kept" }],
    ai_clarification_messages: [{ role: "assistant", content: "Which button?" }, { role: "user", content: "The blue one." }],
    ai_triage_status: "failed",
    ai_triage_error: "Anthropic API timeout after 30s",
    ai_clarification_status: "completed",
    screen_width: 1440,
    screen_height: 900,
    reporter_language: "zh-CN",
  };

  it.each([
    ["detail", (api: ReturnType<typeof mockApiClient>) => api],
    ["pick", (api: ReturnType<typeof mockApiClient>) => { api.updateFeedback.mockResolvedValue({}); return api; }],
  ])("%s hands the annotations, breadcrumbs and triage state to the agent", async (tool, prepare) => {
    const api = prepare(mockApiClient());
    api.getFeedback.mockResolvedValue({ id: "acme/FB-1", markdown: "# acme/FB-1", ...EVIDENCE_FIELDS });
    api.getFeedbackIncludingArchived.mockResolvedValue({ id: "acme/FB-1", markdown: "# acme/FB-1", ...EVIDENCE_FIELDS });
    const { client } = await connectTestServer(api);

    const result = await client.callTool({ name: tool, arguments: { feedback_id: "acme/FB-1" } }) as CallToolResult;
    expect(result.structuredContent).toEqual({ id: "acme/FB-1", ...EVIDENCE_FIELDS });
  });

  it.each(["detail", "pick"])("%s keeps the evidence in the JSON fallback for servers without markdown", async (tool) => {
    const api = mockApiClient();
    api.updateFeedback.mockResolvedValue({});
    api.getFeedback.mockResolvedValue({ id: "acme/FB-1", ...EVIDENCE_FIELDS });
    api.getFeedbackIncludingArchived.mockResolvedValue({ id: "acme/FB-1", ...EVIDENCE_FIELDS });
    const { client } = await connectTestServer(api);

    const result = await client.callTool({ name: tool, arguments: { feedback_id: "acme/FB-1" } }) as CallToolResult;
    const first = result.content[0];
    expect(JSON.parse(first.type === "text" ? first.text : "")).toEqual({ id: "acme/FB-1", ...EVIDENCE_FIELDS });
  });

  it.each(["detail", "pick"])("%s tells the agent the evidence and triage state exist", async (tool) => {
    const { client } = await connectTestServer(mockApiClient());

    const { tools } = await client.listTools();
    const description = tools.find((registered) => registered.name === tool)!.description!;
    for (const field of Object.keys(EVIDENCE_FIELDS)) {
      expect(description).toContain(field);
    }
  });

  it("returns tool errors as MCP error content", async () => {
    const api = mockApiClient();
    api.getFeedback.mockRejectedValue(new Error("not found"));
    api.getFeedbackIncludingArchived.mockRejectedValue(new Error("not found"));
    const { client } = await connectTestServer(api);

    const result = await client.callTool({ name: "detail", arguments: { feedback_id: "acme/FB-999" } }) as CallToolResult;
    expect(result).toMatchObject({
      isError: true,
      content: [{ type: "text", text: "not found" }],
    });
  });

  it("project_list returns the projects array through the MCP protocol", async () => {
    const api = mockApiClient();
    api.listProjects.mockResolvedValue([{ id: "acme", name: "Acme", feedbacks_count: 2 }]);
    const { client } = await connectTestServer(api);

    const result = await client.callTool({ name: "project_list", arguments: {} }) as CallToolResult;
    const first = result.content[0];
    expect(JSON.parse(first.type === "text" ? first.text : "")).toEqual([{ id: "acme", name: "Acme", feedbacks_count: 2 }]);
  });

  it("project_show returns full project detail through the MCP protocol", async () => {
    const api = mockApiClient();
    api.getProject.mockResolvedValue({ id: "acme", name: "Acme", api_key: "mtb_proj_abc" });
    const { client } = await connectTestServer(api);

    const result = await client.callTool({ name: "project_show", arguments: { id: "acme" } }) as CallToolResult;
    expect(api.getProject).toHaveBeenCalledWith("acme");
    const first = result.content[0];
    expect(JSON.parse(first.type === "text" ? first.text : "")).toMatchObject({ id: "acme", api_key: "mtb_proj_abc" });
  });

  it("project_create creates a project through the MCP protocol", async () => {
    const api = mockApiClient();
    api.createProject.mockResolvedValue({ id: "acme", name: "New", domain: "example.com" });
    const { client } = await connectTestServer(api);

    await client.callTool({ name: "project_create", arguments: { name: "New", handle: "new-project", domain: "example.com" } });
    expect(api.createProject).toHaveBeenCalledWith({ name: "New", handle: "new-project", domain: "example.com" });
  });

  it("project_update updates mutable fields through the MCP protocol", async () => {
    const api = mockApiClient();
    api.updateProject.mockResolvedValue({ id: "acme", name: "Renamed", ai_context: "B2B SaaS" });
    const { client } = await connectTestServer(api);

    const result = await client.callTool({ name: "project_update", arguments: { id: "acme", name: "Renamed", ai_context: "B2B SaaS" } });
    expect(api.updateProject).toHaveBeenCalledWith("acme", { name: "Renamed", domain: undefined, ai_context: "B2B SaaS" });
    expect(result.structuredContent).toMatchObject({ id: "acme", name: "Renamed", ai_context: "B2B SaaS" });
  });

  it("project_update rejects a call without any mutable fields", async () => {
    const api = mockApiClient();
    const { client } = await connectTestServer(api);

    const result = await client.callTool({ name: "project_update", arguments: { id: "acme" } });

    expect(result.isError).toBe(true);
    expect(api.updateProject).not.toHaveBeenCalled();
  });

  it("project_create accepts a 63-character handle", async () => {
    const handle = "a".repeat(63);
    const api = mockApiClient();
    api.createProject.mockResolvedValue({ id: handle, name: "Longest" });
    const { client } = await connectTestServer(api);

    await client.callTool({ name: "project_create", arguments: { name: "Longest", handle, domain: "example.com" } });
    expect(api.createProject).toHaveBeenCalledWith({ name: "Longest", handle, domain: "example.com" });
  });

  it("project_create rejects a call with no domain", async () => {
    // A project without a domain cannot say where its widget is allowed to run, so the
    // argument is required and the SDK must refuse the call before it reaches the API.
    const api = mockApiClient();
    const { client } = await connectTestServer(api);

    const result = await client.callTool({ name: "project_create", arguments: { name: "New", handle: "new-project" } }) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(api.createProject).not.toHaveBeenCalled();
    const first = result.content[0];
    expect(first.type === "text" ? first.text : "").toContain("domain");
  });

  it("project_create advertises domain as a required argument", async () => {
    const { client } = await connectTestServer(mockApiClient());

    const { tools } = await client.listTools();
    const create = tools.find((tool) => tool.name === "project_create")!;

    expect(create.inputSchema.required).toContain("domain");
    expect(create.description).toContain("domain is required");
  });

  it.each(["abc", "ab--cd", "a".repeat(64)])("project_create rejects invalid handle %s", async (handle) => {
    const api = mockApiClient();
    const { client } = await connectTestServer(api);

    const result = await client.callTool({ name: "project_create", arguments: { name: "Invalid", handle, domain: "example.com" } }) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(api.createProject).not.toHaveBeenCalled();
  });

  it("project_create explains the R-LDH restriction", async () => {
    const api = mockApiClient();
    const { client } = await connectTestServer(api);

    const result = await client.callTool({ name: "project_create", arguments: { name: "Invalid", handle: "ab--cd", domain: "example.com" } }) as CallToolResult;
    const first = result.content[0];

    expect(first.type === "text" ? first.text : "").toContain("third and fourth characters cannot both be hyphens");
  });

  it.each(["abc", "ab--cd", "a".repeat(64)])("list rejects invalid project handle %s", async (project_handle) => {
    const api = mockApiClient();
    const { client } = await connectTestServer(api);

    const result = await client.callTool({ name: "list", arguments: { project_handle } }) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(api.listFeedbacks).not.toHaveBeenCalled();
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
    listArchivedFeedbacks: vi.fn(),
    getFeedback: vi.fn(),
    getFeedbackIncludingArchived: vi.fn(),
    updateFeedback: vi.fn(),
    respondFeedback: vi.fn(),
    archiveFeedback: vi.fn(),
    restoreFeedback: vi.fn(),
    readyFeedback: vi.fn(),
    listProjects: vi.fn(),
    getProject: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
  };
}
