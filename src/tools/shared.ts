import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type ToolResponse = Promise<CallToolResult>;

export function jsonToolResult(value: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

export function errorToolResult(error: unknown): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: error instanceof Error ? error.message : String(error),
      },
    ],
  };
}

// Servers that render markdown (>= v1.1) include a top-level "markdown" string;
// older self-hosted servers don't, so we fall back to plain JSON text.
export function hybridToolResult(value: unknown): CallToolResult {
  if (hasMarkdown(value)) {
    const { markdown, ...structured } = value;
    return {
      content: [
        {
          type: "text",
          text: markdown,
        },
      ],
      structuredContent: structured,
    };
  }
  return jsonToolResult(value);
}

function hasMarkdown(value: unknown): value is Record<string, unknown> & { markdown: string } {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).markdown === "string";
}

export async function runTool(handler: () => Promise<unknown>): ToolResponse {
  try {
    return jsonToolResult(await handler());
  } catch (error) {
    return errorToolResult(error);
  }
}

export async function runHybridTool(handler: () => Promise<unknown>): ToolResponse {
  try {
    return hybridToolResult(await handler());
  } catch (error) {
    return errorToolResult(error);
  }
}
