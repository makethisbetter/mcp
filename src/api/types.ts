export type FeedbackStatus = "received" | "in_progress" | "pending_release" | "closed";
export type FeedbackPriority = "critical" | "high" | "medium" | "low";
export type CloseReason = "shipped" | "not_planned" | "duplicate" | "responded";
export type AiTriageStatus = "pending" | "processing" | "completed" | "failed" | "credits_exhausted";
export type AiClarificationStatus = "idle" | "active" | "completed";

// Where the reporter pointed on the page. targetRect is the element's bounding box as the
// widget captured it; its keys are the widget's, so it stays an open record rather than a
// shape this package has to keep in step.
export type FeedbackAnnotation = {
  x: number;
  y: number;
  type: string;
  targetName?: string | null;
  targetText?: string | null;
  targetSelector?: string | null;
  targetRect?: Record<string, unknown> | null;
};

// What the reporter did on the way to reporting. The widget records several event kinds and
// adds more over time, so this stays an open record: modelling it would silently drop keys.
export type FeedbackBreadcrumb = Record<string, unknown>;

// The AI's follow-up questions and the reporter's answers, oldest first.
export type AiClarificationMessage = {
  role: string;
  content: string;
};

export type Feedback = {
  id: string;
  reference: string;
  number: number;
  project_id: string;
  project_handle: string;
  description: string | null;
  ai_structured_summary: Record<string, unknown> | null;
  page_url: string | null;
  user_agent: string | null;
  browser: string | null;
  os: string | null;
  console_errors: unknown[];
  target_element: Record<string, unknown> | null;
  reporter_email: string | null;
  reporter_name: string | null;
  reporter_external_id: string | null;
  status: FeedbackStatus;
  labels: string[];
  priority: FeedbackPriority | null;
  upvotes_count: number;
  created_at: string;
  updated_at: string;
  recommendation: string | null;
  close_reason: CloseReason | null;
  pr_url: string | null;
  assignee: { id: string; name: string } | null;
  resolution_summary: string | null;
  canonical_feedback: { id: string; reference: string } | null;
  terminal_outcome_at: string | null;
  closing_comment: string | null;
  closing_comment_status: string;
  archived_at?: string | null;
  // Attachment bytes are never inlined. Authorized feedback API callers receive URLs for
  // screenshots and recordings when each attachment exists.
  screenshot_attached: boolean;
  screenshot_url: string | null;
  recording_attached: boolean;
  recording_duration: number | null;
  recording_url: string | null;
  ai_clarify_available: boolean;
  // Evidence the reporter left behind. The API always sends annotations and breadcrumbs as
  // arrays, so an empty one means "none recorded" — never "this server is too old to send it".
  annotations: FeedbackAnnotation[];
  breadcrumbs: FeedbackBreadcrumb[];
  ai_clarification_messages: AiClarificationMessage[];
  // Reproducing a layout bug needs the viewport, not just the browser string.
  screen_width: number | null;
  screen_height: number | null;
  reporter_language: string | null;
  // Without ai_triage_status a feedback whose triage failed looks identical to one that was
  // never triaged — both simply lack ai_structured_summary. ai_triage_error carries the
  // truncated exception message when the status is "failed".
  ai_triage_status: AiTriageStatus;
  ai_triage_error: string | null;
  ai_clarification_status: AiClarificationStatus;
  markdown?: string;
};

export type ListFeedbacksParams = {
  project_handle: string;
  status?: FeedbackStatus;
  label?: string;
  priority?: FeedbackPriority;
  limit?: number;
};

export type FeedbackResult = {
  feedback: Feedback;
};

export type FeedbackListResult = {
  feedbacks: Feedback[];
};

export type UpdateFeedbackAttrs = {
  status?: FeedbackStatus;
  takeover?: boolean;
  close_reason?: "not_planned" | "duplicate";
  pr_url?: string;
  resolution_summary?: string;
  canonical_feedback_id?: string;
};

export type RespondFeedbackAttrs = {
  body: string;
  subject?: string;
};

export type FeedbackResponseResult = {
  feedback: Feedback;
  delivery: {
    id: string;
    status: string;
    created_at: string;
    updated_at?: string;
  };
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
  ai_context?: string | null;
};

// GET /projects/:id and POST /projects return these extra fields on top of Project.
// signing_secret is present for account Owners/Admins and Active Pro Members.
export type ProjectDetail = Project & {
  api_key: string;
  board_url: string | null;
  enforce_identity_verification: boolean;
  signing_secret?: string;
};

// domain is required: a project without one cannot verify where the widget is allowed to run.
export type CreateProjectAttrs = {
  name: string;
  handle: string;
  domain: string;
};

export type UpdateProjectAttrs = {
  name?: string;
  domain?: string;
  ai_context?: string;
};

export type MakeThisBetterClientOptions = {
  apiUrl: string;
  apiToken: string;
  // Required for users who belong to more than one account; see MakeThisBetterClient.
  accountId?: string;
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
