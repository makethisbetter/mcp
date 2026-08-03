import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MakeThisBetterClient } from "../api/client.js";
import { registerDetailTool } from "./detail.js";
import { registerDeclineTool } from "./decline.js";
import { registerDuplicateTool } from "./duplicate.js";
import { registerListTool } from "./list.js";
import { registerPickTool } from "./pick.js";
import { registerReadyTool } from "./ready.js";
import { registerReopenTool } from "./reopen.js";
import {
  registerProjectCreateTool,
  registerProjectListTool,
  registerProjectShowTool,
  registerProjectUpdateTool,
} from "./projects.js";
import { errorToolResult, hybridToolResult, jsonToolResult, runHybridTool, runTool } from "./shared.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>;

type ToolConfig = { description: string; inputSchema: Record<string, z.ZodTypeAny> };

class MockMcpServer {
  handlers = new Map<string, ToolHandler>();
  configs = new Map<string, ToolConfig>();
  registerTool(name: string, config: unknown, handler: ToolHandler) {
    this.handlers.set(name, handler);
    this.configs.set(name, config as ToolConfig);
  }
}

function mockApiClient() {
  return {
    listFeedbacks: vi.fn(),
    getFeedback: vi.fn(),
    getFeedbackIncludingArchived: vi.fn(),
    updateFeedback: vi.fn(),
    readyFeedback: vi.fn(),
    listProjects: vi.fn(),
    getProject: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
  };
}

type MockClient = ReturnType<typeof mockApiClient>;

function setup(
  register: (server: McpServer, client: MakeThisBetterClient) => void,
  client: MockClient | MakeThisBetterClient,
) {
  const server = new MockMcpServer();
  register(server as unknown as McpServer, client as unknown as MakeThisBetterClient);
  const handler = [...server.handlers.values()][0]!;
  return handler;
}

// The MCP SDK validates arguments against inputSchema before the handler runs, so a required
// argument can only be tested against the schema the tool registered — not through the handler.
function setupConfig(register: (server: McpServer, client: MakeThisBetterClient) => void): ToolConfig {
  const server = new MockMcpServer();
  register(server as unknown as McpServer, mockApiClient() as unknown as MakeThisBetterClient);
  return [...server.configs.values()][0]!;
}

function parseResult(result: CallToolResult): unknown {
  const first = result.content[0];
  return first.type === "text" ? JSON.parse(first.text) : undefined;
}

// The evidence an agent is told to inspect before acting on a feedback. The breadcrumb carries
// a key this package does not model on purpose — it must still survive the round trip.
const EVIDENCE_FIELDS = {
  screenshot_attached: true,
  screenshot_url: "https://cdn.example.com/screenshots/FB-1.jpg",
  annotations: [
    {
      x: 120,
      y: 340,
      type: "point",
      targetName: "button",
      targetText: "Log in",
      targetSelector: "header #login",
      targetRect: { x: 100, y: 320, width: 80, height: 32 },
    },
  ],
  breadcrumbs: [
    { type: "click", target: "#pricing", at: "2026-07-20T10:00:00Z", unmodelled_key: "kept" },
  ],
  ai_clarification_messages: [
    { role: "assistant", content: "Which button did you press?" },
    { role: "user", content: "The blue one in the header." },
  ],
  ai_triage_status: "failed",
  ai_triage_error: "Anthropic API timeout after 30s",
  ai_clarification_status: "completed",
  screen_width: 1440,
  screen_height: 900,
  reporter_language: "zh-CN",
};

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

