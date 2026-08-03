import { describe, expect, it, vi } from "vitest";
import { ApiError, MakeThisBetterClient } from "./client.js";

describe("MakeThisBetterClient", () => {
  it("sends filters and limit to the server, and still slices locally", async () => {
    // Servers that do not honour limit yet return everything, so the local slice keeps the
    // agent's requested count honest.
    const fetchImpl = vi.fn(async () => jsonResponse([
      { id: "FB-1", reference: "acme/FB-1", project_id: "acme" },
      { id: "FB-2", reference: "acme/FB-2", project_id: "acme" },
    ]));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1/", apiToken: "token_123", fetchImpl });

    await expect(client.listFeedbacks({ project_handle: "acme", status: "received", label: "Safari", limit: 1 })).resolves.toEqual([
      { id: "FB-1", reference: "acme/FB-1", project_id: "acme" },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/api/v1/projects/acme/feedbacks?status=received&label=Safari&limit=1", expect.objectContaining({
      headers: expect.objectContaining({
        "Authorization": "Bearer token_123",
        "Accept": "application/json",
      }),
    }));
  });

  it("sends account_id from the config on every request", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const client = new MakeThisBetterClient({
      apiUrl: "https://example.test/api/v1",
      apiToken: "token_123",
      accountId: "acc_123",
      fetchImpl,
    });

    await client.listFeedbacks({ project_handle: "acme", status: "received" });
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/api/v1/projects/acme/feedbacks?status=received&account_id=acc_123", expect.any(Object));

    await client.listProjects();
    expect(fetchImpl).toHaveBeenLastCalledWith("https://example.test/api/v1/projects?account_id=acc_123", expect.any(Object));
  });

  it("sends account_id on writes", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "FB-1" }));
    const client = new MakeThisBetterClient({
      apiUrl: "https://example.test/api/v1",
      apiToken: "token_123",
      accountId: "acc_123",
      fetchImpl,
    });

    await client.createProject({ name: "New", handle: "new-project", domain: "example.com" });
    expect(fetchImpl).toHaveBeenLastCalledWith("https://example.test/api/v1/projects?account_id=acc_123", expect.objectContaining({ method: "POST" }));

  });

  it("omits account_id when the config does not set one", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await client.listProjects();
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/api/v1/projects", expect.any(Object));
  });

  it("fetches one feedback", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "FB-1", reference: "acme/FB-1", project_id: "acme" }));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await expect(client.getFeedback("acme/FB-1")).resolves.toEqual({ id: "FB-1", reference: "acme/FB-1", project_id: "acme" });
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/api/v1/projects/acme/feedbacks/1", expect.any(Object));
  });

  it("accepts a feedback reference with a 63-character handle", async () => {
    const handle = "a".repeat(63);
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "FB-1", reference: `${handle}/FB-1`, project_id: handle }));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await client.getFeedback(`${handle}/FB-1`);
    expect(fetchImpl).toHaveBeenCalledWith(`https://example.test/api/v1/projects/${handle}/feedbacks/1`, expect.any(Object));
  });

  it.each(["abc/FB-1", "ab--cd/FB-1", `${"a".repeat(64)}/FB-1`])("rejects invalid feedback reference %s", async (reference) => {
    const fetchImpl = vi.fn();
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await expect(client.getFeedback(reference)).rejects.toThrow("Feedback reference must use");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("explains the R-LDH restriction in feedback reference errors", async () => {
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl: vi.fn() });

    await expect(client.getFeedback("ab--cd/FB-1")).rejects.toThrow("third and fourth characters cannot both be hyphens");
  });

  it("updates feedback attributes under the Rails feedback root", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "FB-1", project_id: "acme", status: "closed" }));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await client.updateFeedback("acme/FB-1", { status: "closed", close_reason: "not_planned" });
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/api/v1/projects/acme/feedbacks/1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ feedback: { status: "closed", close_reason: "not_planned" } }),
    }));
  });

  it("responds through the dedicated resource without echoing client-only fields", async () => {
    const payload = {
      feedback: { id: "FB-1", reference: "acme/FB-1", status: "closed" },
      delivery: { id: "delivery_1", status: "pending", created_at: "2026-08-03T12:00:00Z" },
    };
    const fetchImpl = vi.fn(async () => jsonResponse(payload));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await expect(client.respondFeedback("acme/FB-1", { body: "Final response", subject: "Update" })).resolves.toEqual(payload);
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/api/v1/projects/acme/feedbacks/1/response", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ feedback_response: { body: "Final response", subject: "Update" } }),
    }));
  });

  it("lists and reads feedback from the archived collection", async () => {
    const archived = { id: "FB-4", reference: "acme/FB-4", archived_at: "2026-08-03T12:00:00Z" };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ feedbacks: [archived] }))
      .mockResolvedValueOnce(jsonResponse({ feedback: archived }));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await expect(client.listArchivedFeedbacks({ project_handle: "acme", label: "Bug", priority: "low", limit: 1 })).resolves.toEqual([archived]);
    await expect(client.getArchivedFeedback("acme/FB-4")).resolves.toEqual(archived);

    expect(fetchImpl).toHaveBeenNthCalledWith(1, "https://example.test/api/v1/projects/acme/archived_feedbacks?label=Bug&priority=low&limit=1", expect.any(Object));
    expect(fetchImpl).toHaveBeenNthCalledWith(2, "https://example.test/api/v1/projects/acme/archived_feedbacks/4", expect.any(Object));
  });

  it("falls back to archived detail only when active detail is absent", async () => {
    const archived = { id: "FB-4", reference: "acme/FB-4", archived_at: "2026-08-03T12:00:00Z" };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: "Not found" }, { status: 404 }))
      .mockResolvedValueOnce(jsonResponse({ feedback: archived }));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await expect(client.getFeedbackIncludingArchived("acme/FB-4")).resolves.toEqual(archived);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("archives and restores through the singleton archive resource", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ feedback: { id: "FB-4", reference: "acme/FB-4" } }));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await client.archiveFeedback("acme/FB-4");
    await client.restoreFeedback("acme/FB-4");

    expect(fetchImpl).toHaveBeenNthCalledWith(1, "https://example.test/api/v1/projects/acme/feedbacks/4/archive", expect.objectContaining({ method: "POST" }));
    expect(fetchImpl).toHaveBeenNthCalledWith(2, "https://example.test/api/v1/projects/acme/feedbacks/4/archive", expect.objectContaining({ method: "DELETE" }));
  });

  it("marks feedback ready through the v2 readiness resource", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "FB-1", status: "pending_release" }));
    const client = new MakeThisBetterClient({
      apiUrl: "https://example.test/api/v1",
      apiToken: "token_123",
      accountId: "acc_123",
      fetchImpl,
    });

    await client.readyFeedback("acme/FB-1", "Fixed Safari export.");
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/api/v2/projects/acme/feedbacks/1/readiness?account_id=acc_123", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ feedback_readiness: { resolution_summary: "Fixed Safari export." } }),
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

  it("updates mutable project fields under the Rails project root", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "acme", name: "Renamed", ai_context: "B2B SaaS" }));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await client.updateProject("acme", { name: "Renamed", ai_context: "B2B SaaS" });
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/api/v1/projects/acme", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ project: { name: "Renamed", ai_context: "B2B SaaS" } }),
    }));
  });

  it("states the next action for an empty-bodied 403", async () => {
    // Rails answers `head :forbidden` here, so there is no server message to relay.
    const fetchImpl = vi.fn(async () => new Response(null, { status: 403 }));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await expect(client.createProject({ name: "New", handle: "new-project", domain: "example.com" })).rejects.toMatchObject({
      name: "ApiError",
      status: 403,
      message: "Make This Better API returned 403. Check your plan, role, project assignment, and account_id in ~/.makethisbetter/config.json.",
    } satisfies Partial<ApiError>);
  });

  it("keeps a server-supplied message and appends the next action", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "You must be an account admin." }, { status: 403 }));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await expect(client.createProject({ name: "New", handle: "new-project", domain: "example.com" })).rejects.toMatchObject({
      name: "ApiError",
      status: 403,
      message: expect.stringMatching(/^You must be an account admin\. .*account_id/),
    } satisfies Partial<ApiError>);
  });

  it("points a 404 at the account the project may live in", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await expect(client.getFeedback("acme/FB-1")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      message: expect.stringContaining("set account_id in ~/.makethisbetter/config.json"),
    } satisfies Partial<ApiError>);
  });

  it("tells the agent to fix its arguments on 422", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "Handle has already been taken." }, { status: 422 }));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await expect(client.createProject({ name: "New", handle: "new-project", domain: "example.com" })).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      message: expect.stringMatching(/^Handle has already been taken\. .*call the tool again/),
    } satisfies Partial<ApiError>);
  });

  it("falls back to the bare status for an unmapped error", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));
    const client = new MakeThisBetterClient({ apiUrl: "https://example.test/api/v1", apiToken: "token_123", fetchImpl });

    await expect(client.listProjects()).rejects.toMatchObject({
      name: "ApiError",
      status: 500,
      message: "Make This Better API request failed with HTTP 500.",
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
