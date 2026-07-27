const Sequelize = require("sequelize");

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable("DatasetIntelligence", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      dataset_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "Dataset",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      team_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "Team",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      version: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "pending",
      },
      fingerprint: {
        type: Sequelize.STRING,
      },
      profile: {
        type: Sequelize.TEXT("long"),
      },
      overrides: {
        type: Sequelize.TEXT("long"),
      },
      generated_at: {
        type: Sequelize.DATE,
      },
      expires_at: {
        type: Sequelize.DATE,
      },
      last_error: {
        type: Sequelize.TEXT,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex("DatasetIntelligence", ["dataset_id"], {
      unique: true,
      name: "dataset_intelligence_dataset_unique",
    });
    await queryInterface.addIndex("DatasetIntelligence", ["team_id", "status"], {
      name: "dataset_intelligence_team_status",
    });
    await queryInterface.addIndex("DatasetIntelligence", ["expires_at"], {
      name: "dataset_intelligence_expires_at",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("DatasetIntelligence");
  },
};

