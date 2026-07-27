const { AGGREGATIONS, FIELD_ROLES } = require("./profileSchema");

function cleanDatasetOverrides(overrides = {}) {
  const source = overrides || {};
  const cleaned = {};
  if (typeof source.summary === "string" && source.summary.trim()) {
    cleaned.summary = source.summary.trim().slice(0, 500);
  }
  if (typeof source.grain === "string" && source.grain.trim()) {
    cleaned.grain = source.grain.trim().slice(0, 500);
  }
  return cleaned;
}

function cleanFieldOverride(value = {}) {
  const source = value || {};
  const cleaned = {};
  if (FIELD_ROLES.has(source.role)) cleaned.role = source.role;
  if (AGGREGATIONS.has(source.defaultAggregation)) {
    cleaned.defaultAggregation = source.defaultAggregation;
  }
  if (typeof source.semanticType === "string" && source.semanticType.trim()) {
    cleaned.semanticType = source.semanticType.trim().slice(0, 100);
  }
  return cleaned;
}

function sanitizeOverrides(overrides = {}, { maxFields = 200 } = {}) {
  const source = overrides || {};
  const fields = {};
  Object.entries(source.fields || {})
    .filter(([fieldPath]) => fieldPath.length <= 500)
    .slice(0, maxFields)
    .forEach(([fieldPath, value]) => {
      const cleaned = cleanFieldOverride(value);
      if (Object.keys(cleaned).length > 0) fields[fieldPath] = cleaned;
    });

  const monitoring = {};
  if (typeof source.monitoring?.defaultTimeField === "string") {
    monitoring.defaultTimeField = source.monitoring.defaultTimeField.slice(0, 500);
  }

  return {
    dataset: cleanDatasetOverrides(source.dataset),
    fields,
    monitoring,
  };
}

function mergeOverrides(profile, rawOverrides = {}, options) {
  const overrides = sanitizeOverrides(rawOverrides, options);
  const orphanedFields = [];
  const fields = { ...profile.fields };

  Object.entries(overrides.fields).forEach(([fieldPath, value]) => {
    if (!fields[fieldPath]) {
      orphanedFields.push(fieldPath);
      return;
    }
    fields[fieldPath] = {
      ...fields[fieldPath],
      ...value,
      overridden: true,
    };
  });

  const defaultTimeField = overrides.monitoring.defaultTimeField;
  const effectiveTimeField = defaultTimeField && fields[defaultTimeField]
    ? defaultTimeField
    : profile.monitoring.defaultTimeField;

  return {
    profile: {
      ...profile,
      dataset: {
        ...profile.dataset,
        ...overrides.dataset,
      },
      fields,
      monitoring: {
        ...profile.monitoring,
        defaultTimeField: effectiveTimeField,
      },
    },
    overrides,
    orphanedFields,
  };
}

module.exports = {
  mergeOverrides,
  sanitizeOverrides,
};
