import { describe, expect, it } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { applyLegacyTabularOptions } = require("../../visualization/tabular.js");

describe("legacy tabular options", () => {
  const rows = [{
    country: { code: "us" },
    metrics: { pageviews: 949 },
  }];

  it("applies current array-based groups", () => {
    const result = applyLegacyTabularOptions(rows, {
      groups: [{
        key: "country.code",
        value: "metrics.pageviews",
      }],
    });

    expect(result).toEqual([{
      ...rows[0],
      us: 949,
    }]);
  });

  it.each([
    { "country.code": "metrics.pageviews" },
    { key: "country.code", value: "metrics.pageviews" },
    JSON.stringify({ "country.code": "metrics.pageviews" }),
  ])("applies persisted object-based groups", (groups) => {
    const result = applyLegacyTabularOptions(rows, { groups });

    expect(result[0].us).toBe(949);
  });

  it.each([
    {},
    true,
    "invalid JSON",
  ])("ignores invalid group values without breaking table rendering", (groups) => {
    expect(() => applyLegacyTabularOptions(rows, { groups })).not.toThrow();
    expect(applyLegacyTabularOptions(rows, { groups })).toEqual(rows);
  });

  it("ignores a non-string groupBy value", () => {
    expect(applyLegacyTabularOptions(rows, {
      groupBy: {},
    })).toEqual(rows);
  });
});
