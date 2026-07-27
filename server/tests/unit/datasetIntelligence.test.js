import {
  afterEach, describe, expect, it, vi
} from "vitest";

process.env.CB_ENCRYPTION_KEY_DEV = "00".repeat(32);

const { DataTypes, Sequelize } = require("sequelize");
const db = require("../../models/models");
const datasetIntelligenceModel = require("../../models/models/datasetintelligence");
const {
  DEFAULT_DATASET_INTELLIGENCE_POLICY,
  getEnvIntelligencePolicy,
} = require("../../modules/intelligence/envPolicyProvider");
const {
  getIntelligencePolicy,
  registerIntelligencePolicyProvider,
  resetIntelligencePolicyProvider,
} = require("../../modules/intelligence/policy");
const {
  buildDatasetProfile,
  collectDatasetUsage,
} = require("../../modules/datasetIntelligence/buildProfileEvidence");
const {
  inferFieldSemantics,
} = require("../../modules/datasetIntelligence/inferFieldSemantics");
const {
  mergeOverrides,
  sanitizeOverrides,
} = require("../../modules/datasetIntelligence/mergeOverrides");
const {
  buildProfileFingerprints,
  createFingerprint,
} = require("../../modules/datasetIntelligence/profileFingerprint");
const {
  serializeProfile,
  validateProfile,
} = require("../../modules/datasetIntelligence/profileSchema");
const {
  scoreDataset,
} = require("../../modules/datasetIntelligence/searchDatasetProfiles");
const {
  getProfileResponse,
  isExpired,
  pendingProfileRuns,
  profileDataset,
} = require("../../modules/datasetIntelligence/profileDataset");
const {
  markChartDatasetIntelligenceStale,
  markDatasetIntelligenceStale,
} = require("../../modules/datasetIntelligence/profileLifecycle");

const policy = {
  ...DEFAULT_DATASET_INTELLIGENCE_POLICY,
  maxSampleRows: 10,
  maxFields: 20,
};

function buildDataset() {
  return {
    id: 42,
    name: "Completed orders",
    fieldsSchema: {
      "root[].order_id": "string",
      "root[].completed_at": "date",
      "root[].amount": "number",
      "root[].country": "string",
      "root[].conversion_rate": "number",
    },
    joinSettings: {},
    main_dr_id: 9,
    DataRequests: [{
      id: 9,
      connection_id: 2,
      query: "select * from orders",
      configuration: {},
      conditions: [],
      transform: {},
      variables: { startDate: "2026-01-01" },
    }],
    ChartDatasetConfigs: [{
      id: "cdc-1",
      conditions: [{ field: "root[].country" }],
      Alerts: [{ type: "anomaly" }],
      Chart: {
        id: 8,
        name: "Revenue by country",
        type: "bar",
        autoUpdate: 3600,
        visualization: {
          version: 2,
          layers: [{
            bindingId: "cdc-1",
            encoding: {
              category: { field: "root[].country" },
              value: { field: "root[].amount", aggregate: "sum" },
              time: { field: "root[].completed_at" },
            },
          }],
        },
        Project: {
          id: 3,
          name: "Sales",
          ghost: false,
        },
      },
    }],
  };
}

const sampleRows = [{
  order_id: "ord_1",
  completed_at: "2026-07-20T00:00:00.000Z",
  amount: 120,
  country: "TH",
  conversion_rate: 0.22,
}, {
  order_id: "ord_2",
  completed_at: "2026-07-21T00:00:00.000Z",
  amount: 80,
  country: "GB",
  conversion_rate: 0.18,
}];

afterEach(() => {
  resetIntelligencePolicyProvider();
  vi.restoreAllMocks();
});

describe("intelligence policy", () => {
  it("reads valid env values and falls back for invalid values", () => {
    const result = getEnvIntelligencePolicy({
      CB_DATASET_INTELLIGENCE_ENABLED: "false",
      CB_DATASET_INTELLIGENCE_AUTO_PROFILE: "yes",
      CB_DATASET_INTELLIGENCE_PROFILE_TTL_HOURS: "24",
      CB_DATASET_INTELLIGENCE_MAX_SAMPLE_ROWS: "invalid",
      CB_DATASET_INTELLIGENCE_MAX_FIELDS: "75",
      CB_DATASET_INTELLIGENCE_LLM_ENRICHMENT: "1",
      CB_DATASET_INTELLIGENCE_BACKFILL_BATCH_SIZE: "10",
    }).datasetIntelligence;

    expect(result).toMatchObject({
      enabled: false,
      autoProfile: true,
      profileTtlHours: 24,
      maxSampleRows: DEFAULT_DATASET_INTELLIGENCE_POLICY.maxSampleRows,
      maxFields: 75,
      llmEnrichment: true,
      backfillBatchSize: 10,
    });
  });

  it("allows a team provider within instance ceilings", async () => {
    registerIntelligencePolicyProvider(async () => ({
      datasetIntelligence: {
        maxSampleRows: 50,
        maxFields: 80,
        profileTtlHours: 336,
        llmEnrichment: true,
      },
    }));

    const result = await getIntelligencePolicy({ teamId: 7 });
    expect(result.datasetIntelligence.maxSampleRows).toBeLessThanOrEqual(
      DEFAULT_DATASET_INTELLIGENCE_POLICY.maxSampleRows
    );
    expect(result.datasetIntelligence.maxFields).toBeLessThanOrEqual(
      DEFAULT_DATASET_INTELLIGENCE_POLICY.maxFields
    );
    expect(result.datasetIntelligence.profileTtlHours).toBe(336);
    expect(result.datasetIntelligence.llmEnrichment).toBe(false);
  });
});

