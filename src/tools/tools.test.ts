import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import type { MakeThisBetterClient } from "../api/client.js";
import { registerDetailTool } from "./detail.js";
import { registerDismissTool } from "./dismiss.js";
import { registerListTool } from "./list.js";
import { registerPickTool } from "./pick.js";
import {
  registerProjectCreateTool,
  registerProjectListTool,
  registerProjectShowTool,
} from "./projects.js";
import { registerResolveTool } from "./resolve.js";
import { errorToolResult, hybridToolResult, jsonToolResult, runHybridTool, runTool } from "./shared.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>;

class MockMcpServer {
  handlers = new Map<string, ToolHandler>();
  registerTool(name: string, _config: unknown, handler: ToolHandler) {
    this.handlers.set(name, handler);
  }
}

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

type MockClient = ReturnType<typeof mockApiClient>;

function setup(register: (server: McpServer, client: MakeThisBetterClient) => void, client: MockClient) {
  const server = new MockMcpServer();
  register(server as unknown as McpServer, client as unknown as MakeThisBetterClient);
  const handler = [...server.handlers.values()][0]!;
  return handler;
}

function parseResult(result: CallToolResult): unknown {
  const first = result.content[0];
  return first.type === "text" ? JSON.parse(first.text) : undefined;
}

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

