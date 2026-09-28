import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import test from "node:test";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const extensionDirectory = dirname(fileURLToPath(import.meta.url));

const expectedModelIds = [
  "deepseek/deepseek-v4-pro-0813",
  "meta/muse-spark-1.3",
  "minimax/minimax-m3",
  "moonshotai/kimi-k3",
  "qwen/qwen3.8-max-0902",
  "xiaomi/mimo-v2.6-pro",
  "z-ai/glm-5.3",
];

function listModels(agentDirectory: string): string[] {
  const output = execFileSync(
    "pi",
    ["--no-extensions", "-e", join(extensionDirectory, "index.ts"), "--list-models", "openrouter"],
    {
      cwd: extensionDirectory,
      encoding: "utf8",
      env: {
        ...process.env,
        OPENROUTER_API_KEY: "test-key",
        PI_CODING_AGENT_DIR: agentDirectory,
        PI_OFFLINE: "1",
      },
      timeout: 120_000,
    },
  );

  return output
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/)[1])
    .filter((id): id is string => Boolean(id));
}

function writeCache(agentDirectory: string, fetchedAt: number): void {
  mkdirSync(join(agentDirectory, "cache"));
  writeFileSync(
    join(agentDirectory, "cache", "openrouter-utility-models.json"),
    `${JSON.stringify({
      version: 4,
      curated: [...expectedModelIds].sort().join(" "),
      fetchedAt,
      scope: "user",
      compatibleIds: expectedModelIds,
    })}\n`,
    { mode: 0o600 },
  );
}

test("the Pi provider override exposes only the curated shortlist", { timeout: 120_000 }, () => {
  const agentDirectory = mkdtempSync(join(tmpdir(), "pi-openrouter-utility-models-"));
  try {
    writeCache(agentDirectory, Date.now());
    assert.deepEqual(listModels(agentDirectory), expectedModelIds);
  } finally {
    rmSync(agentDirectory, { recursive: true, force: true });
  }
});

test("offline startup without a fresh cache fails closed", { timeout: 120_000 }, () => {
  const agentDirectory = mkdtempSync(join(tmpdir(), "pi-openrouter-utility-models-"));
  try {
    assert.deepEqual(listModels(agentDirectory), []);
  } finally {
    rmSync(agentDirectory, { recursive: true, force: true });
  }
});

test("offline startup rejects a stale cache", { timeout: 120_000 }, () => {
  const agentDirectory = mkdtempSync(join(tmpdir(), "pi-openrouter-utility-models-"));
  try {
    writeCache(agentDirectory, Date.now() - 7 * 60 * 60 * 1000);
    assert.deepEqual(listModels(agentDirectory), []);
  } finally {
    rmSync(agentDirectory, { recursive: true, force: true });
  }
});
