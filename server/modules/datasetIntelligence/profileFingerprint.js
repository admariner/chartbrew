const crypto = require("crypto");

function normalizeForHash(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeForHash);
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        if (value[key] !== undefined) {
          result[key] = normalizeForHash(value[key]);
        }
        return result;
      }, {});
  }

  return value;
}

function createFingerprint(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(normalizeForHash(value)))
    .digest("hex");
}

function buildProfileFingerprints({ dataset, dataRequests = [], usages = [] }) {
  const schemaFingerprint = createFingerprint(dataset.fieldsSchema || {});
  const definitionFingerprint = createFingerprint({
    joinSettings: dataset.joinSettings || {},
    mainDataRequestId: dataset.main_dr_id || null,
    dataRequests: dataRequests.map((dataRequest) => ({
      id: dataRequest.id,
      connectionId: dataRequest.connection_id,
      method: dataRequest.method,
      route: dataRequest.route,
      query: dataRequest.query,
      configuration: dataRequest.configuration,
      conditions: dataRequest.conditions,
      transform: dataRequest.transform,
      variableNames: Object.keys(dataRequest.variables || {}).sort(),
    })),
  });
  const usageFingerprint = createFingerprint(usages);

  return {
    schemaFingerprint,
    definitionFingerprint,
    usageFingerprint,
    fingerprint: createFingerprint({
      schemaFingerprint,
      definitionFingerprint,
      usageFingerprint,
    }),
  };
}

module.exports = {
  buildProfileFingerprints,
  createFingerprint,
  normalizeForHash,
};