describe("dataset intelligence inference", () => {
  it("infers semantic roles, statistics, and aggregations", () => {
    const result = inferFieldSemantics({
      fieldsSchema: buildDataset().fieldsSchema,
      sampleData: sampleRows,
      usageByField: {
        "root[].amount": { role: "measure", aggregation: "sum" },
      },
      maxSampleRows: 10,
      maxFields: 20,
    });

    expect(result.fields["root[].order_id"].role).toBe("identifier");
    expect(result.fields["root[].completed_at"].role).toBe("time");
    expect(result.fields["root[].amount"]).toMatchObject({
      role: "measure",
      semanticType: "currency",
      defaultAggregation: "sum",
    });
    expect(result.fields["root[].conversion_rate"]).toMatchObject({
      role: "measure",
      semanticType: "percentage",
      defaultAggregation: "avg",
    });
    expect(result.quality.cardinality["root[].country"]).toBe(2);
    expect(result.quality.numericRanges["root[].amount"]).toEqual({
      min: 80,
      max: 120,
    });
    expect(result.rows).toBeUndefined();
  });

  it("uses canonical visualization bindings as high-confidence evidence", () => {
    const dataset = buildDataset();
    const usage = collectDatasetUsage(dataset);
    const result = buildDatasetProfile({
      dataset,
      sampleData: sampleRows,
      policy,
    }).profile;

    expect(usage.usageByField["root[].amount"]).toMatchObject({
      role: "measure",
      aggregation: "sum",
    });
    expect(result.dataset.grain).toBe("One row per order id");
    expect(result.monitoring.defaultTimeField).toBe("root[].completed_at");
    expect(result.monitoring.candidateMetrics[0]).toMatchObject({
      field: "root[].amount",
      usedByCharts: true,
    });
    expect(result.usage.filters).toEqual([{
      field: "root[].country",
      chartId: 8,
      chartName: "Revenue by country",
    }]);
  });

  it("ignores visualization layers bound to another dataset", () => {
    const dataset = buildDataset();
    dataset.ChartDatasetConfigs[0].Chart.visualization.layers.push({
      bindingId: "another-cdc",
      encoding: {
        value: { field: "root[].secret_total", aggregate: "sum" },
      },
    });

    const usage = collectDatasetUsage(dataset);
    expect(usage.usageByField["root[].secret_total"]).toBeUndefined();
    expect(usage.usage.metrics.some((metric) => {
      return metric.field === "root[].secret_total";
    })).toBe(false);
  });
});

