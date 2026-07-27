const _ = require("lodash");

function normalizeLegacyGroups(groups) {
  let normalizedGroups = groups;
  if (typeof normalizedGroups === "string") {
    try {
      normalizedGroups = JSON.parse(normalizedGroups);
    } catch {
      return [];
    }
  }

  if (Array.isArray(normalizedGroups)) {
    return normalizedGroups.filter((group) => {
      return typeof group?.key === "string" && typeof group?.value === "string";
    });
  }

  if (!normalizedGroups || typeof normalizedGroups !== "object") return [];
  if (typeof normalizedGroups.key === "string" && typeof normalizedGroups.value === "string") {
    return [normalizedGroups];
  }

  return Object.entries(normalizedGroups)
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => ({ key, value }));
}

function applyLegacyTabularOptions(rows, options = {}) {
  const groups = normalizeLegacyGroups(options.groups);
  const pairedRows = rows.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const newItem = { ...item };
    groups.forEach((group) => {
      let key = _.get(newItem, group.key);
      const value = _.get(newItem, group.value);
      if (key && value && typeof key.replaceAll === "function") {
        key = key.replaceAll(".", " ");
        newItem[`${key}`] = value;
      }
    });
    return newItem;
  });

  const groupBy = typeof options.groupBy === "string"
    ? options.groupBy.replace("root[].", "")
    : null;
  if (!groupBy) return pairedRows;

  const groupedRows = [];
  pairedRows.forEach((item) => {
    const value = _.get(item, groupBy);
    const foundIndex = groupedRows.findIndex((grouped) => _.get(grouped, groupBy) === value);
    if (foundIndex > -1) groupedRows[foundIndex] = { ...groupedRows[foundIndex], ...item };
    else groupedRows.push(item);
  });
  return groupedRows;
}

module.exports = {
  applyLegacyTabularOptions,
};
