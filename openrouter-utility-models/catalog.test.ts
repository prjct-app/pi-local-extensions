import assert from "node:assert/strict";
import test from "node:test";
import { CURATED_KEY, isIncompatibleRouteError, normalizeCache, selectCompatibleIds } from "./catalog.ts";

test("selectCompatibleIds keeps only curated low-cost models with tool support", () => {
  const result = selectCompatibleIds({
    data: [
      {
        id: "meta/muse-spark-1.3",
        pricing: { prompt: "0.00000125", completion: "0.00000425" },
        supported_parameters: ["tools", "tool_choice", "reasoning"],
      },
      {
        id: "meta/muse-spark-1.3-contributor",
        pricing: { prompt: "0.0000001", completion: "0.0000002" },
        supported_parameters: ["tools"],
      },
      {
        id: "unknown/model",
        pricing: { prompt: "0", completion: "0" },
        supported_parameters: ["tools"],
      },
    ],
  });

  assert.deepEqual(result, ["meta/muse-spark-1.3"]);
});

test("selectCompatibleIds rejects missing tools, excessive prices, and malformed prices", () => {
  for (const model of [
    { id: "meta/muse-spark-1.3", pricing: { prompt: "0.00000125", completion: "0.00000425" }, supported_parameters: ["temperature"] },
    { id: "meta/muse-spark-1.3", pricing: { prompt: "0.000002", completion: "0.00000425" }, supported_parameters: ["tools"] },
    { id: "meta/muse-spark-1.3", pricing: { prompt: null, completion: false }, supported_parameters: ["tools"] },
  ]) {
    assert.deepEqual(selectCompatibleIds({ data: [model] }), []);
  }
});

test("selectCompatibleIds accepts exact price ceilings", () => {
  const result = selectCompatibleIds({
    data: [
      {
        id: "meta/muse-spark-1.3",
        pricing: { prompt: "0.0000015", completion: "0.000005" },
        supported_parameters: ["tools"],
      },
    ],
  });

  assert.deepEqual(result, ["meta/muse-spark-1.3"]);
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
    version: 4,
    curated: CURATED_KEY,
    fetchedAt: 123,
    scope: "user",
    compatibleIds: ["meta/muse-spark-1.3", "meta/muse-spark-1.3", "unknown/model", 42],
  });

  assert.deepEqual(cache, {
    version: 4,
    curated: CURATED_KEY,
    fetchedAt: 123,
    scope: "user",
    compatibleIds: ["meta/muse-spark-1.3"],
  });
  assert.equal(normalizeCache({ version: 4, curated: CURATED_KEY, fetchedAt: 123, compatibleIds: [] }), undefined);
});

test("a cache written for another shortlist is checked again, not trusted", () => {
  assert.equal(normalizeCache({ version: 4, curated: "meta/muse-spark-1.2", fetchedAt: 123, scope: "user", compatibleIds: [] }), undefined);
  assert.equal(normalizeCache({ version: 4, fetchedAt: 123, scope: "user", compatibleIds: ["meta/muse-spark-1.3"] }), undefined);
  assert.equal(normalizeCache({ version: 3, curated: CURATED_KEY, fetchedAt: 123, scope: "user", compatibleIds: [] }), undefined);
});
