const _ = require("lodash");

const IDENTIFIER_PATTERN = /(^|[._])(id|uuid|guid|key)(_|$)|(_id|Id)$/i;
const TIME_PATTERN = /(^|[._])(date|time|timestamp|created|updated|completed|started|ended|occurred)(_at)?($|[._])/i;
const CURRENCY_PATTERN = /(amount|revenue|price|cost|fee|balance|income|spend|mrr|arr|currency)/i;
const PERCENT_PATTERN = /(percent|percentage|rate|ratio|share|conversion)/i;
const DURATION_PATTERN = /(duration|latency|elapsed|seconds|minutes|hours|days)/i;
const COUNT_PATTERN = /(^|[._])(count|quantity|qty|total)(_count)?($|[._])/i;
const EMAIL_PATTERN = /email/i;
const URL_PATTERN = /(url|uri|link|website)/i;
const GEO_PATTERN = /(country|region|state|province|city|latitude|longitude|lat|lng)/i;

function stripRoot(fieldPath) {
  return `${fieldPath || ""}`
    .replace(/^root\[\]\.?/, "")
    .replace(/^root\.?/, "")
    .replace(/\[\]/g, "");
}

function findSampleRows(data, limit) {
  if (Array.isArray(data)) return data.slice(0, limit);
  if (!data || typeof data !== "object") return [];

  const queue = [data];
  while (queue.length > 0) {
    const current = queue.shift();
    const keys = Object.keys(current || {}).sort();
    for (const key of keys) {
      const value = current[key];
      if (Array.isArray(value)) return value.slice(0, limit);
      if (value && typeof value === "object") queue.push(value);
    }
  }

  return [data].slice(0, limit);
}

function inferType(value) {
  if (value === null || value === undefined) return "unknown";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (value instanceof Date) return "date";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "string" && value.trim() && !Number.isNaN(Date.parse(value))) return "date";
  return typeof value;
}

function flattenFields(row, prefix = "root[]", depth = 0, result = {}) {
  if (!row || typeof row !== "object" || Array.isArray(row) || depth > 4) return result;

  Object.entries(row).forEach(([key, value]) => {
    const fieldPath = `${prefix}.${key}`;
    result[fieldPath] = result[fieldPath] || inferType(value);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flattenFields(value, fieldPath, depth + 1, result);
    }
  });

  return result;
}

function normalizeSchema(fieldsSchema, rows) {
  const schema = { ...(fieldsSchema || {}) };
  rows.forEach((row) => flattenFields(row, "root[]", 0, schema));
  return schema;
}

function getFieldValues(rows, fieldPath) {
  const path = stripRoot(fieldPath);
  if (!path || path.includes("[]")) return [];
  return rows.map((row) => _.get(row, path));
}

function getSemanticType(fieldPath, type) {
  if (CURRENCY_PATTERN.test(fieldPath)) return "currency";
  if (PERCENT_PATTERN.test(fieldPath)) return "percentage";
  if (DURATION_PATTERN.test(fieldPath)) return "duration";
  if (COUNT_PATTERN.test(fieldPath)) return "count";
  if (EMAIL_PATTERN.test(fieldPath)) return "email";
  if (URL_PATTERN.test(fieldPath)) return "url";
  if (GEO_PATTERN.test(fieldPath)) return "geography";
  if (type === "date") return "datetime";
  return null;
}

function getRole(fieldPath, type, usageRole) {
  if (usageRole) return usageRole;
  if (IDENTIFIER_PATTERN.test(fieldPath)) return "identifier";
  if (type === "date" || TIME_PATTERN.test(fieldPath)) return "time";
  if (type === "number") return "measure";
  if (["string", "boolean"].includes(type)) return "dimension";
  return "unknown";
}

function getDefaultAggregation(role, semanticType, usageAggregation) {
  if (usageAggregation) return usageAggregation;
  if (role !== "measure") return "none";
  if (semanticType === "percentage") return "avg";
  return "sum";
}

