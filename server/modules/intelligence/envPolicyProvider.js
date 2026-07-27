const DEFAULT_DATASET_INTELLIGENCE_POLICY = Object.freeze({
  enabled: true,
  autoProfile: true,
  profileTtlHours: 168,
  maxSampleRows: 200,
  maxFields: 200,
  llmEnrichment: false,
  backfillBatchSize: 25,
});

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (/^(1|true|yes|on)$/i.test(`${value}`)) return true;
  if (/^(0|false|no|off)$/i.test(`${value}`)) return false;
  return fallback;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getEnvIntelligencePolicy(env = process.env) {
  return {
    datasetIntelligence: {
      enabled: parseBoolean(
        env.CB_DATASET_INTELLIGENCE_ENABLED,
        DEFAULT_DATASET_INTELLIGENCE_POLICY.enabled
      ),
      autoProfile: parseBoolean(
        env.CB_DATASET_INTELLIGENCE_AUTO_PROFILE,
        DEFAULT_DATASET_INTELLIGENCE_POLICY.autoProfile
      ),
      profileTtlHours: parsePositiveInteger(
        env.CB_DATASET_INTELLIGENCE_PROFILE_TTL_HOURS,
        DEFAULT_DATASET_INTELLIGENCE_POLICY.profileTtlHours
      ),
      maxSampleRows: parsePositiveInteger(
        env.CB_DATASET_INTELLIGENCE_MAX_SAMPLE_ROWS,
        DEFAULT_DATASET_INTELLIGENCE_POLICY.maxSampleRows
      ),
      maxFields: parsePositiveInteger(
        env.CB_DATASET_INTELLIGENCE_MAX_FIELDS,
        DEFAULT_DATASET_INTELLIGENCE_POLICY.maxFields
      ),
      llmEnrichment: parseBoolean(
        env.CB_DATASET_INTELLIGENCE_LLM_ENRICHMENT,
        DEFAULT_DATASET_INTELLIGENCE_POLICY.llmEnrichment
      ),
      backfillBatchSize: parsePositiveInteger(
        env.CB_DATASET_INTELLIGENCE_BACKFILL_BATCH_SIZE,
        DEFAULT_DATASET_INTELLIGENCE_POLICY.backfillBatchSize
      ),
    },
  };
}

module.exports = {
  DEFAULT_DATASET_INTELLIGENCE_POLICY,
  getEnvIntelligencePolicy,
  parseBoolean,
  parsePositiveInteger,
};

