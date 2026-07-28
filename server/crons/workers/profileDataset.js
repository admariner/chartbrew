const {
  profileDataset,
} = require("../../modules/datasetIntelligence/profileDataset");

async function profileDatasetWorker(job, runProfileDataset = profileDataset) {
  return runProfileDataset({
    datasetId: job.data.datasetId,
    teamId: job.data.teamId,
    sampleSummary: job.data.sampleSummary,
    generationReason: job.data.generationReason || "dataset_execution",
    throwOnFailure: true,
  });
}

module.exports = profileDatasetWorker;