describe("shared", () => {
  describe("jsonToolResult", () => {
    it("wraps a value as JSON text content", () => {
      const result = jsonToolResult({ ok: true });
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify({ ok: true }, null, 2) }],
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
    feedback_type: "bug",
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
      feedback_type: "bug",
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

  it("passes status and type filters to the client", async () => {
    const client = mockApiClient();
    client.listFeedbacks.mockResolvedValue([]);
    const handler = setup(registerListTool, client);

    await handler({ project_handle: "acme", status: "in_progress", type: "feature", limit: 10 });
    expect(client.listFeedbacks).toHaveBeenCalledWith({
      project_handle: "acme",
      status: "in_progress",
      feedback_type: "feature",
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
      feedback_type: undefined,
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
      screenshot_url: "https://example.com/shot.png",
    });
    const handler = setup(registerPickTool, client);

    const result = await handler({ feedback_id: "acme/FB-1" });
    expect(client.updateFeedback).toHaveBeenCalledWith("acme/FB-1", { status: "in_progress" });
    expect(client.getFeedback).toHaveBeenCalledWith("acme/FB-1");

    const parsed = parseResult(result) as Record<string, unknown>;
    expect(parsed).toMatchObject({ id: "acme/FB-1", status: "in_progress", description: "Full context" });
    expect(result.structuredContent).toBeUndefined();
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
// dismiss tool
// ---------------------------------------------------------------------------

describe("dismiss tool", () => {
  it("closes with not_planned by default, nested in labels", async () => {
    const client = mockApiClient();
    client.updateFeedback.mockResolvedValue({ id: "acme/FB-1", status: "closed", close_reason: "not_planned" });
    const handler = setup(registerDismissTool, client);

    const result = await handler({ feedback_id: "acme/FB-1" });
    expect(client.updateFeedback).toHaveBeenCalledWith("acme/FB-1", {
      status: "closed",
      labels: { close_reason: "not_planned" },
    });
    expect(parseResult(result)).toMatchObject({ id: "acme/FB-1", close_reason: "not_planned" });
  });

  it("closes as duplicate when close_reason is provided", async () => {
    const client = mockApiClient();
    client.updateFeedback.mockResolvedValue({ id: "acme/FB-1", status: "closed", close_reason: "duplicate" });
    const handler = setup(registerDismissTool, client);

    await handler({ feedback_id: "acme/FB-1", close_reason: "duplicate" });
    expect(client.updateFeedback).toHaveBeenCalledWith("acme/FB-1", {
      status: "closed",
      labels: { close_reason: "duplicate" },
    });
  });

  it("returns error on API failure", async () => {
    const client = mockApiClient();
    client.updateFeedback.mockRejectedValue(new Error("server error"));
    const handler = setup(registerDismissTool, client);

    const result = await handler({ feedback_id: "acme/FB-1" });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ text: "server error" });
  });
});

// ---------------------------------------------------------------------------
// resolve tool
// ---------------------------------------------------------------------------

describe("resolve tool", () => {
  it("closes with shipped reason nested in labels", async () => {
    const client = mockApiClient();
    client.updateFeedback.mockResolvedValue({ id: "acme/FB-1", status: "closed", close_reason: "shipped" });
    const handler = setup(registerResolveTool, client);

    const result = await handler({ feedback_id: "acme/FB-1" });
    expect(client.updateFeedback).toHaveBeenCalledWith("acme/FB-1", {
      status: "closed",
      labels: { close_reason: "shipped" },
    });
    expect(parseResult(result)).toMatchObject({ id: "acme/FB-1", close_reason: "shipped" });
  });

  it("includes pr_url in labels when provided", async () => {
    const client = mockApiClient();
    client.updateFeedback.mockResolvedValue({ id: "acme/FB-1", status: "closed", close_reason: "shipped" });
    const handler = setup(registerResolveTool, client);

    await handler({ feedback_id: "acme/FB-1", pr_url: "https://github.com/acme/app/pull/42" });
    expect(client.updateFeedback).toHaveBeenCalledWith("acme/FB-1", {
      status: "closed",
      labels: { close_reason: "shipped", pr_url: "https://github.com/acme/app/pull/42" },
    });
  });

  it("omits pr_url from labels when not provided", async () => {
    const client = mockApiClient();
    client.updateFeedback.mockResolvedValue({ id: "acme/FB-1", status: "closed", close_reason: "shipped" });
    const handler = setup(registerResolveTool, client);

    await handler({ feedback_id: "acme/FB-1" });
    const callArgs = client.updateFeedback.mock.calls[0]![1] as { labels: Record<string, unknown> };
    expect(callArgs.labels).not.toHaveProperty("pr_url");
  });

  it("returns error if updateFeedback fails", async () => {
    const client = mockApiClient();
    client.updateFeedback.mockRejectedValue(new Error("unauthorized"));
    const handler = setup(registerResolveTool, client);

    const result = await handler({ feedback_id: "acme/FB-1" });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ text: "unauthorized" });
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
      screenshot_url: "https://example.com/shot.png",
      console_errors: [{ message: "TypeError" }],
    };
    client.getFeedback.mockResolvedValue(feedback);
    const handler = setup(registerDetailTool, client);

    const result = await handler({ feedback_id: "acme/FB-1" });
    expect(client.getFeedback).toHaveBeenCalledWith("acme/FB-1");
    expect(parseResult(result)).toEqual(feedback);
    expect(result.structuredContent).toBeUndefined();
  });

  it("returns markdown text and structuredContent when the API includes markdown", async () => {
    const client = mockApiClient();
    client.getFeedback.mockResolvedValue({
      id: "acme/FB-1",
      description: "Full details",
      markdown: "# acme/FB-1 — Received\n\nFull details",
    });
    const handler = setup(registerDetailTool, client);

    const result = await handler({ feedback_id: "acme/FB-1" });
    expect(result.content).toEqual([{ type: "text", text: "# acme/FB-1 — Received\n\nFull details" }]);
    expect(result.structuredContent).toEqual({ id: "acme/FB-1", description: "Full details" });
  });

  it("does not call updateFeedback (read-only)", async () => {
    const client = mockApiClient();
    client.getFeedback.mockResolvedValue({ id: "acme/FB-1" });
    const handler = setup(registerDetailTool, client);

    await handler({ feedback_id: "acme/FB-1" });
    expect(client.updateFeedback).not.toHaveBeenCalled();
  });

  it("returns error on API failure", async () => {
    const client = mockApiClient();
    client.getFeedback.mockRejectedValue(new Error("not found"));
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

  it("includes signing_secret when present for account admins", async () => {
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

  it("creates a project without a domain", async () => {
    const client = mockApiClient();
    client.createProject.mockResolvedValue({ id: "acme", name: "New" });
    const handler = setup(registerProjectCreateTool, client);

    await handler({ name: "New", handle: "new-project" });
    expect(client.createProject).toHaveBeenCalledWith({ name: "New", handle: "new-project", domain: undefined });
  });

  it("returns error when not an account admin", async () => {
    const client = mockApiClient();
    client.createProject.mockRejectedValue(new Error("You must be an account admin to do this."));
    const handler = setup(registerProjectCreateTool, client);

    const result = await handler({ name: "New", handle: "new-project" });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ type: "text", text: "You must be an account admin to do this." });
  });
});
