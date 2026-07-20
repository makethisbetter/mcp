import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MakeThisBetterClient } from "./api/client.js";
import { loadConfig } from "./config.js";
import { registerDetailTool } from "./tools/detail.js";
import { registerListTool } from "./tools/list.js";
import { registerPickTool } from "./tools/pick.js";
import { registerResolveTool } from "./tools/resolve.js";
import { registerDismissTool } from "./tools/dismiss.js";
import {
  registerProjectCreateTool,
  registerProjectListTool,
  registerProjectShowTool,
} from "./tools/projects.js";

export function createMcpServer(client: MakeThisBetterClient): McpServer {
  const server = new McpServer({
    name: "@makethisbetter/mcp",
    version: "0.1.0",
  });

  registerListTool(server, client);
  registerPickTool(server, client);
  registerDismissTool(server, client);
  registerResolveTool(server, client);
  registerDetailTool(server, client);
  registerProjectListTool(server, client);
  registerProjectShowTool(server, client);
  registerProjectCreateTool(server, client);

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
  });
  const server = createMcpServer(client);
  await server.connect(new StdioServerTransport());
}
