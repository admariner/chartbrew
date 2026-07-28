const ALLOWED_FIELDS = new Set([
  "candidateCount",
  "datasetId",
  "durationMs",
  "enriched",
  "fieldCount",
  "generationReason",
  "profileAgeSeconds",
  "profileStatus",
  "relevance",
  "sampleCount",
  "selectedDatasetId",
  "status",
  "teamId",
  "truncated",
]);

function sanitizeEventPayload(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload)
      .filter(([key, value]) => ALLOWED_FIELDS.has(key) && value !== undefined)
  );
}

function recordIntelligenceEvent(event, payload = {}) {
  console.info(JSON.stringify({ // oxlint-disable-line no-console
    scope: "dataset_intelligence",
    event,
    ...sanitizeEventPayload(payload),
  }));
}

module.exports = {
  recordIntelligenceEvent,
  sanitizeEventPayload,
};
