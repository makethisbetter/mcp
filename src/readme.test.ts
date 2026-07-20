import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

describe("README installation", () => {
  it("uses npx from each client's user-level configuration", () => {
    expect(readme).toContain("claude mcp add --scope user makethisbetter -- npx -y @makethisbetter/mcp");
    expect(readme).toContain("~/.cursor/mcp.json");
    expect(readme).toContain("~/.codeium/windsurf/mcp_config.json");
    expect(readme).toContain("MCP: Open User Configuration");
    expect(readme).not.toContain("Add to `.windsurf/mcp.json`");
    expect(readme).not.toContain("Add to `.vscode/mcp.json`");
  });
});
