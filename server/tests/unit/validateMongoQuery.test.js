import {
  describe, expect, it
} from "vitest";

const validateMongoQuery = require("../../modules/validateMongoQuery");

describe("validateMongoQuery read-only enforcement", () => {
  it("allows read-only collection queries and cursor modifiers", () => {
    for (const query of [
      "collection('users').find({ active: true }).sort({ createdAt: -1 }).limit(10)",
      "collection('orders').aggregate([{ $match: { status: 'paid' } }, { $limit: 5 }])",
      "collection('users').countDocuments({ active: true })",
      "db.collection('users').distinct('country', { active: true })",
    ]) {
      expect(validateMongoQuery(query)).toEqual({ valid: true });
    }
  });

  it("rejects write-capable collection methods", () => {
    for (const methodCall of [
      "drop()",
      "deleteMany({})",
      "updateOne({}, { $set: { role: 'admin' } })",
      "insertOne({ role: 'admin' })",
      "findOneAndUpdate({}, { $set: { role: 'admin' } })",
    ]) {
      const result = validateMongoQuery(`collection('users').${methodCall}`);
      expect(result.valid).toBe(false);
      expect(result.message).toContain("is not read-only");
    }
  });

  it("rejects server-side JavaScript operators", () => {
    for (const query of [
      "collection('users').find({ $where: 'sleep(1000)' })",
      "collection('users').aggregate([{ $project: { value: { $function: { body: 'return 1', args: [], lang: 'js' } } } }])",
      "collection('users').aggregate([{ $group: { _id: null, value: { $accumulator: { init: 'return 0', accumulate: 'return 1', accumulateArgs: [], merge: 'return 1', finalize: 'return 1', lang: 'js' } } } }])",
    ]) {
      const result = validateMongoQuery(query);
      expect(result.valid).toBe(false);
      expect(result.message).toContain("Blocked MongoDB query operator");
    }
  });

  it("rejects aggregation stages that can write data", () => {
    for (const query of [
      "collection('users').aggregate([{ $out: 'copied_users' }])",
      "collection('users').aggregate([{ $merge: { into: 'copied_users' } }])",
    ]) {
      const result = validateMongoQuery(query);
      expect(result.valid).toBe(false);
      expect(result.message).toContain("Blocked MongoDB query operator");
    }
  });
});
