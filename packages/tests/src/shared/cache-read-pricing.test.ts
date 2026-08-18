import { describe, expect, test } from "vitest";
import { CACHE_READ_RATIO_ENV, CostTracker, cacheReadRatio } from "../../../cli/src/lib/cost.js";
import type { ModelDefinition } from "../../../models/src/index.js";
import { getDefaultModel } from "../../../models/src/index.js";

const unpublishedCacheModel: ModelDefinition = {
  id: "test/unpublished-cache",
  name: "Unpublished cache",
  anthropicAlias: "unpublished-cache",
  cost: { input: 25, output: 40, cache_read: 0 },
  limit: { context: 128_000, output: 8_192 },
  attachment: false,
  reasoning: false,
  temperature: true,
  tool_call: true,
  modalities: { input: ["text"], output: ["text"] },
};

describe("cached-token price ratio", () => {
  // When the catalog publishes no cached-input price, billing cache hits at
  // zero under-reports spend, and on a long session most input tokens are
  // cache hits, so the error compounds.
  test("defaults to the full input rate, not free", () => {
    expect(cacheReadRatio({})).toBe(1);
  });

  test("an explicit discount is honored", () => {
    expect(cacheReadRatio({ [CACHE_READ_RATIO_ENV]: "0.1" })).toBeCloseTo(0.1);
    expect(cacheReadRatio({ [CACHE_READ_RATIO_ENV]: "0" })).toBe(0);
  });

  // A ratio >1 would mean caching costs more than not caching, and a negative
  // one would credit the user. Both are misconfiguration.
  test("out-of-range and unparseable values fall back rather than mislead", () => {
    for (const value of ["1.5", "-0.2", "cheap", ""]) {
      expect(cacheReadRatio({ [CACHE_READ_RATIO_ENV]: value })).toBe(1);
    }
  });
});

describe("cached tokens are billed", () => {
  test("a fully-cached prompt still costs money when cache_read is unpublished", () => {
    const tracker = new CostTracker(unpublishedCacheModel);
    tracker.addUsage(10_000, 10_000, 0, unpublishedCacheModel);
    const totals = tracker.totals;

    expect(totals.cachedTokens).toBe(10_000);
    // The whole prompt was a cache hit; at the default ratio it is priced the
    // same as an uncached prompt of the same size.
    const expected = (10_000 * unpublishedCacheModel.cost.input) / 1_000_000;
    expect(totals.costUsd).toBeCloseTo(expected, 10);
    expect(totals.costUsd).toBeGreaterThan(0);
  });

  test("a catalog that publishes cache_read wins over the ratio", () => {
    const model = getDefaultModel();
    expect(model.cost.cache_read).toBeGreaterThan(0);
    const tracker = new CostTracker(model);
    tracker.addUsage(10_000, 10_000, 0, model);
    const expected = (10_000 * model.cost.cache_read) / 1_000_000;
    expect(tracker.totals.costUsd).toBeCloseTo(expected, 10);
  });
});