describe("dataset intelligence persistence contracts", () => {
  it("keeps fingerprints stable and detects definition changes", () => {
    const dataset = buildDataset();
    const first = buildProfileFingerprints({
      dataset,
      dataRequests: dataset.DataRequests,
      usages: [{ chartId: 8 }],
    });
    const second = buildProfileFingerprints({
      dataset,
      dataRequests: dataset.DataRequests,
      usages: [{ chartId: 8 }],
    });
    const changed = buildProfileFingerprints({
      dataset,
      dataRequests: [{ ...dataset.DataRequests[0], query: "select amount from orders" }],
      usages: [{ chartId: 8 }],
    });

    expect(first).toEqual(second);
    expect(changed.definitionFingerprint).not.toBe(first.definitionFingerprint);
    expect(createFingerprint({ b: 2, a: 1 })).toBe(createFingerprint({ a: 1, b: 2 }));
  });

  it("applies valid overrides and reports removed fields", () => {
    const profile = buildDatasetProfile({
      dataset: buildDataset(),
      sampleData: sampleRows,
      policy,
    }).profile;
    const overrides = sanitizeOverrides({
      dataset: {
        summary: "Recognised revenue",
      },
      fields: {
        "root[].amount": {
          role: "measure",
          defaultAggregation: "avg",
        },
        "root[].removed": {
          role: "dimension",
        },
      },
      monitoring: {
        defaultTimeField: "root[].completed_at",
      },
    });
    const merged = mergeOverrides(profile, overrides);

    expect(merged.profile.dataset.summary).toBe("Recognised revenue");
    expect(merged.profile.fields["root[].amount"]).toMatchObject({
      defaultAggregation: "avg",
      overridden: true,
    });
    expect(merged.orphanedFields).toEqual(["root[].removed"]);
  });

  it("validates and caps serialized profiles", () => {
    const profile = buildDatasetProfile({
      dataset: buildDataset(),
      sampleData: sampleRows,
      policy,
    }).profile;
    expect(validateProfile(profile)).toBe(profile);
    const serialized = serializeProfile(profile, {
      maxFields: 2,
      maxUsageReferences: 1,
    });

    expect(Object.keys(serialized.fields)).toHaveLength(2);
    expect(serialized.truncation).toEqual({
      fields: true,
      fieldCount: 5,
    });
    expect(() => validateProfile({ ...profile, version: 2 })).toThrow(
      "Invalid dataset intelligence profile version"
    );
  });

  it("encrypts profile and override JSON at rest", async () => {
    const sequelize = new Sequelize(
      "postgres://chartbrew:chartbrew@localhost:5432/chartbrew_test",
      { logging: false }
    );
    const DatasetIntelligence = datasetIntelligenceModel(sequelize, DataTypes);
    const profile = buildDatasetProfile({
      dataset: buildDataset(),
      sampleData: sampleRows,
      policy,
    }).profile;
    const record = DatasetIntelligence.build({
      dataset_id: 42,
      team_id: 7,
      profile,
      overrides: {
        dataset: { summary: "Recognised revenue" },
      },
    });

    expect(record.getDataValue("profile")).not.toContain("Completed orders");
    expect(record.profile).toEqual(profile);
    expect(record.getDataValue("overrides")).not.toContain("Recognised revenue");
    expect(record.overrides.dataset.summary).toBe("Recognised revenue");
    await sequelize.close();
  });

  it("caps overrides and derives stale status from expiry", () => {
    const overrides = sanitizeOverrides({
      fields: {
        a: { role: "measure" },
        b: { role: "dimension" },
      },
    }, { maxFields: 1 });
    expect(Object.keys(overrides.fields)).toHaveLength(1);

    const record = {
      dataset_id: 42,
      status: "ready",
      version: 1,
      generated_at: new Date("2026-07-01T00:00:00.000Z"),
      expires_at: new Date("2026-07-02T00:00:00.000Z"),
      profile: buildDatasetProfile({
        dataset: buildDataset(),
        sampleData: sampleRows,
        policy,
      }).profile,
      overrides: {},
    };
    expect(isExpired(record)).toBe(true);
    expect(getProfileResponse(record, policy).status).toBe("stale");
  });

  it("deduplicates concurrent profile generation", async () => {
    let releaseEvidence;
    const evidenceGate = new Promise((resolve) => {
      releaseEvidence = resolve;
    });
    vi.spyOn(db.DatasetIntelligence, "findOne").mockResolvedValue(null);
    vi.spyOn(db.Dataset, "findOne").mockImplementation(async () => {
      await evidenceGate;
      return buildDataset();
    });
    vi.spyOn(db.DatasetIntelligence, "create").mockImplementation(async (values) => values);

    const options = {
      datasetId: 42,
      teamId: 7,
      sampleData: sampleRows,
      policy: { datasetIntelligence: policy },
    };
    const first = profileDataset(options);
    const second = profileDataset(options);

    expect(second).toBe(first);
    releaseEvidence();
    await expect(first).resolves.toMatchObject({ status: "ready" });
    expect(db.Dataset.findOne).toHaveBeenCalledTimes(1);
    expect(pendingProfileRuns.size).toBe(0);
  });

  it("keeps lifecycle invalidation best-effort", async () => {
    vi.spyOn(db.DatasetIntelligence, "update").mockRejectedValue(new Error("unavailable"));
    vi.spyOn(db.ChartDatasetConfig, "findAll").mockRejectedValue(new Error("unavailable"));

    await expect(markDatasetIntelligenceStale(42, 7)).resolves.toBe(0);
    await expect(markChartDatasetIntelligenceStale(8)).resolves.toBe(0);
  });
});

describe("dataset intelligence search", () => {
  it("ranks matches with inspectable reasons", () => {
    const dataset = buildDataset();
    const profile = buildDatasetProfile({
      dataset,
      sampleData: sampleRows,
      policy,
    }).profile;
    const result = scoreDataset(dataset, profile, "revenue country");

    expect(result.score).toBeGreaterThan(0);
    expect(result.reasons).toContain("existing_chart");
    expect(result.reasons).toContain("field");
  });
});
