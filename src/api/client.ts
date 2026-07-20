import type {
  CreateProjectAttrs,
  Feedback,
  ListFeedbacksParams,
  MakeThisBetterClientOptions,
  Project,
  ProjectDetail,
  UpdateFeedbackAttrs,
} from "./types.js";
import { ApiError } from "./types.js";

export { ApiError } from "./types.js";

const REQUEST_TIMEOUT_MS = 30_000;

export class MakeThisBetterClient {
  private readonly apiUrl: string;
  private readonly apiToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: MakeThisBetterClientOptions) {
    this.apiUrl = options.apiUrl.replace(/\/+$/, "");
    this.apiToken = options.apiToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async listFeedbacks(params: ListFeedbacksParams): Promise<Feedback[]> {
    const { project_handle, limit, ...filters } = params;
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) {
        query.set(key, String(value));
      }
    }

    const feedbacks = await this.request<Feedback[]>(`/projects/${encodeURIComponent(project_handle)}/feedbacks${queryString(query)}`);
    return typeof limit === "number" ? feedbacks.slice(0, limit) : feedbacks;
  }

  async getFeedback(reference: string): Promise<Feedback> {
    const { handle, number } = parseFeedbackReference(reference);
    return this.request<Feedback>(`/projects/${encodeURIComponent(handle)}/feedbacks/${number}`);
  }

  async updateFeedback(reference: string, attrs: UpdateFeedbackAttrs): Promise<Feedback> {
    const { handle, number } = parseFeedbackReference(reference);
    return this.request<Feedback>(`/projects/${encodeURIComponent(handle)}/feedbacks/${number}`, {
      method: "PATCH",
      body: JSON.stringify({ feedback: attrs }),
    });
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

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.apiUrl}${path}`, {
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
  const match = /^([a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9]))\/FB-([1-9]\d*)$/.exec(reference);
  if (!match) {
    throw new Error("Feedback reference must use {project-handle}/FB-{number}, for example acme/FB-42.");
  }

  return { handle: match[1], number: match[2] };
}

function errorMessage(status: number, body: unknown): string {
  if (status === 401) {
    return "Make This Better API returned 401. Re-login or update ~/.makethisbetter/config.json with a valid api_token.";
  }

  if (isErrorBody(body)) {
    return body.error;
  }

  return `Make This Better API request failed with HTTP ${status}.`;
}

function isErrorBody(body: unknown): body is { error: string } {
  return Boolean(body) && typeof body === "object" && typeof (body as { error?: unknown }).error === "string";
}
