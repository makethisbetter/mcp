#!/usr/bin/env node

import { runServer } from "./server.js";

// A first run with no ~/.makethisbetter/config.json is the expected failure here, and an
// unhandled rejection buries the setup instructions in a stack trace that the MCP client
// reports as nothing more than "server failed to start". Print the message and exit non-zero.
try {
  await runServer();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
