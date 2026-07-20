import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { configPath, loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("loads api token and normalizes api url", async () => {
    const dir = join(process.cwd(), ".tmp-tests", crypto.randomUUID());
    const path = join(dir, "config.json");
    await mkdir(dir, { recursive: true });
    await writeFile(path, JSON.stringify({
      api_token: " token_123 ",
      api_url: "https://example.test/api/v1/",
    }));

    await expect(loadConfig(path)).resolves.toEqual({
      api_token: "token_123",
      api_url: "https://example.test/api/v1",
    });
  });

  it("uses the default api url when omitted", async () => {
    const dir = join(process.cwd(), ".tmp-tests", crypto.randomUUID());
    const path = join(dir, "config.json");
    await mkdir(dir, { recursive: true });
    await writeFile(path, JSON.stringify({ api_token: "token_123" }));

    await expect(loadConfig(path)).resolves.toEqual({
      api_token: "token_123",
      api_url: "https://makethisbetter.dev/api/v1",
    });
  });

  it("raises a useful error when config is missing", async () => {
    await expect(loadConfig(join(process.cwd(), ".tmp-tests", crypto.randomUUID(), "missing.json")))
      .rejects
      .toThrow("Missing Make This Better config");
  });

  it("allows the config path to be overridden for tests and CI", () => {
    const previous = process.env.MAKETHISBETTER_CONFIG;
    process.env.MAKETHISBETTER_CONFIG = "/tmp/makethisbetter-config.json";

    try {
      expect(configPath()).toBe("/tmp/makethisbetter-config.json");
    } finally {
      if (previous === undefined) {
        delete process.env.MAKETHISBETTER_CONFIG;
      } else {
        process.env.MAKETHISBETTER_CONFIG = previous;
      }
    }
  });
});
