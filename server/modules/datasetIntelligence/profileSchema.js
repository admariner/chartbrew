const PROFILE_VERSION = 1;
const FIELD_ROLES = new Set(["measure", "dimension", "time", "identifier", "unknown"]);
const AGGREGATIONS = new Set(["sum", "avg", "min", "max", "count", "none"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateField(field, fieldPath) {
  if (!isPlainObject(field)) {
    throw new Error(`Invalid intelligence field: ${fieldPath}`);
  }
  if (!FIELD_ROLES.has(field.role)) {
    throw new Error(`Invalid intelligence role: ${fieldPath}`);
  }
  if (field.defaultAggregation && !AGGREGATIONS.has(field.defaultAggregation)) {
    throw new Error(`Invalid intelligence aggregation: ${fieldPath}`);
  }
}

function validateProfile(profile) {
  if (!isPlainObject(profile) || profile.version !== PROFILE_VERSION) {
    throw new Error("Invalid dataset intelligence profile version");
  }
  if (!isPlainObject(profile.dataset) || !isPlainObject(profile.fields)) {
    throw new Error("Invalid dataset intelligence profile");
  }

  Object.entries(profile.fields).forEach(([fieldPath, field]) => {
    validateField(field, fieldPath);
  });

  return profile;
}

function capArray(value, limit) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit);
}

function serializeProfile(profile, { maxFields = 200, maxUsageReferences = 50 } = {}) {
  validateProfile(profile);
  const fieldEntries = Object.entries(profile.fields);
  const fields = Object.fromEntries(fieldEntries.slice(0, maxFields));

  return {
    ...profile,
    fields,
    usage: {
      ...profile.usage,
      chartIds: capArray(profile.usage?.chartIds, maxUsageReferences),
      dashboardIds: capArray(profile.usage?.dashboardIds, maxUsageReferences),
      metrics: capArray(profile.usage?.metrics, maxUsageReferences),
      dimensions: capArray(profile.usage?.dimensions, maxUsageReferences),
      filters: capArray(profile.usage?.filters, maxUsageReferences),
      analyses: capArray(profile.usage?.analyses, maxUsageReferences),
    },
    truncation: {
      fields: fieldEntries.length > maxFields,
      fieldCount: fieldEntries.length,
    },
  };
}

module.exports = {
  AGGREGATIONS,
  FIELD_ROLES,
  PROFILE_VERSION,
  serializeProfile,
  validateProfile,
};

