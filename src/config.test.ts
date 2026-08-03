import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { configPath, loadConfig } from "./config.js";

describe("loadConfig", () => {
  // Fixtures go to the OS temp dir, not the package dir, and are removed after each test —
  // otherwise every run leaves another directory behind in the working tree.
  const fixtureDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(fixtureDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function writeConfigFixture(config: unknown): Promise<string> {
    const dir = await fixtureDir();
    const path = join(dir, "config.json");
    await writeFile(path, JSON.stringify(config));
    return path;
  }

  async function fixtureDir(): Promise<string> {
    const dir = join(tmpdir(), "makethisbetter-mcp-tests", crypto.randomUUID());
    fixtureDirs.push(dir);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  it("loads api token and normalizes api url", async () => {
    const path = await writeConfigFixture({
      api_token: " token_123 ",
      api_url: "https://example.test/api/v1/",
    });

    await expect(loadConfig(path)).resolves.toEqual({
      api_token: "token_123",
      api_url: "https://example.test/api/v1",
    });
  });

  it("uses the default api url when omitted", async () => {
    const path = await writeConfigFixture({ api_token: "token_123" });

    await expect(loadConfig(path)).resolves.toEqual({
      api_token: "token_123",
      api_url: "https://makethisbetter.dev/api/v1",
    });
  });

  it("keeps the account_id the CLI writes into the same file", async () => {
    const path = await writeConfigFixture({ api_token: "token_123", account_id: " acc_123 " });

    await expect(loadConfig(path)).resolves.toEqual({
      api_token: "token_123",
      api_url: "https://makethisbetter.dev/api/v1",
      account_id: "acc_123",
    });
  });

  it("omits a blank account_id instead of sending an empty one", async () => {
    const path = await writeConfigFixture({ api_token: "token_123", account_id: "   " });

    await expect(loadConfig(path)).resolves.toEqual({
      api_token: "token_123",
      api_url: "https://makethisbetter.dev/api/v1",
    });
  });

  it("rejects a non-string account_id", async () => {
    const path = await writeConfigFixture({ api_token: "token_123", account_id: 42 });

    await expect(loadConfig(path)).rejects.toThrow("Invalid Make This Better config");
  });

  it("raises a useful error when config is missing", async () => {
    const dir = await fixtureDir();

    await expect(loadConfig(join(dir, "missing.json")))
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
