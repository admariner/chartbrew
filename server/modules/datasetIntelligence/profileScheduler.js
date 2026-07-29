const { getIntelligencePolicy } = require("../intelligence/policy");
const { summarizeSampleData } = require("./inferFieldSemantics");
const { enqueueDatasetProfile } = require("./profileQueue");

const pendingProfiles = new Map();

async function scheduleDatasetProfile(
  { datasetId, teamId, sampleData },
  enqueueProfile = enqueueDatasetProfile
) {
  const policy = (await getIntelligencePolicy({ teamId })).datasetIntelligence;
  if (!policy.enabled || !policy.autoProfile || !datasetId || !teamId) return null;
  const pendingKey = `${teamId}:${datasetId}`;
  if (pendingProfiles.has(pendingKey)) return pendingProfiles.get(pendingKey);

  const sampleSummary = summarizeSampleData(
    sampleData,
    policy.maxSampleRows,
    policy.maxFields
  );
  const pending = enqueueProfile({
    datasetId,
    teamId,
    sampleSummary,
  }).catch(() => null)
    .finally(() => pendingProfiles.delete(pendingKey));

  pendingProfiles.set(pendingKey, pending);
  return pending;
}

async function scheduleDataRequestProfile(
  { dataset, dataRequestId, sampleData },
  scheduleProfile = scheduleDatasetProfile
) {
  const joins = dataset?.joinSettings?.joins;
  const isMainRequest = Number(dataset?.main_dr_id) === Number(dataRequestId);
  const hasJoins = Array.isArray(joins) && joins.length > 0;

  if (!isMainRequest || hasJoins) return null;

  return scheduleProfile({
    datasetId: dataset.id,
    teamId: dataset.team_id,
    sampleData,
  });
}

module.exports = {
  pendingProfiles,
  scheduleDataRequestProfile,
  scheduleDatasetProfile,
};