describe("shared", () => {
  describe("jsonToolResult", () => {
    it("wraps a value as JSON text content", () => {
      const result = jsonToolResult({ ok: true });
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify({ ok: true }, null, 2) }],
        structuredContent: { ok: true },
      });
      expect(result.isError).toBeUndefined();
    });
  });

  describe("errorToolResult", () => {
    it("extracts message from Error instances", () => {
      const result = errorToolResult(new Error("boom"));
      expect(result).toEqual({
        isError: true,
        content: [{ type: "text", text: "boom" }],
      });
    });

    it("stringifies non-Error values", () => {
      const result = errorToolResult(42);
      expect(result).toEqual({
        isError: true,
        content: [{ type: "text", text: "42" }],
      });
    });
  });

  describe("runTool", () => {
    it("returns jsonToolResult on success", async () => {
      const result = await runTool(async () => ({ data: 1 }));
      expect(result.isError).toBeUndefined();
      expect(parseResult(result)).toEqual({ data: 1 });
    });

    it("returns errorToolResult on thrown error", async () => {
      const result = await runTool(async () => { throw new Error("fail"); });
      expect(result.isError).toBe(true);
      expect(result.content[0]).toMatchObject({ type: "text", text: "fail" });
    });
  });

  describe("hybridToolResult", () => {
    it("splits markdown into text content and keeps the rest as structuredContent", () => {
      const result = hybridToolResult({ id: "acme/FB-1", status: "received", markdown: "# acme/FB-1 — received" });
      expect(result).toEqual({
        content: [{ type: "text", text: "# acme/FB-1 — received" }],
        structuredContent: { id: "acme/FB-1", status: "received" },
      });
    });

    it("falls back to jsonToolResult when markdown is absent", () => {
      const value = { id: "acme/FB-1", status: "received" };
      expect(hybridToolResult(value)).toEqual(jsonToolResult(value));
    });

    it("falls back to jsonToolResult when markdown is not a string", () => {
      const value = { id: "acme/FB-1", markdown: 42 };
      expect(hybridToolResult(value)).toEqual(jsonToolResult(value));
    });

    it("falls back to jsonToolResult for non-object values", () => {
      expect(hybridToolResult(null)).toEqual(jsonToolResult(null));
      expect(hybridToolResult(["markdown"])).toEqual(jsonToolResult(["markdown"]));
    });
  });

  describe("runHybridTool", () => {
    it("returns hybrid result on success", async () => {
      const result = await runHybridTool(async () => ({ id: "acme/FB-1", markdown: "# Hi" }));
      expect(result.content).toEqual([{ type: "text", text: "# Hi" }]);
      expect(result.structuredContent).toEqual({ id: "acme/FB-1" });
    });

    it("returns errorToolResult on thrown error", async () => {
      const result = await runHybridTool(async () => { throw new Error("fail"); });
      expect(result.isError).toBe(true);
      expect(result.content[0]).toMatchObject({ type: "text", text: "fail" });
    });
  });
});

// ---------------------------------------------------------------------------
// list tool
// ---------------------------------------------------------------------------

