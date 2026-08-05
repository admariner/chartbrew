import {
  beforeEach, describe, expect, it, vi
} from "vitest";

const db = require("../../models/models");
const ChartController = require("../../controllers/ChartController");
const { getSourceById } = require("../../sources");

describe("ChartController connection scoping", () => {
  let controller;
  let runChartQuerySpy;

  beforeEach(() => {
    vi.restoreAllMocks();
    controller = new ChartController();
    vi.spyOn(db.Project, "findByPk").mockResolvedValue({ id: 10, team_id: 7 });
    runChartQuerySpy = vi.spyOn(getSourceById("postgres").backend, "runChartQuery")
      .mockResolvedValue({ data: [{ value: 1 }] });
  });

  it("scopes test queries to the project's team", async () => {
    const connection = { id: 42, team_id: 7, type: "postgres" };
    const scopedLookupSpy = vi.spyOn(controller.connectionController, "findByIdAndTeam")
      .mockResolvedValue(connection);
    const unscopedLookupSpy = vi.spyOn(controller.connectionController, "findById");

    await controller.testQuery({ connection_id: 42, query: "SELECT 1" }, 10);

    expect(scopedLookupSpy).toHaveBeenCalledWith(42, 7);
    expect(unscopedLookupSpy).not.toHaveBeenCalled();
    expect(runChartQuerySpy).toHaveBeenCalledWith({ connection, query: "SELECT 1" });
  });

  it("scopes preview queries to the project's team", async () => {
    const connection = { id: 42, team_id: 7, type: "postgres" };
    vi.spyOn(controller.chartCache, "findLast").mockResolvedValue(null);
    vi.spyOn(controller.chartCache, "create").mockResolvedValue(null);
    const scopedLookupSpy = vi.spyOn(controller.connectionController, "findByIdAndTeam")
      .mockResolvedValue(connection);
    const unscopedLookupSpy = vi.spyOn(controller.connectionController, "findById");

    await controller.getPreviewData(
      { id: 9, connection_id: 42, query: "SELECT 1" },
      10,
      { id: 5 },
      false
    );

    expect(scopedLookupSpy).toHaveBeenCalledWith(42, 7);
    expect(unscopedLookupSpy).not.toHaveBeenCalled();
    expect(runChartQuerySpy).toHaveBeenCalledWith({ connection, query: "SELECT 1" });
  });

  it("rejects queries when the project does not exist", async () => {
    db.Project.findByPk.mockResolvedValue(null);
    const scopedLookupSpy = vi.spyOn(controller.connectionController, "findByIdAndTeam");

    await expect(controller.testQuery({ connection_id: 42, query: "SELECT 1" }, 999))
      .rejects.toThrow("404");
    expect(scopedLookupSpy).not.toHaveBeenCalled();
  });
});
