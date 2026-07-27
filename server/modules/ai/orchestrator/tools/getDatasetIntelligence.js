const {
  getDatasetIntelligenceRecord,
  profileDataset,
} = require("../../../datasetIntelligence/profileDataset");
const { requireDatasetForTeam } = require("./teamScope");

async function getDatasetIntelligence(payload) {
  const { dataset_id: datasetId, team_id: teamId } = payload;
  const dataset = await requireDatasetForTeam(datasetId, teamId);
  const current = await getDatasetIntelligenceRecord({
    datasetId: dataset.id,
    teamId: Number(teamId),
  });

  if (["missing", "stale"].includes(current.status)) {
    return profileDataset({
      datasetId: dataset.id,
      teamId: Number(teamId),
    });
  }

  return current;
}

module.exports = getDatasetIntelligence;

