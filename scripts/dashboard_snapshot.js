#!/usr/bin/env node
/**
 * Phase 2 guard rail: capture the full dashboard response, or diff against a
 * previously captured one. Every field must match, or the refactor changed a
 * number it should not have.
 *
 *   node scripts/dashboard_snapshot.js --save=baseline.json
 *   node scripts/dashboard_snapshot.js --diff=baseline.json
 *
 * Read-only against the database.
 */
require('module-alias/register');
require('dotenv').config();

const fs = require('fs');
const db = require('@models');
const controller = require('@controllers/superadmin/dashboard.controller');

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : null;
};

const call = async (userId, role) => {
  const res = { statusCode: 200, payload: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.send = (p) => { res.payload = p; return res; };
  const t = process.hrtime.bigint();
  await controller.index({ userId, role, query: {}, body: {}, params: {} }, res);
  return {
    ms: Number(process.hrtime.bigint() - t) / 1e6,
    status: res.statusCode,
    data: (res.payload && res.payload.data) || null,
  };
};

(async () => {
  await db.sequelize.authenticate();
  const out = await call(1, 1);

  if (out.status !== 200 || !out.data) {
    console.error(`FAILED: status ${out.status}`);
    console.error(JSON.stringify(out, null, 2).slice(0, 800));
    process.exit(1);
  }

  const savePath = arg('save');
  const diffPath = arg('diff');

  if (savePath) {
    fs.writeFileSync(savePath, JSON.stringify(out.data, null, 2));
    console.log(`saved ${Object.keys(out.data).length} fields to ${savePath}  (${out.ms.toFixed(0)} ms)`);
  } else if (diffPath) {
    const before = JSON.parse(fs.readFileSync(diffPath, 'utf8'));
    const after = out.data;
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    const diffs = [];
    for (const k of keys) {
      const a = JSON.stringify(before[k]);
      const b = JSON.stringify(after[k]);
      if (a !== b) diffs.push({ field: k, before: a, after: b });
    }
    console.log(`compared ${keys.length} fields  (${out.ms.toFixed(0)} ms this run)\n`);
    if (!diffs.length) {
      console.log('  ✅ PARITY — every field identical');
    } else {
      console.log(`  ❌ ${diffs.length} field(s) changed:\n`);
      diffs.forEach((d) => {
        console.log(`    ${d.field}`);
        console.log(`      before: ${String(d.before).slice(0, 110)}`);
        console.log(`      after : ${String(d.after).slice(0, 110)}`);
      });
      process.exitCode = 1;
    }
  } else {
    console.log(JSON.stringify(out.data, null, 2));
  }

  await db.sequelize.close();
})().catch((e) => { console.error(e); process.exit(1); });
