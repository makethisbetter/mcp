import { describe, expect, it, vi } from "vitest";
import { ApiError, MakeThisBetterClient } from "./client.js";

describe("MakeThisBetterClient", () => {
  it("lists feedbacks with filters and applies local limit", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([
      { id: "FB-1", reference: "acme/FB-1", project_id: "acme" },
      { id: "FB-2", reference: "acme/FB-2", project_id: "acme" },
    ]));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1/", apiToken: "token_123", fetchImpl });

    await expect(client.listFeedbacks({ project_handle: "acme", status: "received", feedback_type: "bug", limit: 1 })).resolves.toEqual([
      { id: "FB-1", reference: "acme/FB-1", project_id: "acme" },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/api/v1/projects/acme/feedbacks?status=received&feedback_type=bug", expect.objectContaining({
      headers: expect.objectContaining({
        "Authorization": "Bearer token_123",
        "Accept": "application/json",
      }),
    }));
  });

  it("fetches one feedback", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "FB-1", reference: "acme/FB-1", project_id: "acme" }));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await expect(client.getFeedback("acme/FB-1")).resolves.toEqual({ id: "FB-1", reference: "acme/FB-1", project_id: "acme" });
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/api/v1/projects/acme/feedbacks/1", expect.any(Object));
  });

  it("updates feedback attributes under the Rails feedback root", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "FB-1", project_id: "acme", status: "closed" }));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await client.updateFeedback("acme/FB-1", { status: "closed", labels: { close_reason: "shipped" } });
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/api/v1/projects/acme/feedbacks/1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ feedback: { status: "closed", labels: { close_reason: "shipped" } } }),
    }));
  });

  it("passes AbortSignal.timeout to every request", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "t", fetchImpl });

    await client.listFeedbacks({ project_handle: "acme" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callArgs = (fetchImpl.mock.calls as any)[0]?.[1] as RequestInit | undefined;
    expect(callArgs?.signal).toBeInstanceOf(AbortSignal);
  });

  it("raises a re-login message for 401 responses", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "Unauthorized" }, { status: 401 }));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "bad_token", fetchImpl });

    await expect(client.getFeedback("acme/FB-1")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      message: expect.stringContaining("Re-login"),
    } satisfies Partial<ApiError>);
  });

  it("lists projects", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([{ id: "acme", handle: "acme", name: "Acme" }]));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await expect(client.listProjects()).resolves.toEqual([{ id: "acme", handle: "acme", name: "Acme" }]);
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/api/v1/projects", expect.any(Object));
  });

  it("fetches one project", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "acme", handle: "acme", name: "Acme", api_key: "mtb_proj_abc" }));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await expect(client.getProject("acme")).resolves.toEqual({ id: "acme", handle: "acme", name: "Acme", api_key: "mtb_proj_abc" });
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/api/v1/projects/acme", expect.any(Object));
  });

  it("creates a project under the Rails project root", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "new-project", handle: "new-project", name: "New" }, { status: 201 }));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await client.createProject({ name: "New", handle: "new-project", domain: "example.com" });
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/api/v1/projects", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ project: { name: "New", handle: "new-project", domain: "example.com" } }),
    }));
  });

  it("raises a forbidden message for 403 responses", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "You must be an account admin to do this." }, { status: 403 }));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await expect(client.createProject({ name: "New", handle: "new-project" })).rejects.toMatchObject({
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
