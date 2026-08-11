import { z } from "zod";

const PROJECT_HANDLE_SOURCE = "(?![a-z0-9]{2}--)[a-z0-9](?:[a-z0-9-]{2,61}[a-z0-9])";
const PROJECT_HANDLE_MESSAGE = "Project handle must be 4-63 lowercase letters, numbers, or internal hyphens; the third and fourth characters cannot both be hyphens.";
export const FEEDBACK_REFERENCE_MESSAGE = "Feedback reference must use {project-handle}/FB-{number}, for example acme/FB-42; the handle's third and fourth characters cannot both be hyphens.";

export const PROJECT_HANDLE_PATTERN = new RegExp(`^${PROJECT_HANDLE_SOURCE}$`);
export const FEEDBACK_REFERENCE_PATTERN = new RegExp(`^(${PROJECT_HANDLE_SOURCE})/FB-([1-9]\\d*)$`);

export const projectHandleSchema = z.string()
  .regex(PROJECT_HANDLE_PATTERN, PROJECT_HANDLE_MESSAGE);

export const feedbackReferenceSchema = z.string()
  .regex(FEEDBACK_REFERENCE_PATTERN, FEEDBACK_REFERENCE_MESSAGE);