describe("list tool", () => {
  const feedbackFixture = (overrides: Record<string, unknown> = {}) => ({
    id: "FB-1",
    reference: "acme/FB-1",
    status: "received",
    labels: ["Bug", "Safari"],
    priority: "high",
    description: "Broken button",
    reporter_name: "Alice",
    upvotes_count: 3,
    created_at: "2026-01-01",
    updated_at: "2026-01-02",
    project_id: "prj_1",
    extra_field: "should be stripped",
    ...overrides,
  });

  it("returns lean summarized feedbacks", async () => {
    const client = mockApiClient();
    client.listFeedbacks.mockResolvedValue([feedbackFixture()]);
    const handler = setup(registerListTool, client);

    const result = await handler({ project_handle: "acme", status: "received", limit: 20 });
    const parsed = parseResult(result) as Record<string, unknown>[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual({
      id: "FB-1",
      reference: "acme/FB-1",
      status: "received",
      labels: ["Bug", "Safari"],
      priority: "high",
      description: "Broken button",
      updated_at: "2026-01-02",
    });
    expect(parsed[0]).not.toHaveProperty("project_id");
    expect(parsed[0]).not.toHaveProperty("extra_field");
    expect(parsed[0]).not.toHaveProperty("reporter_name");
    expect(parsed[0]).not.toHaveProperty("upvotes_count");
    expect(parsed[0]).not.toHaveProperty("created_at");
  });

  it("truncates description to the first 80 chars", async () => {
    const client = mockApiClient();
    client.listFeedbacks.mockResolvedValue([feedbackFixture({ description: "x".repeat(200) })]);
    const handler = setup(registerListTool, client);

    const result = await handler({ project_handle: "acme", limit: 20 });
    const parsed = parseResult(result) as Record<string, unknown>[];
    expect(parsed[0]!.description).toBe("x".repeat(80));
  });

  it("keeps description null when missing", async () => {
    const client = mockApiClient();
    client.listFeedbacks.mockResolvedValue([feedbackFixture({ description: null })]);
    const handler = setup(registerListTool, client);

    const result = await handler({ project_handle: "acme", limit: 20 });
    const parsed = parseResult(result) as Record<string, unknown>[];
    expect(parsed[0]!.description).toBeNull();
  });

  it("passes status and label filters to the client", async () => {
    const client = mockApiClient();
    client.listFeedbacks.mockResolvedValue([]);
    const handler = setup(registerListTool, client);

    await handler({ project_handle: "acme", status: "in_progress", label: "Billing", limit: 10 });
    expect(client.listFeedbacks).toHaveBeenCalledWith({
      project_handle: "acme",
      status: "in_progress",
      label: "Billing",
      limit: 10,
    });
  });

  it("passes undefined for omitted filters", async () => {
    const client = mockApiClient();
    client.listFeedbacks.mockResolvedValue([]);
    const handler = setup(registerListTool, client);

    await handler({ project_handle: "acme", limit: 20 });
    expect(client.listFeedbacks).toHaveBeenCalledWith({
      project_handle: "acme",
      status: undefined,
      label: undefined,
      limit: 20,
    });
  });

  it("returns empty array when no feedbacks match", async () => {
    const client = mockApiClient();
    client.listFeedbacks.mockResolvedValue([]);
    const handler = setup(registerListTool, client);

    const result = await handler({ project_handle: "acme", limit: 20 });
    expect(parseResult(result)).toEqual([]);
  });

  it("returns error result on API failure", async () => {
    const client = mockApiClient();
    client.listFeedbacks.mockRejectedValue(new Error("network error"));
    const handler = setup(registerListTool, client);

    const result = await handler({ project_handle: "acme", limit: 20 });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ type: "text", text: "network error" });
  });
});

// ---------------------------------------------------------------------------
// pick tool
// ---------------------------------------------------------------------------

