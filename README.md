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

Your users report bugs and requests through the [widget](https://github.com/makethisbetter/makethisbetter-js). AI triage categorizes and prioritizes them. This MCP server lets your coding agent inspect and operate on feedback without copy-pasting anything. Production release stays in the CLI because it needs the deployed Git revision.

```
User reports a bug  →  AI triage  →  Agent picks it up  →  Commit + ready  →  Deploy + release
     (widget)          (server)      (this MCP server)       (agent + MCP)          (CLI)
```

## Install

No global install needed. Put this in your MCP client's user-level configuration to use the server across projects:

```json
{
  "mcpServers": {
    "makethisbetter": {
      "command": "npx",
      "args": ["-y", "@makethisbetter/mcp@latest"]
    }
  }
}
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

If you belong to more than one account, add `"account_id": "YOUR_ACCOUNT_ID"` — without it the
server picks your first account, and projects in the other one come back as "not found".
`makethisbetter login --account-id YOUR_ACCOUNT_ID` writes this field into the same file.

For self-hosted instances, point `api_url` to your own server (e.g. `https://feedback.yourapp.com/api/v1`).

### 2. Add to your editor

<details>
<summary><strong>Claude Code</strong></summary>

Run once to add the server at user scope:

```bash
claude mcp add --scope user makethisbetter -- npx -y @makethisbetter/mcp@latest
```

</details>

<details>
<summary><strong>Cursor</strong></summary>

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "makethisbetter": {
      "command": "npx",
      "args": ["-y", "@makethisbetter/mcp@latest"]
    }
  }
}
```

</details>

<details>
<summary><strong>Windsurf</strong></summary>

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "makethisbetter": {
      "command": "npx",
      "args": ["-y", "@makethisbetter/mcp@latest"]
    }
  }
}
```

</details>

<details>
<summary><strong>VS Code (GitHub Copilot)</strong></summary>

Run **MCP: Open User Configuration** from the Command Palette, then add:

```json
{
  "servers": {
    "makethisbetter": {
      "command": "npx",
      "args": ["-y", "@makethisbetter/mcp@latest"]
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

Ten tools cover the Feedback lifecycle up to production release.

| Tool | What it does |
|------|-------------|
| `list` | Browse one Project's active or archived Feedback, filterable by status, priority, or an AI-selected label. `archived: true` cannot be combined with `status` |
| `detail` | Read-only deep dive for active or archived Feedback. Returns server-rendered markdown for reading plus `structuredContent` with every raw field — selector, console errors, AI triage analysis, the reporter's `annotations` and `breadcrumbs`, the `ai_clarification_messages` exchange, the viewport (`screen_width` / `screen_height` / `reporter_language`), and `ai_triage_status` / `ai_triage_error` so a failed triage is not mistaken for one that never ran |
| `pick` | Claim a feedback item. Sets it to `in_progress` and returns the same markdown + `structuredContent` context in one call |
| `respond` | Send final user-confirmed text as a One-way Reporter Notice, queue delivery, and close received Feedback as `responded`; the Agent must never generate and send the body autonomously |
| `archive` | Hide one Unclaimed Feedback from active views without changing its workflow status |
| `restore` | Return one archived Feedback to active views |
| `ready` | Save the factual implementation summary and move committed work to `pending_release`; the calling Agent must first verify the exact Feedback trailer in reachable Git history |
| `decline` | Close as `not_planned` without notifying the Reporter |
| `duplicate` | Close as `duplicate` with a same-Project `canonical_feedback_id` |
| `reopen` | Return closed Feedback to `received`; available to Account Owners/Admins, Active Pro Members, and assigned Team Members |

The `ready` tool does not inspect Git. The Agent must verify the exact
`Feedback: <handle/FB-n>` trailer before calling it. `release` remains CLI-only
because it scans the deployed revision and rejects shallow history.

`respond`, `archive`, and `restore` are retry-safe. A successful `respond`
means its delivery record is persisted and queued, not that delivery has
completed. Account Owners/Admins and Active Pro Members may perform these
operations across the Account; Team Members may do so only for authorised
Projects.

Four more tools manage the projects (feedback boards) themselves:

| Tool | What it does |
|------|-------------|
| `project_list` | Browse the projects in your account — id, name, domain, feedback visibility, feedback count |
| `project_show` | Read full detail for one project, including its widget API key and board URL. Account Owners/Admins and Active Pro Members also receive the identity-verification signing secret |
| `project_create` | Create a new project. `name`, `handle` and `domain` are all required — the widget only runs on the project's own domain. Available to Account Owners/Admins and Active Pro Members. Returns the widget API key and signing secret |
| `project_update` | Update an existing project's `name`, `domain`, or `ai_context`. Available to Account Owners/Admins and Active Pro Members; the handle is immutable |

## How it looks in practice

Here's what actually happens when your agent has this MCP server connected:

```
You:     "Any new feedback?"

Agent:   Let me check.
         → list(project_handle: "acme", status: "received")
         3 items. acme/FB-42 is a bug — "Login button doesn't work on Safari,
         rage-clicked 5 times." Looks real.

You:     "Fix it."

Agent:   Picking it up.
         → pick(feedback_id: "acme/FB-42")
         Got the full context: Safari 18.5, and the DOM snapshot puts the
         cookie banner on top of the login button. Console error:
         "Cannot read property 'submit' of null."

         The cookie banner has z-index: 9999 and covers the login
         button on viewports under 768px. I'll fix the z-index
         stacking and add a responsive margin.

         *makes the code changes*

         Fixed and tested. I will commit with `Feedback: acme/FB-42`, verify
         that trailer, then call ready with the factual implementation summary.

         → ready(feedback_id: "acme/FB-42",
                 resolution_summary: "Fixed the mobile cookie banner stacking order.")

         The production deployment agent releases it only after deployment.
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
