#!/usr/bin/env node
/**
 * End-to-end response time for GET /dashboard.
 *
 * Invokes the real controller with a mocked req/res, so it measures exactly
 * what the endpoint spends before it can send its first byte — no HTTP server,
 * no auth, no client. Reports wall time, SQL time, query count and payload size
 * per role, cold (cache miss) and warm (cache hit).
 *
 *   node scripts/dashboard_endpoint_timing.js
 *   node scripts/dashboard_endpoint_timing.js --role=1
 *
 * Read-only: the dashboard handler only reads.
 */
require('module-alias/register');
require('dotenv').config();

const db = require('@models');
const sequelize = db.sequelize;
const controller = require('@controllers/superadmin/dashboard.controller');

let queries = 0;
let sqlMs = 0;
const origRun = sequelize.dialect.Query.prototype.run;
sequelize.dialect.Query.prototype.run = function (sql, ...rest) {
  queries++;
  const t = process.hrtime.bigint();
  return origRun.call(this, sql, ...rest).then((r) => {
    sqlMs += Number(process.hrtime.bigint() - t) / 1e6;
    return r;
  });
};

const ROLES = { 1: 'superadmin', 2: 'admin', 3: 'distributor', 4: 'sales_executive', 9: 'manager' };

// Minimal stand-ins for what the handler touches on req/res.
const makeReq = (userId, role) => ({ userId, role, query: {}, body: {}, params: {} });
const makeRes = () => {
  const res = { statusCode: 200, payload: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.send = (p) => { res.payload = p; return res; };
  return res;
};

const call = async (userId, role) => {
  queries = 0;
  sqlMs = 0;
  const req = makeReq(userId, role);
  const res = makeRes();
  const t = process.hrtime.bigint();
  await controller.index(req, res);
  const wall = Number(process.hrtime.bigint() - t) / 1e6;
  const body = JSON.stringify(res.payload || {});
  return { wall, sqlMs, queries, status: res.statusCode, bytes: body.length, payload: res.payload };
};

const fmt = (n, w = 9) => n.toFixed(0).padStart(w);

(async () => {
  await sequelize.authenticate();

  const only = (process.argv.find((a) => a.startsWith('--role=')) || '').split('=')[1];
  const roleIds = only ? [Number(only)] : Object.keys(ROLES).map(Number);

  // Pick a real user per role so the handler runs its actual branch.
  const users = await db.users.findAll({ attributes: ['id', 'role_id'], raw: true });
  const pick = (roleId) => {
    const u = users.find((x) => x.role_id === roleId);
    return u ? u.id : null;
  };

  console.log('GET /dashboard — end-to-end response time\n');
  console.log('role'.padEnd(18) + 'queries'.padStart(8) + 'in db'.padStart(11) + 'in node'.padStart(11) + 'RESPONSE'.padStart(12) + 'payload'.padStart(11) + '  status');
  console.log('-'.repeat(82));

  const results = [];
  for (const roleId of roleIds) {
    const uid = pick(roleId);
    if (!uid) { console.log(`${ROLES[roleId].padEnd(18)}  (no user with this role in the database)`); continue; }

    const cold = await call(uid, roleId);
    const warm = await call(uid, roleId);   // second call hits the 60 s in-memory cache
    results.push({ role: ROLES[roleId], roleId, uid, cold, warm });

    console.log(
      `${ROLES[roleId].padEnd(18)}${String(cold.queries).padStart(8)}${fmt(cold.sqlMs, 9)} ms${fmt(cold.wall - cold.sqlMs, 8)} ms` +
      `${fmt(cold.wall, 9)} ms${String((cold.bytes / 1024).toFixed(1) + ' KB').padStart(11)}   ${cold.status}`
    );
    console.log(
      `${'  └ cached'.padEnd(18)}${String(warm.queries).padStart(8)}${fmt(warm.sqlMs, 9)} ms${fmt(warm.wall - warm.sqlMs, 8)} ms` +
      `${fmt(warm.wall, 9)} ms${''.padStart(11)}   ${warm.status}`
    );
  }

  console.log('\n' + '-'.repeat(82));
  const worst = results.filter(r => r.cold.status === 200).sort((a, b) => b.cold.wall - a.cold.wall)[0];
  if (worst) {
    console.log(`slowest role: ${worst.role} — ${worst.cold.wall.toFixed(0)} ms cold, ` +
      `${worst.cold.queries} queries, ${(worst.cold.sqlMs / worst.cold.wall * 100).toFixed(0)}% of it waiting on SQL`);
  }
  const failed = results.filter(r => r.cold.status !== 200);
  if (failed.length) {
    console.log('\nroles that errored (payload below):');
    failed.forEach(r => console.log(`  ${r.role}: ${JSON.stringify(r.cold.payload).slice(0, 200)}`));
  }

  await sequelize.close();
})().catch((e) => { console.error(e); process.exit(1); });