describe("pick tool", () => {
  it("sets status to in_progress then returns full feedback", async () => {
    const client = mockApiClient();
    client.updateFeedback.mockResolvedValue({ id: "acme/FB-1", status: "in_progress" });
    client.getFeedback.mockResolvedValue({
      id: "acme/FB-1",
      status: "in_progress",
      description: "Full context",
      screenshot_attached: true,
    });
    const handler = setup(registerPickTool, client);

    const result = await handler({ feedback_id: "acme/FB-1" });
    expect(client.updateFeedback).toHaveBeenCalledWith("acme/FB-1", { status: "in_progress", takeover: false });
    expect(client.getFeedback).toHaveBeenCalledWith("acme/FB-1");

    const parsed = parseResult(result) as Record<string, unknown>;
    expect(parsed).toMatchObject({ id: "acme/FB-1", status: "in_progress", description: "Full context" });
    expect(result.structuredContent).toEqual(parsed);
  });

  it("passes takeover through to the feedback API", async () => {
    const client = mockApiClient();
    client.updateFeedback.mockResolvedValue({});
    client.getFeedback.mockResolvedValue({ id: "acme/FB-1" });
    const handler = setup(registerPickTool, client);

    await handler({ feedback_id: "acme/FB-1", takeover: true });

    expect(client.updateFeedback).toHaveBeenCalledWith("acme/FB-1", { status: "in_progress", takeover: true });
  });

  it("returns markdown text and structuredContent when the API includes markdown", async () => {
    const client = mockApiClient();
    client.updateFeedback.mockResolvedValue({});
    client.getFeedback.mockResolvedValue({
      id: "acme/FB-1",
      status: "in_progress",
      markdown: "# acme/FB-1 — In progress",
    });
    const handler = setup(registerPickTool, client);

    const result = await handler({ feedback_id: "acme/FB-1" });
    expect(result.content).toEqual([{ type: "text", text: "# acme/FB-1 — In progress" }]);
    expect(result.structuredContent).toEqual({ id: "acme/FB-1", status: "in_progress" });
  });

  it("puts annotations, breadcrumbs, clarification and triage state in structuredContent", async () => {
    const client = mockApiClient();
    client.updateFeedback.mockResolvedValue({});
    client.getFeedback.mockResolvedValue({
      id: "acme/FB-1",
      markdown: "# acme/FB-1 — In progress",
      ...EVIDENCE_FIELDS,
    });
    const handler = setup(registerPickTool, client);

    const result = await handler({ feedback_id: "acme/FB-1" });
    expect(result.structuredContent).toEqual({ id: "acme/FB-1", ...EVIDENCE_FIELDS });
  });

  it("keeps the same evidence in the JSON fallback when the server renders no markdown", async () => {
    const client = mockApiClient();
    client.updateFeedback.mockResolvedValue({});
    client.getFeedback.mockResolvedValue({ id: "acme/FB-1", ...EVIDENCE_FIELDS });
    const handler = setup(registerPickTool, client);

    const result = await handler({ feedback_id: "acme/FB-1" });
    expect(parseResult(result)).toEqual({ id: "acme/FB-1", ...EVIDENCE_FIELDS });
  });

  it("tells the agent the evidence and triage state are available", () => {
    const { description } = setupConfig(registerPickTool);
    for (const field of Object.keys(EVIDENCE_FIELDS)) {
      expect(description).toContain(field);
    }
  });

  it("calls updateFeedback before getFeedback", async () => {
    const order: string[] = [];
    const client = mockApiClient();
    client.updateFeedback.mockImplementation(async () => { order.push("update"); return {}; });
    client.getFeedback.mockImplementation(async () => { order.push("get"); return { id: "acme/FB-1" }; });
    const handler = setup(registerPickTool, client);

    await handler({ feedback_id: "acme/FB-1" });
    expect(order).toEqual(["update", "get"]);
  });

  it("returns error if updateFeedback fails", async () => {
    const client = mockApiClient();
    client.updateFeedback.mockRejectedValue(new Error("forbidden"));
    const handler = setup(registerPickTool, client);

    const result = await handler({ feedback_id: "acme/FB-1" });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ text: "forbidden" });
    expect(client.getFeedback).not.toHaveBeenCalled();
  });

  it("returns error if getFeedback fails after update", async () => {
    const client = mockApiClient();
    client.updateFeedback.mockResolvedValue({});
    client.getFeedback.mockRejectedValue(new Error("not found"));
    const handler = setup(registerPickTool, client);

    const result = await handler({ feedback_id: "acme/FB-1" });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ text: "not found" });
  });
});

// ---------------------------------------------------------------------------
// feedback outcome tools
// ---------------------------------------------------------------------------

describe("decline tool", () => {
  it("closes with not_planned", async () => {
    const client = mockApiClient();
    client.updateFeedback.mockResolvedValue({ id: "acme/FB-1", status: "closed", close_reason: "not_planned" });
    const handler = setup(registerDeclineTool, client);

    const result = await handler({ feedback_id: "acme/FB-1" });
    expect(client.updateFeedback).toHaveBeenCalledWith("acme/FB-1", {
      status: "closed",
      close_reason: "not_planned",
    });
    expect(parseResult(result)).toMatchObject({ id: "acme/FB-1", close_reason: "not_planned" });
  });

  it("returns error on API failure", async () => {
    const client = mockApiClient();
    client.updateFeedback.mockRejectedValue(new Error("server error"));
    const handler = setup(registerDeclineTool, client);

    const result = await handler({ feedback_id: "acme/FB-1" });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ text: "server error" });
  });
});

