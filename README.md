<p align="center">
  <img src="https://makethisbetter.dev/icon.svg" width="80" height="80" alt="Make This Better">
</p>

<h1 align="center">@makethisbetter/mcp</h1>

<p align="center">
  Your users' feedback, piped straight into your coding agent's context.
</p>

<p align="center">
  <a href="https://makethisbetter.dev">makethisbetter.dev</a> &middot;
  <a href="https://www.npmjs.com/package/@makethisbetter/mcp"><img src="https://img.shields.io/npm/v/@makethisbetter/mcp.svg" alt="npm version"></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-compatible-8A2BE2" alt="MCP compatible"></a>
  <a href="https://github.com/makethisbetter/mcp/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="license"></a>
</p>

---

Your users report bugs and requests through the [widget](https://github.com/makethisbetter/makethisbetter-js). AI triage categorizes and prioritizes them. This MCP server lets your coding agent pull that feedback in, fix the code, and mark it shipped — all without you copy-pasting anything.

```
User reports a bug  →  AI triage  →  Agent picks it up  →  Code fix  →  User gets notified
     (widget)          (server)      (this MCP server)      (agent)       (resolve tool)
```

## Install

```bash
npm install -g @makethisbetter/mcp
```

## Setup

### 1. Authenticate

If you have the [CLI](https://github.com/makethisbetter/cli) installed, just log in — it creates the config for you:

```bash
makethisbetter login
```

Or create the config manually:

```bash
mkdir -p ~/.makethisbetter
cat > ~/.makethisbetter/config.json << 'EOF'
{
  "api_token": "YOUR_API_TOKEN",
  "api_url": "https://makethisbetter.dev/api/v1"
}
EOF
```

Get your API token from [makethisbetter.dev](https://makethisbetter.dev) > Settings > API Tokens.

For self-hosted instances, point `api_url` to your own server (e.g. `https://feedback.yourapp.com/api/v1`).

### 2. Add to your editor

<details>
<summary><strong>Claude Code</strong></summary>

Add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "makethisbetter": {
      "command": "makethisbetter-mcp"
    }
  }
}
```

</details>

<details>
<summary><strong>Cursor</strong></summary>

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "makethisbetter": {
      "command": "makethisbetter-mcp"
    }
  }
}
```

</details>

<details>
<summary><strong>Windsurf</strong></summary>

Add to `.windsurf/mcp.json`:

```json
{
  "mcpServers": {
    "makethisbetter": {
      "command": "makethisbetter-mcp"
    }
  }
}
```

</details>

<details>
<summary><strong>VS Code (GitHub Copilot)</strong></summary>

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "makethisbetter": {
      "command": "makethisbetter-mcp"
    }
  }
}
```

</details>

<details>
<summary><strong>Local development</strong></summary>

```json
{
  "mcpServers": {
    "makethisbetter": {
      "command": "node",
      "args": ["/path/to/makethisbetter-mcp/dist/index.js"]
    }
  }
}
```

</details>

## What your agent can do

Five tools for the feedback workflow: browse feedback, pick something to fix, ship it.

| Tool | What it does |
|------|-------------|
| `list` | Browse feedback — lean summaries (id, status, type, priority, first line, updated) filterable by status or type |
| `detail` | Read-only deep dive. Returns server-rendered markdown for reading plus `structuredContent` with every raw field (selector, console errors, AI triage analysis) |
| `pick` | Claim a feedback item. Sets it to `in_progress` and returns the same markdown + `structuredContent` context in one call |
| `resolve` | Mark it shipped. Optionally records the PR URL. Notifies the reporter that the fix is live |
| `dismiss` | Close something you won't fix — `not_planned` (default) or `duplicate` |

Three more tools manage the projects (feedback boards) themselves:

| Tool | What it does |
|------|-------------|
| `project_list` | Browse the projects in your account — id, name, domain, feedback visibility, feedback count |
| `project_show` | Read full detail for one project, including its widget API key, board URL, and (for account admins) identity-verification signing secret |
| `project_create` | Create a new project. Requires account admin permissions. Returns the widget API key and signing secret |

## How it looks in practice

Here's what actually happens when your agent has this MCP server connected:

```
You:     "Any new feedback?"

Agent:   Let me check.
         → list(status: "received")
         3 items. FB-42 is a bug — "Login button doesn't work on Safari,
         rage-clicked 5 times." Looks real.

You:     "Fix it."

Agent:   Picking it up.
         → pick(feedback_id: "fdb_abc123")
         Got the full context: Safari 18.5, screenshot shows the button
         is overlapped by the cookie banner. Console error:
         "Cannot read property 'submit' of null."

         The cookie banner has z-index: 9999 and covers the login
         button on viewports under 768px. I'll fix the z-index
         stacking and add a responsive margin.

         *makes the code changes*

         Fixed. Let me close this out.
         → resolve(feedback_id: "fdb_abc123", pr_url: "https://github.com/you/app/pull/87")

         Done. The reporter will be notified that this shipped.
```

No dashboard tab-switching. No copy-pasting bug descriptions. Feedback goes in, fix comes out.

## Development

```bash
git clone https://github.com/makethisbetter/mcp.git
cd mcp
npm install
npm run build
npm test

# Run locally
MAKETHISBETTER_CONFIG=./config.json node dist/index.js
```

## Related

| Package | What |
|---------|------|
| [Make This Better](https://makethisbetter.dev) | The platform — dashboard, AI triage, feedback board |
| [Widget SDK](https://github.com/makethisbetter/makethisbetter-js) | Collect feedback from your website |
| [CLI](https://github.com/makethisbetter/cli) | Manage feedback from the terminal |
| [Skills](https://github.com/makethisbetter/skills) | Claude Code slash commands |

## License

[MIT](LICENSE)
