import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type MakeThisBetterConfig = {
  api_token: string;
  api_url: string;
};

const DEFAULT_API_URL = "https://makethisbetter.dev/api/v1";

export function configPath(): string {
  if (process.env.MAKETHISBETTER_CONFIG) {
    return process.env.MAKETHISBETTER_CONFIG;
  }

  return join(homedir(), ".makethisbetter", "config.json");
}

export async function loadConfig(path = configPath()): Promise<MakeThisBetterConfig> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid Make This Better config JSON at ${path}.`);
    }

    throw new Error(`Missing Make This Better config at ${path}. Run setup or create the file with api_token and api_url.`);
  }

  if (!isConfigObject(parsed)) {
    throw new Error(`Invalid Make This Better config at ${path}. Expected api_token and optional api_url.`);
  }

  return {
    api_token: parsed.api_token.trim(),
    api_url: normalizeApiUrl(parsed.api_url ?? DEFAULT_API_URL),
  };
}

function isConfigObject(value: unknown): value is { api_token: string; api_url?: string } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.api_token === "string" && candidate.api_token.trim().length > 0
    && (candidate.api_url === undefined || typeof candidate.api_url === "string");
}

function normalizeApiUrl(url: string): string {
  return url.replace(/\/+$/, "");
}
