import type {
  CreateProjectAttrs,
  Feedback,
  FeedbackListResult,
  FeedbackResult,
  ListFeedbacksParams,
  MakeThisBetterClientOptions,
  Project,
  ProjectDetail,
  FeedbackResponseResult,
  RespondFeedbackAttrs,
  UpdateFeedbackAttrs,
  UpdateProjectAttrs,
} from "./types.js";
import { FEEDBACK_REFERENCE_MESSAGE, FEEDBACK_REFERENCE_PATTERN } from "../project-handle.js";
import { ApiError } from "./types.js";

export { ApiError } from "./types.js";

const REQUEST_TIMEOUT_MS = 30_000;

export class MakeThisBetterClient {
  private readonly apiUrl: string;
  private readonly apiToken: string;
  private readonly accountId?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: MakeThisBetterClientOptions) {
    this.apiUrl = options.apiUrl.replace(/\/+$/, "");
    this.apiToken = options.apiToken;
    this.accountId = options.accountId;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async listFeedbacks(params: ListFeedbacksParams): Promise<Feedback[]> {
    const { project_handle, ...filters } = params;
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) {
        query.set(key, String(value));
      }
    }

    const feedbacks = await this.request<Feedback[]>(`/projects/${encodeURIComponent(project_handle)}/feedbacks${queryString(query)}`);
    // limit goes to the server so it does not render rows we throw away, but older
    // servers ignore the parameter, so the local slice stays as the safety net.
    return typeof params.limit === "number" ? feedbacks.slice(0, params.limit) : feedbacks;
  }

  async getFeedback(reference: string): Promise<Feedback> {
    const { handle, number } = parseFeedbackReference(reference);
    return this.request<Feedback>(`/projects/${encodeURIComponent(handle)}/feedbacks/${number}`);
  }

  async listArchivedFeedbacks(params: ListFeedbacksParams): Promise<Feedback[]> {
    const { project_handle, status: _status, ...filters } = params;
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) {
        query.set(key, String(value));
      }
    }

    const result = await this.request<FeedbackListResult>(
      `/projects/${encodeURIComponent(project_handle)}/archived_feedbacks${queryString(query)}`,
    );
    return typeof params.limit === "number" ? result.feedbacks.slice(0, params.limit) : result.feedbacks;
  }

  async getFeedbackIncludingArchived(reference: string): Promise<Feedback> {
    try {
      return await this.getFeedback(reference);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) {
        throw error;
      }
      return this.getArchivedFeedback(reference);
    }
  }

  async getArchivedFeedback(reference: string): Promise<Feedback> {
    const { handle, number } = parseFeedbackReference(reference);
    const result = await this.request<FeedbackResult>(
      `/projects/${encodeURIComponent(handle)}/archived_feedbacks/${number}`,
    );
    return result.feedback;
  }

  async updateFeedback(reference: string, attrs: UpdateFeedbackAttrs): Promise<Feedback> {
    const { handle, number } = parseFeedbackReference(reference);
    return this.request<Feedback>(`/projects/${encodeURIComponent(handle)}/feedbacks/${number}`, {
      method: "PATCH",
      body: JSON.stringify({ feedback: attrs }),
    });
  }

  async respondFeedback(reference: string, attrs: RespondFeedbackAttrs): Promise<FeedbackResponseResult> {
    const { handle, number } = parseFeedbackReference(reference);
    return this.request<FeedbackResponseResult>(`/projects/${encodeURIComponent(handle)}/feedbacks/${number}/response`, {
      method: "POST",
      body: JSON.stringify({ feedback_response: attrs }),
    });
  }

  async archiveFeedback(reference: string): Promise<Feedback> {
    return this.changeFeedbackArchive(reference, "POST");
  }

  async restoreFeedback(reference: string): Promise<Feedback> {
    return this.changeFeedbackArchive(reference, "DELETE");
  }

  async readyFeedback(reference: string, resolutionSummary: string): Promise<Feedback> {
    const { handle, number } = parseFeedbackReference(reference);
    return this.request<Feedback>(`/projects/${encodeURIComponent(handle)}/feedbacks/${number}/readiness`, {
      method: "POST",
      body: JSON.stringify({
        feedback_readiness: { resolution_summary: resolutionSummary },
      }),
    }, this.apiUrlForVersion("v2"));
  }

  async listProjects(): Promise<Project[]> {
    return this.request<Project[]>("/projects");
  }

  async getProject(id: string): Promise<ProjectDetail> {
    return this.request<ProjectDetail>(`/projects/${encodeURIComponent(id)}`);
  }

  async createProject(attrs: CreateProjectAttrs): Promise<ProjectDetail> {
    return this.request<ProjectDetail>("/projects", {
      method: "POST",
      body: JSON.stringify({ project: attrs }),
    });
  }

  async updateProject(id: string, attrs: UpdateProjectAttrs): Promise<ProjectDetail> {
    return this.request<ProjectDetail>(`/projects/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ project: attrs }),
    });
  }

  private async changeFeedbackArchive(reference: string, method: "POST" | "DELETE"): Promise<Feedback> {
    const { handle, number } = parseFeedbackReference(reference);
    const result = await this.request<FeedbackResult>(`/projects/${encodeURIComponent(handle)}/feedbacks/${number}/archive`, {
      method,
    });
    return result.feedback;
  }

  private apiUrlForVersion(version: string): string {
    if (!this.apiUrl.endsWith("/v1")) {
      throw new Error("api_url must end in /v1 for feedback workflow tools; update ~/.makethisbetter/config.json");
    }

    return `${this.apiUrl.slice(0, -2)}${version}`;
  }

  private async request<T>(path: string, init: RequestInit = {}, apiUrl = this.apiUrl): Promise<T> {
    const response = await this.fetchImpl(`${apiUrl}${this.withAccount(path)}`, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "Authorization": `Bearer ${this.apiToken}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
        ...init.headers,
      },
    });

    const body = await parseBody(response);

    if (!response.ok) {
      throw new ApiError(response.status, errorMessage(response.status, body), body);
    }

    return body as T;
  }

  // Users in more than one account must say which one. Without account_id the server falls
  // back to the user's first account, so projects in the other account 404 and new projects
  // land in the wrong place. The CLI sends it as a query param on every request; match that.
  private withAccount(path: string): string {
    if (!this.accountId) {
      return path;
    }

    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}account_id=${encodeURIComponent(this.accountId)}`;
  }

}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (text.length === 0) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function queryString(query: URLSearchParams): string {
  const value = query.toString();
  return value.length > 0 ? `?${value}` : "";
}

function parseFeedbackReference(reference: string): { handle: string; number: string } {
  const match = FEEDBACK_REFERENCE_PATTERN.exec(reference);
  if (!match) {
    throw new Error(FEEDBACK_REFERENCE_MESSAGE);
  }

  return { handle: match[1], number: match[2] };
}

// What the agent should do next for each status the API rejects a request with. Several of
// these endpoints answer with an empty body (e.g. `head :forbidden`), so without this the
// agent would only see "HTTP 403" and have nothing to act on.
const NEXT_ACTION_BY_STATUS: Record<number, string> = {
  401: "Re-login or update ~/.makethisbetter/config.json with a valid api_token.",
  403: "Check your plan, role, project assignment, and account_id in ~/.makethisbetter/config.json.",
  404: "Check the project handle and feedback number. If they are right, the project may live in another account — set account_id in ~/.makethisbetter/config.json.",
  422: "The server rejected the submitted values. Fix the arguments and call the tool again.",
};

function errorMessage(status: number, body: unknown): string {
  // The server's own message says what happened; ours says what to do next. Keep both when
  // the server sends one, and fall back to the next action alone for empty bodies.
  const serverMessage = isErrorBody(body) ? body.error.trim() : "";
  const nextAction = NEXT_ACTION_BY_STATUS[status];

  if (serverMessage && nextAction) {
    return `${serverMessage} ${nextAction}`;
  }

  if (serverMessage) {
    return serverMessage;
  }

  if (nextAction) {
    return `Make This Better API returned ${status}. ${nextAction}`;
  }

  return `Make This Better API request failed with HTTP ${status}.`;
}

function isErrorBody(body: unknown): body is { error: string } {
  return Boolean(body) && typeof body === "object" && typeof (body as { error?: unknown }).error === "string";
}
