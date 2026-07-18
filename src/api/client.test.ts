import { describe, expect, it, vi } from "vitest";
import { ApiError, MakeThisBetterClient } from "./client.js";

describe("MakeThisBetterClient", () => {
  it("lists feedbacks with filters and applies local limit", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([
      { id: "fdb_1" },
      { id: "fdb_2" },
    ]));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1/", apiToken: "token_123", fetchImpl });

    await expect(client.listFeedbacks({ status: "received", feedback_type: "bug", limit: 1 })).resolves.toEqual([{ id: "fdb_1" }]);
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/api/v1/feedbacks?status=received&feedback_type=bug", expect.objectContaining({
      headers: expect.objectContaining({
        "Authorization": "Bearer token_123",
        "Accept": "application/json",
      }),
    }));
  });

  it("fetches one feedback", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "fdb_1" }));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await expect(client.getFeedback("fdb_1")).resolves.toEqual({ id: "fdb_1" });
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/api/v1/feedbacks/fdb_1", expect.any(Object));
  });

  it("updates feedback attributes under the Rails feedback root", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "fdb_1", status: "closed" }));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await client.updateFeedback("fdb_1", { status: "closed", labels: { close_reason: "shipped" } });
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/api/v1/feedbacks/fdb_1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ feedback: { status: "closed", labels: { close_reason: "shipped" } } }),
    }));
  });

  it("passes AbortSignal.timeout to every request", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "t", fetchImpl });

    await client.listFeedbacks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callArgs = (fetchImpl.mock.calls as any)[0]?.[1] as RequestInit | undefined;
    expect(callArgs?.signal).toBeInstanceOf(AbortSignal);
  });

  it("raises a re-login message for 401 responses", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "Unauthorized" }, { status: 401 }));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "bad_token", fetchImpl });

    await expect(client.getFeedback("fdb_1")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      message: expect.stringContaining("Re-login"),
    } satisfies Partial<ApiError>);
  });

  it("lists projects", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([{ id: "project_1", name: "Acme" }]));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await expect(client.listProjects()).resolves.toEqual([{ id: "project_1", name: "Acme" }]);
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/api/v1/projects", expect.any(Object));
  });

  it("fetches one project", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "project_1", name: "Acme", api_key: "mtb_proj_abc" }));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await expect(client.getProject("project_1")).resolves.toEqual({ id: "project_1", name: "Acme", api_key: "mtb_proj_abc" });
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/api/v1/projects/project_1", expect.any(Object));
  });

  it("creates a project under the Rails project root", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "project_1", name: "New" }, { status: 201 }));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await client.createProject({ name: "New", domain: "example.com" });
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/api/v1/projects", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ project: { name: "New", domain: "example.com" } }),
    }));
  });

  it("raises a forbidden message for 403 responses", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "You must be an account admin to do this." }, { status: 403 }));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await expect(client.createProject({ name: "New" })).rejects.toMatchObject({
      name: "ApiError",
      status: 403,
      message: "You must be an account admin to do this.",
    } satisfies Partial<ApiError>);
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}
