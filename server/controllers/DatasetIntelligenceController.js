const db = require("../models/models");
const { mergeOverrides, sanitizeOverrides } = require("../modules/datasetIntelligence/mergeOverrides");
const { getIntelligencePolicy } = require("../modules/intelligence/policy");
const {
  getDatasetIntelligenceRecord,
  profileDataset,
} = require("../modules/datasetIntelligence/profileDataset");
const { searchDatasetProfiles } = require("../modules/datasetIntelligence/searchDatasetProfiles");

class DatasetIntelligenceController {
  search({ teamId, query, projectId, allowedProjectIds, limit }) {
    return searchDatasetProfiles({
      teamId: Number(teamId),
      query,
      projectId,
      allowedProjectIds,
      limit,
    });
  }

  async get({ datasetId, teamId }) {
    const current = await getDatasetIntelligenceRecord({
      datasetId: Number(datasetId),
      teamId: Number(teamId),
    });
    if (["missing", "stale"].includes(current.status)) {
      return profileDataset({
        datasetId: Number(datasetId),
        teamId: Number(teamId),
      });
    }
    return current;
  }

  refresh({ datasetId, teamId }) {
    return profileDataset({
      datasetId: Number(datasetId),
      teamId: Number(teamId),
      force: true,
    });
  }

  async updateOverrides({ datasetId, teamId, overrides }) {
    const normalizedDatasetId = Number(datasetId);
    const normalizedTeamId = Number(teamId);
    const policy = (await getIntelligencePolicy({
      teamId: normalizedTeamId,
    })).datasetIntelligence;
    if (!policy.enabled) {
      return {
        dataset_id: normalizedDatasetId,
        status: "disabled",
        profile: null,
      };
    }

    let record = await db.DatasetIntelligence.findOne({
      where: {
        dataset_id: normalizedDatasetId,
        team_id: normalizedTeamId,
      },
    });

    if (!record) {
      await profileDataset({
        datasetId: normalizedDatasetId,
        teamId: normalizedTeamId,
      });
      record = await db.DatasetIntelligence.findOne({
        where: {
          dataset_id: normalizedDatasetId,
          team_id: normalizedTeamId,
        },
      });
    }

    const sanitized = sanitizeOverrides(overrides, {
      maxFields: policy.maxFields,
    });
    if (record?.profile) {
      mergeOverrides(record.profile, sanitized);
    }
    await record.update({ overrides: sanitized, status: "stale" });

    return profileDataset({
      datasetId: normalizedDatasetId,
      teamId: normalizedTeamId,
      force: true,
    });
  }
}

module.exports = DatasetIntelligenceController;
