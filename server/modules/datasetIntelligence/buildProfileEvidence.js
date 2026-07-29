const { inferFieldSemantics } = require("./inferFieldSemantics");

const ENCODING_ROLES = {
  value: "measure",
  time: "time",
  category: "dimension",
  breakdown: "dimension",
  row: "dimension",
  column: "dimension",
};

function uniqueBy(items, keyBuilder) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyBuilder(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function addUsageField(usageByField, field, role, aggregation, evidence) {
  if (!field) return;
  const current = usageByField[field] || { evidence: [] };
  usageByField[field] = {
    role: role || current.role,
    aggregation: aggregation && aggregation !== "none" ? aggregation : current.aggregation,
    evidence: [...new Set([...(current.evidence || []), evidence].filter(Boolean))],
  };
}

function getEncodingFields(encoding = {}) {
  const entries = [];
  Object.entries(encoding).forEach(([slot, value]) => {
    if (slot === "columns" && Array.isArray(value)) {
      value.forEach((column) => entries.push({ slot: "dimension", value: column }));
      return;
    }
    if (value?.field) entries.push({ slot, value });
  });
  return entries;
}

function getConditionFields(conditions) {
  if (!conditions) return [];
  if (Array.isArray(conditions)) {
    return conditions.flatMap(getConditionFields);
  }
  if (typeof conditions !== "object") return [];

  const fields = [];
  if (typeof conditions.field === "string") fields.push(conditions.field);
  if (typeof conditions.path === "string") fields.push(conditions.path);
  Object.values(conditions).forEach((value) => {
    if (value && typeof value === "object") fields.push(...getConditionFields(value));
  });
  return fields;
}

function collectDatasetUsage(dataset) {
  const chartIds = [];
  const dashboardIds = [];
  const metrics = [];
  const dimensions = [];
  const filters = [];
  const analyses = [];
  const usageByField = {};
  const fingerprintUsages = [];
  const refreshIntervals = [];

  (dataset.ChartDatasetConfigs || []).forEach((cdc) => {
    const chart = cdc.Chart;
    if (!chart) return;
    const project = chart.Project;
    chartIds.push(chart.id);
    if (project?.id) dashboardIds.push(project.id);
    if (Number.isInteger(chart.autoUpdate) && chart.autoUpdate > 0) {
      refreshIntervals.push(chart.autoUpdate);
    }

    const matchingLayers = (chart.visualization?.layers || [])
      .filter((layer) => `${layer.bindingId}` === `${cdc.id}`);

    matchingLayers.forEach((layer) => {
      getEncodingFields(layer.encoding).forEach(({ slot, value }) => {
        const role = ENCODING_ROLES[slot] || slot;
        addUsageField(
          usageByField,
          value.field,
          role,
          value.aggregate,
          `chart:${chart.id}:${slot}`
        );

        const usage = {
          field: value.field,
          aggregation: value.aggregate || "none",
          chartId: chart.id,
          chartName: chart.name,
          dashboardId: project?.id || null,
          dashboardName: project?.name || null,
        };
        if (role === "measure") metrics.push(usage);
        if (["dimension", "time"].includes(role)) {
          dimensions.push({ ...usage, role });
        }
      });
    });

    if (matchingLayers.length === 0) {
      addUsageField(usageByField, cdc.yAxis, "measure", cdc.yAxisOperation, `cdc:${cdc.id}:value`);
      addUsageField(
        usageByField,
        cdc.dateField,
        "time",
        "none",
        `cdc:${cdc.id}:time`
      );
      addUsageField(
        usageByField,
        cdc.xAxis,
        cdc.xAxis === cdc.dateField ? "time" : "dimension",
        cdc.xAxisOperation,
        `cdc:${cdc.id}:category`
      );

      if (cdc.yAxis) {
        metrics.push({
          field: cdc.yAxis,
          aggregation: cdc.yAxisOperation || "none",
          chartId: chart.id,
          chartName: chart.name,
          dashboardId: project?.id || null,
          dashboardName: project?.name || null,
        });
      }
    }

    getConditionFields(cdc.conditions).forEach((field) => {
      filters.push({
        field,
        chartId: chart.id,
        chartName: chart.name,
      });
    });

    analyses.push({
      chartId: chart.id,
      chartName: chart.name,
      chartType: chart.type,
      dashboardId: project?.id || null,
      dashboardName: project?.name || null,
    });

    fingerprintUsages.push({
      cdcId: cdc.id,
      chartId: chart.id,
      projectId: project?.id || null,
      visualization: chart.visualization || null,
      xAxis: cdc.xAxis,
      xAxisOperation: cdc.xAxisOperation,
      yAxis: cdc.yAxis,
      yAxisOperation: cdc.yAxisOperation,
      dateField: cdc.dateField,
      conditions: cdc.conditions,
      alertTypes: (cdc.Alerts || []).map((alert) => alert.type).sort(),
    });
  });

  return {
    usageByField,
    fingerprintUsages,
    usage: {
      chartIds: [...new Set(chartIds)],
      dashboardIds: [...new Set(dashboardIds)],
      metrics: uniqueBy(metrics, (item) => `${item.field}:${item.aggregation}:${item.chartId}`),
      dimensions: uniqueBy(
        dimensions,
        (item) => `${item.field}:${item.role}:${item.chartId}`
      ),
      filters: uniqueBy(filters, (item) => `${item.field}:${item.chartId}`),
      analyses: uniqueBy(analyses, (item) => `${item.chartId}`),
    },
    freshnessExpectation: refreshIntervals.length > 0
      ? Math.min(...refreshIntervals)
      : null,
  };
}

function inferGrain(fields, quality) {
  const rowCount = quality.rowCountSampled;
  if (!rowCount) return { grain: null, confidence: 0 };

  const identifier = Object.entries(fields).find(([fieldPath, field]) => {
    return field.role === "identifier"
      && quality.cardinality[fieldPath] === rowCount
      && quality.nullRates[fieldPath] === 0;
  });

  if (!identifier) return { grain: null, confidence: 0 };
  const label = identifier[0].replace(/^root\[\]\.?/, "").replace(/[_.]/g, " ");
  return {
    grain: `One row per ${label}`,
    confidence: 0.88,
  };
}

function buildDatasetProfile({
  dataset, sampleData, sampleSummary, policy
}) {
  const {
    usage,
    usageByField,
    fingerprintUsages,
    freshnessExpectation,
  } = collectDatasetUsage(dataset);
  const { fields, quality } = inferFieldSemantics({
    fieldsSchema: dataset.fieldsSchema || {},
    sampleData,
    sampleSummary,
    usageByField,
    maxSampleRows: policy.maxSampleRows,
    maxFields: policy.maxFields,
  });
  const inferredGrain = inferGrain(fields, quality);
  const timeFields = Object.entries(fields)
    .filter(([, field]) => field.role === "time")
    .sort(([, left], [, right]) => right.confidence - left.confidence);
  const usedTimeField = usage.dimensions.find((item) => item.role === "time")?.field;
  const defaultTimeField = usedTimeField || timeFields[0]?.[0] || null;
  const usedMetricFields = new Set(usage.metrics.map((metric) => metric.field));
  const usedDimensionFields = new Set(usage.dimensions.map((dimension) => dimension.field));

  return {
    profile: {
      version: 1,
      dataset: {
        summary: dataset.name || dataset.legend || "Untitled dataset",
        grain: inferredGrain.grain,
        confidence: inferredGrain.confidence || 0.7,
      },
      fields,
      usage,
      quality,
      monitoring: {
        defaultTimeField,
        candidateMetrics: Object.entries(fields)
          .filter(([, field]) => field.role === "measure")
          .sort(([left], [right]) => {
            return Number(usedMetricFields.has(right)) - Number(usedMetricFields.has(left));
          })
          .map(([field, value]) => ({
            field,
            aggregation: value.defaultAggregation,
            usedByCharts: usedMetricFields.has(field),
          })),
        candidateSegments: Object.entries(fields)
          .filter(([fieldPath, field]) => {
            return field.role === "dimension"
              && (quality.cardinality[fieldPath] || 0) <= 100;
          })
          .sort(([left], [right]) => {
            return Number(usedDimensionFields.has(right)) - Number(usedDimensionFields.has(left));
          })
          .map(([field]) => ({
            field,
            usedByCharts: usedDimensionFields.has(field),
          })),
        freshnessExpectation,
      },
      provenance: {
        sampleGeneratedAt: quality.rowCountSampled > 0 ? new Date().toISOString() : null,
        llmEnriched: false,
      },
    },
    fingerprintUsages,
  };
}

module.exports = {
  buildDatasetProfile,
  collectDatasetUsage,
  getConditionFields,
  inferGrain,
};
