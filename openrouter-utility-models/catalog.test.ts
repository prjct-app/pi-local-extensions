import assert from "node:assert/strict";
import test from "node:test";
import { isIncompatibleRouteError, normalizeCache, selectCompatibleIds } from "./catalog.ts";

test("selectCompatibleIds keeps only curated low-cost models with tool support", () => {
  const result = selectCompatibleIds({
    data: [
      {
        id: "minimax/minimax-m2.7",
        pricing: { prompt: "0.00000021", completion: "0.00000084" },
        supported_parameters: ["tools", "tool_choice"],
      },
      {
        id: "deepseek/deepseek-v4-flash",
        pricing: { prompt: "0.00000005", completion: "0.00000014" },
        supported_parameters: ["tools"],
      },
      {
        id: "z-ai/glm-5.3-flash",
        pricing: { prompt: "0.000000075", completion: "0.00000025" },
        supported_parameters: ["tools"],
      },
      {
        id: "unknown/model",
        pricing: { prompt: "0", completion: "0" },
        supported_parameters: ["tools"],
      },
    ],
  });

  assert.deepEqual(result, [
    "deepseek/deepseek-v4-flash",
    "z-ai/glm-5.3-flash",
    "minimax/minimax-m2.7",
  ]);
});

test("selectCompatibleIds rejects missing tools, excessive prices, and malformed prices", () => {
  const result = selectCompatibleIds({
    data: [
      {
        id: "deepseek/deepseek-v4-flash",
        pricing: { prompt: "0.00000005", completion: "0.00000014" },
        supported_parameters: ["temperature"],
      },
      {
        id: "z-ai/glm-5.3-flash",
        pricing: { prompt: "0.0000002", completion: "0.00000025" },
        supported_parameters: ["tools"],
      },
      {
        id: "minimax/minimax-m2.7",
        pricing: { prompt: null, completion: false },
        supported_parameters: ["tools"],
      },
    ],
  });

  assert.deepEqual(result, []);
});

test("selectCompatibleIds accepts exact price ceilings", () => {
  const result = selectCompatibleIds({
    data: [
      {
        id: "deepseek/deepseek-v4-flash",
        pricing: { prompt: "0.0000001", completion: "0.0000003" },
        supported_parameters: ["tools"],
      },
    ],
  });

  assert.deepEqual(result, ["deepseek/deepseek-v4-flash"]);
});

test("selectCompatibleIds rejects malformed catalogs", () => {
  assert.throws(() => selectCompatibleIds({}), /data array/);
  assert.throws(() => selectCompatibleIds(null), /invalid model catalog/);
});

test("route errors distinguish incompatibility from transient rate limits", () => {
  assert.equal(isIncompatibleRouteError("No endpoints found that support tool use"), true);
  assert.equal(isIncompatibleRouteError("0 endpoints out of 1 requested are available"), true);
  assert.equal(isIncompatibleRouteError("Free model training violation (guardrail)"), true);
  assert.equal(isIncompatibleRouteError("429: temporarily rate-limited upstream"), false);
});

test("normalizeCache removes unknown and duplicate model IDs", () => {
  const cache = normalizeCache({
    version: 3,
    fetchedAt: 123,
    scope: "user",
    compatibleIds: [
      "deepseek/deepseek-v4-flash",
      "deepseek/deepseek-v4-flash",
      "unknown/model",
      42,
    ],
  });

  assert.deepEqual(cache, {
    version: 3,
    fetchedAt: 123,
    scope: "user",
    compatibleIds: ["deepseek/deepseek-v4-flash"],
  });
  assert.equal(normalizeCache({ version: 2, fetchedAt: 123, scope: "user", compatibleIds: [] }), undefined);
  assert.equal(normalizeCache({ version: 3, fetchedAt: 123, compatibleIds: [] }), undefined);
});
