const { Queue } = require("bullmq");

const { getQueueOptions } = require("../../redisConnection");
const { recordIntelligenceEvent } = require("./observability");

const QUEUE_NAME = "datasetIntelligenceQueue";
let datasetIntelligenceQueue;

function getDatasetIntelligenceQueue() {
  if (datasetIntelligenceQueue) return datasetIntelligenceQueue;

  datasetIntelligenceQueue = new Queue(QUEUE_NAME, getQueueOptions());
  datasetIntelligenceQueue.on("error", () => {
    recordIntelligenceEvent("queue_error", { status: "failed" });
  });
  return datasetIntelligenceQueue;
}

function buildProfileJob({
  datasetId,
  teamId,
  sampleSummary,
  generationReason = "dataset_execution",
}) {
  return {
    data: {
      datasetId,
      teamId,
      sampleSummary,
      generationReason,
    },
    options: {
      jobId: `dataset-intelligence-${teamId}-${datasetId}`,
      delay: 1000,
      removeOnComplete: true,
    },
  };
}

async function enqueueDatasetProfile({
  datasetId,
  teamId,
  sampleSummary,
  generationReason = "dataset_execution",
}) {
  const queue = getDatasetIntelligenceQueue();
  const profileJob = buildProfileJob({
    datasetId,
    teamId,
    sampleSummary,
    generationReason,
  });
  let job;
  try {
    job = await queue.add("profileDataset", profileJob.data, profileJob.options);
  } catch (error) {
    recordIntelligenceEvent("queue_enqueue_failed", {
      datasetId,
      teamId,
      generationReason,
      status: "failed",
    });
    throw error;
  }

  recordIntelligenceEvent("queue_enqueued", {
    datasetId,
    teamId,
    generationReason,
    sampleCount: sampleSummary?.rowCountSampled || 0,
    status: "queued",
  });
  return job;
}

module.exports = {
  QUEUE_NAME,
  buildProfileJob,
  enqueueDatasetProfile,
  getDatasetIntelligenceQueue,
};
