const { searchDatasetProfiles } = require("../../../datasetIntelligence/searchDatasetProfiles");

async function searchDatasets(payload) {
  const {
    team_id: teamId,
    query,
    project_id: projectId,
    limit,
  } = payload;

  return searchDatasetProfiles({
    teamId: Number(teamId),
    query,
    projectId,
    limit,
  });
}

module.exports = searchDatasets;