describe("ready tool", () => {
  it("records the implementation summary without inspecting Git", async () => {
    const client = mockApiClient();
    client.readyFeedback.mockResolvedValue({ id: "acme/FB-1", status: "pending_release" });
    const handler = setup(registerReadyTool, client);

    const result = await handler({
      feedback_id: "acme/FB-1",
      resolution_summary: "Fixed Safari export.",
    });

    expect(client.readyFeedback).toHaveBeenCalledWith("acme/FB-1", "Fixed Safari export.");
    expect(parseResult(result)).toMatchObject({ id: "acme/FB-1", status: "pending_release" });
  });

  it("requires a non-blank resolution summary", () => {
    const { inputSchema } = setupConfig(registerReadyTool);

    expect(inputSchema.resolution_summary.safeParse("   ").success).toBe(false);
  });
});

describe("duplicate tool", () => {
  it("closes against a canonical feedback", async () => {
    const client = mockApiClient();
    client.updateFeedback.mockResolvedValue({ id: "acme/FB-1", status: "closed", close_reason: "duplicate" });
    const handler = setup(registerDuplicateTool, client);

    const result = await handler({ feedback_id: "acme/FB-1", canonical_feedback_id: "acme/FB-2" });
    expect(client.updateFeedback).toHaveBeenCalledWith("acme/FB-1", {
      status: "closed",
      close_reason: "duplicate",
      canonical_feedback_id: "acme/FB-2",
    });
    expect(parseResult(result)).toMatchObject({ id: "acme/FB-1", close_reason: "duplicate" });
  });
});

describe("reopen tool", () => {
  it("returns closed feedback to received", async () => {
    const client = mockApiClient();
    client.updateFeedback.mockResolvedValue({ id: "acme/FB-1", status: "received" });
    const handler = setup(registerReopenTool, client);

    const result = await handler({ feedback_id: "acme/FB-1" });
    expect(client.updateFeedback).toHaveBeenCalledWith("acme/FB-1", { status: "received" });
    expect(parseResult(result)).toMatchObject({ id: "acme/FB-1", status: "received" });
  });
});

// ---------------------------------------------------------------------------
// detail tool
// ---------------------------------------------------------------------------

describe("detail tool", () => {
  it("returns full feedback as JSON when the API has no markdown field", async () => {
    const client = mockApiClient();
    const feedback = {
      id: "acme/FB-1",
      description: "Full details",
      screenshot_attached: true,
      console_errors: [{ message: "TypeError" }],
    };
    client.getFeedbackIncludingArchived.mockResolvedValue(feedback);
    const handler = setup(registerDetailTool, client);

    const result = await handler({ feedback_id: "acme/FB-1" });
    expect(client.getFeedbackIncludingArchived).toHaveBeenCalledWith("acme/FB-1");
    expect(parseResult(result)).toEqual(feedback);
    expect(result.structuredContent).toEqual(feedback);
  });

  it("returns markdown text and structuredContent when the API includes markdown", async () => {
    const client = mockApiClient();
    client.getFeedbackIncludingArchived.mockResolvedValue({
      id: "acme/FB-1",
      description: "Full details",
      markdown: "# acme/FB-1 — Received\n\nFull details",
    });
    const handler = setup(registerDetailTool, client);

    const result = await handler({ feedback_id: "acme/FB-1" });
    expect(result.content).toEqual([{ type: "text", text: "# acme/FB-1 — Received\n\nFull details" }]);
    expect(result.structuredContent).toEqual({ id: "acme/FB-1", description: "Full details" });
  });

  it("puts annotations, breadcrumbs, clarification and triage state in structuredContent", async () => {
    const client = mockApiClient();
    client.getFeedbackIncludingArchived.mockResolvedValue({
      id: "acme/FB-1",
      markdown: "# acme/FB-1 — Received",
      ...EVIDENCE_FIELDS,
    });
    const handler = setup(registerDetailTool, client);

    const result = await handler({ feedback_id: "acme/FB-1" });
    expect(result.structuredContent).toEqual({ id: "acme/FB-1", ...EVIDENCE_FIELDS });
  });

  it("keeps the same evidence in the JSON fallback when the server renders no markdown", async () => {
    const client = mockApiClient();
    client.getFeedbackIncludingArchived.mockResolvedValue({ id: "acme/FB-1", ...EVIDENCE_FIELDS });
    const handler = setup(registerDetailTool, client);

    const result = await handler({ feedback_id: "acme/FB-1" });
    expect(parseResult(result)).toEqual({ id: "acme/FB-1", ...EVIDENCE_FIELDS });
  });

  it("tells the agent the evidence and triage state are available", () => {
    const { description } = setupConfig(registerDetailTool);
    for (const field of Object.keys(EVIDENCE_FIELDS)) {
      expect(description).toContain(field);
    }
  });

  it("does not call updateFeedback (read-only)", async () => {
    const client = mockApiClient();
    client.getFeedbackIncludingArchived.mockResolvedValue({ id: "acme/FB-1" });
    const handler = setup(registerDetailTool, client);

    await handler({ feedback_id: "acme/FB-1" });
    expect(client.updateFeedback).not.toHaveBeenCalled();
  });

  it("returns error on API failure", async () => {
    const client = mockApiClient();
    client.getFeedbackIncludingArchived.mockRejectedValue(new Error("not found"));
    const handler = setup(registerDetailTool, client);

    const result = await handler({ feedback_id: "acme/FB-999" });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ type: "text", text: "not found" });
  });
});

