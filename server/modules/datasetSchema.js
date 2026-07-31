const determineType = require("./determineType");

const MAX_SAMPLE_ROWS = 20;
const MAX_DEPTH = 12;
const MAX_FIELDS = 500;

function addField(schema, field, value) {
  if (!field || (schema[field] && schema[field] !== "unknown")) return;
  if (!Object.hasOwn(schema, field) && Object.keys(schema).length >= MAX_FIELDS) return;
  schema[field] = determineType(value) || "unknown";
}

function collectObjectFields(value, prefix, schema, depth = 0, ancestors = new Set()) {
  if (!value || typeof value !== "object" || depth > MAX_DEPTH) return;
  if (ancestors.has(value)) return;

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(value);

  Object.entries(value).forEach(([key, fieldValue]) => {
    if (Object.keys(schema).length >= MAX_FIELDS) return;
    const field = `${prefix}.${key}`;
    addField(schema, field, fieldValue);

    if (Array.isArray(fieldValue)) {
      fieldValue.slice(0, MAX_SAMPLE_ROWS).forEach((item) => {
        collectObjectFields(item, `${field}[]`, schema, depth + 1, nextAncestors);
      });
    } else if (fieldValue && typeof fieldValue === "object") {
      collectObjectFields(fieldValue, field, schema, depth + 1, nextAncestors);
    }
  });
}

function discoverDatasetFieldsSchema(data) {
  const schema = {};

  if (Array.isArray(data)) {
    data.slice(0, MAX_SAMPLE_ROWS).forEach((item) => {
      collectObjectFields(item, "root[]", schema);
    });
    return schema;
  }

  if (!data || typeof data !== "object") return schema;

  collectObjectFields(data, "root", schema);
  return schema;
}

module.exports = {
  discoverDatasetFieldsSchema,
};
