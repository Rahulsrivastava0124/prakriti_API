/**
 * The executive list shows two retailer figures: Own (what this executive
 * brought in) and Total (the team's shared book). Checks that each row gets the
 * right pair and that the shared Total is counted once per distributor, not
 * once per row.
 */
const assert = require("assert");
const path = require("path");
const Module = require("module");

const calls = { own: [], group: [] };
const stubs = {
  "@helpers/helper": {
    mapConcurrent: (rows, fn) => Promise.all(rows.map(fn)),
    isObject: (d) => !Array.isArray(d),
    getFileAbsulatePath: (p) => p,
    isEmpty: (v) => v === null || v === undefined || v === "",
    isArray: Array.isArray,
    displayAmount: (v) => v,
    ucWords: (v) => v,
  },
  "@library/common": {
    getTotalStockPriceByUser: async () => 0,
    getTotalStockByUser: async () => 0,
    getWalletBalance: async () => 0,
    getTodayAttendence: async () => "",
    getLoginLogoutAddress: async () => "",
    getRoleId: (name) => (name === "sales_executive" ? 4 : 99),
    getMyRetailerIds: async (id) => {
      calls.own.push(id);
      return { 11: [1, 2], 12: [3], 21: [4] }[id] || [];
    },
    getSalesExecutiveGroupOwnerIds: async (id) => {
      calls.group.push(id);
      return { 11: [11, 12, 5], 12: [11, 12, 5], 21: [21, 6] }[id];
    },
    getMyRetailerIdsFor: async (ownerIds) =>
      ownerIds.includes(5) ? [1, 2, 3, 9] : [4],
  },
};

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request in stubs) return request;
  return origResolve.call(this, request, ...args);
};
const origLoad = Module._load;
Module._load = function (request, ...args) {
  if (request in stubs) return stubs[request];
  return origLoad.call(this, request, ...args);
};

const { EmployeeListCollection } = require(path.join(
  __dirname,
  "app/resources/superadmin/EmployeeListCollection.js"
));

(async () => {
  const rows = await EmployeeListCollection(
    [
      { id: 11, parent_id: 5, role_id: 4, name: "A", mobile: "1" },
      { id: 12, parent_id: 5, role_id: 4, name: "B", mobile: "2" },
      { id: 21, parent_id: 6, role_id: 4, name: "C", mobile: "3" },
      { id: 31, parent_id: 5, role_id: 3, name: "Manager", mobile: "4" },
    ],
    true
  );

  assert.deepStrictEqual(
    rows.map((r) => [r.own_retailer, r.total_retailer]),
    [[2, 4], [1, 4], [1, 1], [0, 0]],
    "own is per executive, total is the team's book, non-executives get 0"
  );

  // 11 and 12 share parent 5, so their shared total is resolved once; 21 is a
  // different team and gets its own lookup.
  assert.deepStrictEqual(calls.group, [11, 21], "one lookup per parent, not per row");
  assert.deepStrictEqual(calls.own, [11, 12, 21], "own counted per executive");

  console.log("ok");
})();