// ---------------------------------------------------------------------------
// project_list tool
// ---------------------------------------------------------------------------

describe("project_list tool", () => {
  it("returns the projects array as-is", async () => {
    const client = mockApiClient();
    const projects = [
      { id: "acme", name: "Acme", domain: null, feedback_visibility: "public", created_at: "2026-01-01", updated_at: "2026-01-02", feedbacks_count: 3 },
    ];
    client.listProjects.mockResolvedValue(projects);
    const handler = setup(registerProjectListTool, client);

    const result = await handler({});
    expect(parseResult(result)).toEqual(projects);
  });

  it("returns error on API failure", async () => {
    const client = mockApiClient();
    client.listProjects.mockRejectedValue(new Error("network error"));
    const handler = setup(registerProjectListTool, client);

    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ type: "text", text: "network error" });
  });
});

// ---------------------------------------------------------------------------
// project_show tool
// ---------------------------------------------------------------------------

describe("project_show tool", () => {
  it("returns full project detail including api_key and board_url", async () => {
    const client = mockApiClient();
    const project = {
      id: "acme",
      name: "Acme",
      domain: "acme.com",
      feedback_visibility: "public",
      created_at: "2026-01-01",
      updated_at: "2026-01-02",
      feedbacks_count: 3,
      api_key: "mtb_proj_abc",
      board_url: "https://acme.makethisbetter.dev",
      enforce_identity_verification: false,
    };
    client.getProject.mockResolvedValue(project);
    const handler = setup(registerProjectShowTool, client);

    const result = await handler({ id: "acme" });
    expect(client.getProject).toHaveBeenCalledWith("acme");
    expect(parseResult(result)).toEqual(project);
  });

  it("includes signing_secret when present for an authorized project manager", async () => {
    const client = mockApiClient();
    client.getProject.mockResolvedValue({ id: "acme", signing_secret: "whsec_abc" });
    const handler = setup(registerProjectShowTool, client);

    const result = await handler({ id: "acme" });
    expect(parseResult(result)).toMatchObject({ signing_secret: "whsec_abc" });
  });

  it("omits signing_secret when absent (non-admin)", async () => {
    const client = mockApiClient();
    client.getProject.mockResolvedValue({ id: "acme", api_key: "mtb_proj_abc" });
    const handler = setup(registerProjectShowTool, client);

    const result = await handler({ id: "acme" });
    expect(parseResult(result)).not.toHaveProperty("signing_secret");
  });

  it("returns error on API failure", async () => {
    const client = mockApiClient();
    client.getProject.mockRejectedValue(new Error("not found"));
    const handler = setup(registerProjectShowTool, client);

    const result = await handler({ id: "missing-project" });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ type: "text", text: "not found" });
  });
});

