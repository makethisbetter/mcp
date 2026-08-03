import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MakeThisBetterClient } from "./api/client.js";
import { loadConfig } from "./config.js";
import { registerDetailTool } from "./tools/detail.js";
import { registerListTool } from "./tools/list.js";
import { registerPickTool } from "./tools/pick.js";
import { registerReadyTool } from "./tools/ready.js";
import { registerDeclineTool } from "./tools/decline.js";
import { registerDuplicateTool } from "./tools/duplicate.js";
import { registerReopenTool } from "./tools/reopen.js";
import { registerRespondTool } from "./tools/respond.js";
import { registerArchiveTool, registerRestoreTool } from "./tools/archive.js";
import {
  registerProjectCreateTool,
  registerProjectListTool,
  registerProjectShowTool,
  registerProjectUpdateTool,
} from "./tools/projects.js";

// Read from package.json rather than repeating the number here: clients see this in the
// initialize handshake, and a second copy drifts from the published version silently.
// src/ and dist/ sit at the same depth, so the relative path holds for both.
export const SERVER_VERSION: string = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }
).version;

export function createMcpServer(client: MakeThisBetterClient): McpServer {
  const server = new McpServer({
    name: "@makethisbetter/mcp",
    version: SERVER_VERSION,
  });

  registerListTool(server, client);
  registerPickTool(server, client);
  registerReadyTool(server, client);
  registerDeclineTool(server, client);
  registerDuplicateTool(server, client);
  registerReopenTool(server, client);
  registerRespondTool(server, client);
  registerArchiveTool(server, client);
  registerRestoreTool(server, client);
  registerDetailTool(server, client);
  registerProjectListTool(server, client);
  registerProjectShowTool(server, client);
  registerProjectCreateTool(server, client);
  registerProjectUpdateTool(server, client);

  return server;
}

export async function runServer(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    process.stdout.write([
      "Make This Better MCP server",
      "",
      "Usage: makethisbetter-mcp",
      "",
      "Reads ~/.makethisbetter/config.json by default.",
      "Set MAKETHISBETTER_CONFIG=/path/to/config.json to override the config path.",
      "",
    ].join("\n"));
    return;
  }

  const config = await loadConfig();
  const client = new MakeThisBetterClient({
    apiUrl: config.api_url,
    apiToken: config.api_token,
    accountId: config.account_id,
  });
  const server = createMcpServer(client);
  await server.connect(new StdioServerTransport());
}
