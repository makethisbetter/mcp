export type FeedbackStatus = "received" | "in_progress" | "pending_release" | "closed";
export type FeedbackType = "bug" | "feature" | "improvement" | "question";
export type FeedbackPriority = "critical" | "high" | "medium" | "low";
export type CloseReason = "shipped" | "not_planned" | "duplicate";

export type Feedback = {
  id: string;
  reference: string;
  number: number;
  project_id: string;
  project_handle: string;
  description: string | null;
  ai_structured_summary: Record<string, unknown> | null;
  page_url: string | null;
  screenshot_url: string | null;
  user_agent: string | null;
  browser: string | null;
  os: string | null;
  console_errors: unknown[];
  target_element: Record<string, unknown> | null;
  reporter_email: string | null;
  reporter_name: string | null;
  reporter_external_id: string | null;
  status: FeedbackStatus;
  labels: Record<string, unknown>;
  priority: FeedbackPriority | null;
  upvotes_count: number;
  created_at: string;
  updated_at: string;
  feedback_type: FeedbackType | null;
  recommendation: string | null;
  close_reason: CloseReason | null;
  custom_labels: unknown[];
  screenshot_attached: boolean;
  recording_attached: boolean;
  recording_duration: number | null;
  recording_url: string | null;
  ai_clarify_available: boolean;
  markdown?: string;
};

export type ListFeedbacksParams = {
  project_handle: string;
  status?: FeedbackStatus;
  feedback_type?: FeedbackType;
  limit?: number;
};

// The API only persists close_reason/pr_url through the labels hash
// (Rails derives Feedback#close_reason from labels), so updates send labels.
export type UpdateFeedbackAttrs = {
  status?: FeedbackStatus;
  labels?: Record<string, unknown>;
};

export type Project = {
  id: string;
  handle: string;
  name: string;
  domain: string | null;
  feedback_visibility: string;
  created_at: string;
  updated_at: string;
  feedbacks_count: number;
};

// GET /projects/:id and POST /projects return these extra fields on top of Project.
// signing_secret is only present for account admins.
export type ProjectDetail = Project & {
  api_key: string;
  board_url: string | null;
  enforce_identity_verification: boolean;
  signing_secret?: string;
};

export type CreateProjectAttrs = {
  name: string;
  handle: string;
  domain?: string;
};

export type MakeThisBetterClientOptions = {
  apiUrl: string;
  apiToken: string;
  fetchImpl?: typeof fetch;
};

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}