// ---------------------------------------------------------------------------
// project_create tool
// ---------------------------------------------------------------------------

describe("project_create tool", () => {
  it("creates a project with name and domain", async () => {
    const client = mockApiClient();
    client.createProject.mockResolvedValue({ id: "acme", name: "New", domain: "example.com", api_key: "mtb_proj_new" });
    const handler = setup(registerProjectCreateTool, client);

    const result = await handler({ name: "New", handle: "new-project", domain: "example.com" });
    expect(client.createProject).toHaveBeenCalledWith({ name: "New", handle: "new-project", domain: "example.com" });
    expect(parseResult(result)).toMatchObject({ id: "acme", name: "New" });
  });

  it("rejects a create without a domain", () => {
    const { inputSchema } = setupConfig(registerProjectCreateTool);
    const parsed = z.object(inputSchema).safeParse({ name: "New", handle: "new-project" });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) => issue.path[0] === "domain")).toBe(true);
  });

  it("rejects an empty domain", () => {
    const { inputSchema } = setupConfig(registerProjectCreateTool);
    const parsed = z.object(inputSchema).safeParse({ name: "New", handle: "new-project", domain: "" });

    expect(parsed.success).toBe(false);
  });

  it("accepts a create that carries a domain", () => {
    const { inputSchema } = setupConfig(registerProjectCreateTool);
    const parsed = z.object(inputSchema).safeParse({ name: "New", handle: "new-project", domain: "example.com" });

    expect(parsed.success).toBe(true);
  });

  it("says in its description that domain is required", () => {
    const { description, inputSchema } = setupConfig(registerProjectCreateTool);
    expect(description).toContain("domain is required");
    expect(inputSchema.domain!.description).toContain("required");
  });

  it("returns actionable guidance when the caller cannot create projects", async () => {
    // Driven through the real client: Rails replies `head :forbidden` with an empty body, so
    // the text the agent reads is the client's next-action message, not a server sentence.
    const client = new MakeThisBetterClient({
      apiUrl: "https://example.test/api/v1",
      apiToken: "token_123",
      fetchImpl: vi.fn(async () => new Response(null, { status: 403 })),
    });
    const handler = setup(registerProjectCreateTool, client);

    const result = await handler({ name: "New", handle: "new-project", domain: "example.com" });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("plan, role, project assignment, and account_id"),
    });
  });
});

// ---------------------------------------------------------------------------
// project_update tool
// ---------------------------------------------------------------------------

describe("project_update tool", () => {
  it("updates the project's mutable settings", async () => {
    const client = mockApiClient();
    client.updateProject.mockResolvedValue({ id: "acme", name: "Renamed", ai_context: "B2B SaaS" });
    const handler = setup(registerProjectUpdateTool, client);

    const result = await handler({ id: "acme", name: "Renamed", ai_context: "B2B SaaS" });

    expect(client.updateProject).toHaveBeenCalledWith("acme", {
      name: "Renamed",
      domain: undefined,
      ai_context: "B2B SaaS",
    });
    expect(parseResult(result)).toMatchObject({ id: "acme", name: "Renamed" });
  });

  it("does not expose the immutable handle as an update field", () => {
    const { inputSchema } = setupConfig(registerProjectUpdateTool);

    expect(inputSchema).not.toHaveProperty("handle");
    expect(inputSchema).toHaveProperty("name");
    expect(inputSchema).toHaveProperty("domain");
    expect(inputSchema).toHaveProperty("ai_context");
  });

  it("rejects an update without any mutable fields", async () => {
    const client = mockApiClient();
    const handler = setup(registerProjectUpdateTool, client);

    const result = await handler({ id: "acme" });

    expect(result.isError).toBe(true);
    expect(client.updateProject).not.toHaveBeenCalled();
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("name, domain, or ai_context"),
    });
  });
});
