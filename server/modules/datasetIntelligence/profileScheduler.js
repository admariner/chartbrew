const { getIntelligencePolicy } = require("../intelligence/policy");
const { findSampleRows } = require("./inferFieldSemantics");
const { profileDataset } = require("./profileDataset");

const pendingProfiles = new Map();

async function scheduleDatasetProfile({ datasetId, teamId, sampleData }) {
  const policy = (await getIntelligencePolicy({ teamId })).datasetIntelligence;
  if (!policy.enabled || !policy.autoProfile || !datasetId || !teamId) return null;
  if (pendingProfiles.has(datasetId)) return pendingProfiles.get(datasetId);

  const boundedSample = findSampleRows(sampleData, policy.maxSampleRows);
  const pending = new Promise((resolve) => {
    setImmediate(async () => {
      try {
        resolve(await profileDataset({
          datasetId,
          teamId,
          sampleData: boundedSample,
          policy: { datasetIntelligence: policy },
        }));
      } catch (error) {
        resolve(null);
      } finally {
        pendingProfiles.delete(datasetId);
      }
    });
  });

  pendingProfiles.set(datasetId, pending);
  return pending;
}

module.exports = {
  pendingProfiles,
  scheduleDatasetProfile,
};