function getStatistics(values, type) {
  const present = values.filter((value) => value !== null && value !== undefined && value !== "");
  const serialized = present.map((value) => {
    if (value && typeof value === "object") return JSON.stringify(value);
    return `${value}`;
  });
  const statistics = {
    nullRate: values.length === 0 ? null : (values.length - present.length) / values.length,
    cardinality: new Set(serialized).size,
  };

  if (type === "number") {
    const numeric = present.map(Number).filter(Number.isFinite);
    if (numeric.length > 0) {
      statistics.min = Math.min(...numeric);
      statistics.max = Math.max(...numeric);
    }
  }

  if (type === "date") {
    const dates = present
      .map((value) => new Date(value))
      .filter((value) => !Number.isNaN(value.getTime()))
      .sort((a, b) => a - b);
    if (dates.length > 0) {
      statistics.minDate = dates[0].toISOString();
      statistics.maxDate = dates[dates.length - 1].toISOString();
    }
  }

  return statistics;
}

function getConfidence({ hasUsage, evidenceCount }) {
  if (hasUsage) return 0.98;
  if (evidenceCount >= 2) return 0.9;
  return 0.72;
}

function inferFieldSemantics({
  fieldsSchema = {},
  sampleData,
  usageByField = {},
  maxSampleRows = 200,
  maxFields = 200,
}) {
  const rows = findSampleRows(sampleData, maxSampleRows);
  const schema = normalizeSchema(fieldsSchema, rows);
  const fieldEntries = Object.entries(schema)
    .filter(([fieldPath]) => fieldPath)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, maxFields);

  const fields = {};
  const quality = {
    rowCountSampled: rows.length,
    nullRates: {},
    cardinality: {},
    numericRanges: {},
    dateCoverage: {},
    warnings: [],
  };

  fieldEntries.forEach(([fieldPath, rawType]) => {
    const values = getFieldValues(rows, fieldPath);
    const firstPresent = values.find((value) => value !== null && value !== undefined);
    const type = rawType || inferType(firstPresent);
    const usage = usageByField[fieldPath] || {};
    const role = getRole(fieldPath, type, usage.role);
    const semanticType = getSemanticType(fieldPath, type);
    const statistics = getStatistics(values, type);
    const evidence = [];

    if (usage.role) evidence.push(`visualization_${usage.role}`);
    if (type && type !== "unknown") evidence.push(`${type}_type`);
    if (IDENTIFIER_PATTERN.test(fieldPath)) evidence.push("identifier_name");
    if (TIME_PATTERN.test(fieldPath)) evidence.push("time_name");
    if (semanticType) evidence.push("semantic_name");

    fields[fieldPath] = {
      type,
      role,
      semanticType,
      defaultAggregation: getDefaultAggregation(role, semanticType, usage.aggregation),
      confidence: getConfidence({
        hasUsage: Boolean(usage.role),
        evidenceCount: evidence.length,
      }),
      evidence,
    };

    quality.nullRates[fieldPath] = statistics.nullRate;
    quality.cardinality[fieldPath] = statistics.cardinality;
    if (statistics.min !== undefined) {
      quality.numericRanges[fieldPath] = {
        min: statistics.min,
        max: statistics.max,
      };
    }
    if (statistics.minDate) {
      quality.dateCoverage[fieldPath] = {
        min: statistics.minDate,
        max: statistics.maxDate,
      };
    }
  });

  if (Object.keys(schema).length > maxFields) {
    quality.warnings.push({
      code: "field_limit_reached",
      fieldCount: Object.keys(schema).length,
      profiledFieldCount: maxFields,
    });
  }

  return { fields, quality };
}

module.exports = {
  findSampleRows,
  flattenFields,
  getDefaultAggregation,
  getConfidence,
  getRole,
  getSemanticType,
  inferFieldSemantics,
  inferType,
  normalizeSchema,
  stripRoot,
};
