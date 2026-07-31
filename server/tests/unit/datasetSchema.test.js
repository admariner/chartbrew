const { discoverDatasetFieldsSchema } = require("../../modules/datasetSchema");

describe("discoverDatasetFieldsSchema", () => {
  it("discovers fields from flat array rows", () => {
    expect(discoverDatasetFieldsSchema([
      { id: 1, createdAt: "2026-07-30T10:00:00.000Z", paid: true },
    ])).toEqual({
      "root[].id": "number",
      "root[].createdAt": "date",
      "root[].paid": "boolean",
    });
  });

  it("discovers nested objects and arrays", () => {
    expect(discoverDatasetFieldsSchema({
      orders: [{
        id: 1,
        customer: { name: "Ada" },
        items: [{ sku: "book", price: 12 }],
      }],
    })).toEqual({
      "root.orders": "array",
      "root.orders[].id": "number",
      "root.orders[].customer": "object",
      "root.orders[].customer.name": "string",
      "root.orders[].items": "array",
      "root.orders[].items[].sku": "string",
      "root.orders[].items[].price": "number",
    });
  });

  it("uses later rows to resolve null values and optional fields", () => {
    expect(discoverDatasetFieldsSchema([
      { id: 1, value: null },
      { id: 2, value: 10, label: "second" },
    ])).toEqual({
      "root[].id": "number",
      "root[].value": "number",
      "root[].label": "string",
    });
  });

  it.each([
    null,
    undefined,
    "text",
    42,
    true,
    [],
    [1, 2, 3],
  ])("returns an empty schema for data without object fields", (data) => {
    expect(discoverDatasetFieldsSchema(data)).toEqual({});
  });
});
