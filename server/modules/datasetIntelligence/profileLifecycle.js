const db = require("../../models/models");

async function markDatasetIntelligenceStale(datasetId, teamId) {
  if (!datasetId) return 0;
  try {
    return await db.DatasetIntelligence.update({
      status: "stale",
    }, {
      where: {
        dataset_id: datasetId,
        ...(teamId ? { team_id: teamId } : {}),
        status: "ready",
      },
    }).then(([updated]) => updated);
  } catch (error) {
    return 0;
  }
}

async function markChartDatasetIntelligenceStale(chartId) {
  if (!chartId) return 0;
  try {
    const bindings = await db.ChartDatasetConfig.findAll({
      where: { chart_id: chartId },
      attributes: ["dataset_id"],
    });
    const datasetIds = [...new Set(bindings.map((binding) => binding.dataset_id).filter(Boolean))];
    if (datasetIds.length === 0) return 0;

    const results = await Promise.all(datasetIds.map((datasetId) => {
      return markDatasetIntelligenceStale(datasetId);
    }));
    return results.reduce((total, count) => total + count, 0);
  } catch (error) {
    return 0;
  }
}

module.exports = {
  markChartDatasetIntelligenceStale,
  markDatasetIntelligenceStale,
};
