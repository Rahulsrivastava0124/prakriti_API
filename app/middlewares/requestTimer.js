/**
 * Request timing middleware.
 *
 * Replaces app/middlewares/requestLogger.js, which has three defects that make
 * it report nothing useful:
 *
 *   1. It computes the duration on the line immediately after starting the
 *      timer — before next() is called — so it always reports ~0 ms.
 *   2. It reads res.statusCode before the handler has run, so it always
 *      reports the default 200.
 *   3. Its only persistence (fs.appendFile) is commented out.
 *
 * This version measures on the 'finish' event, which fires after the response
 * has been flushed, so the number is the real end-to-end handler time.
 *
 * Wiring (server.js): replace
 *     const { demoLogger } = require('./app/middlewares');
 *     app.use(demoLogger);
 * with
 *     const requestTimer = require('./app/middlewares/requestTimer');
 *     app.use(requestTimer());
 *
 * The old requestLogger.js is left untouched so you can roll back by reverting
 * those two lines.
 */

const DEFAULTS = {
  slowMs: Number(process.env.SLOW_REQUEST_MS) || 1000,
  // Paths that are noisy and uninteresting. Static assets are already served
  // before this middleware in most configurations, but health checks are not.
  ignore: [/^\/public\//, /^\/favicon/, /^\/api-docs/],
};

const colour = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
};

const tint = (ms, slowMs) => {
  if (ms >= slowMs) return colour.red;
  if (ms >= slowMs / 2) return colour.yellow;
  return colour.green;
};

/**
 * In-memory rolling stats, so you can see p95 without wiring up a metrics
 * backend. Exposed via requestTimer.stats() — see the bottom of this file.
 */
const samples = new Map();
const MAX_SAMPLES = 200;

const record = (key, ms) => {
  let list = samples.get(key);
  if (!list) {
    list = [];
    samples.set(key, list);
  }
  list.push(ms);
  if (list.length > MAX_SAMPLES) list.shift();
};

const percentile = (sorted, p) => {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
};

const requestTimer = (options = {}) => {
  const config = { ...DEFAULTS, ...options };

  return (req, res, next) => {
    if (config.ignore.some((pattern) => pattern.test(req.originalUrl || req.url))) {
      return next();
    }

    const start = process.hrtime.bigint();

    // 'finish' fires once the last byte has been handed to the OS.
    // 'close' catches client disconnects, which 'finish' does not.
    let done = false;
    const complete = (aborted) => {
      if (done) return;
      done = true;

      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const route = `${req.method} ${(req.originalUrl || req.url).split('?')[0]}`;

      record(route, ms);

      const status = aborted ? 'ABORTED' : res.statusCode;
      const line = `${route} ${status} ${ms.toFixed(1)}ms`;

      if (ms >= config.slowMs) {
        console.warn(`${colour.red}[SLOW]${colour.reset} ${line}`);
      } else {
        console.log(`${tint(ms, config.slowMs)}${line}${colour.reset}`);
      }
    };

    res.on('finish', () => complete(false));
    res.on('close', () => complete(true));

    next();
  };
};

/**
 * Snapshot of what has been observed since the process started.
 *
 * Useful during optimisation work — hit the dashboard a dozen times, then:
 *   const { stats } = require('@middlewares/requestTimer');
 *   console.table(stats());
 *
 * Or expose it on a debug route guarded by your superadmin middleware.
 */
requestTimer.stats = () =>
  [...samples.entries()]
    .map(([route, list]) => {
      const sorted = [...list].sort((a, b) => a - b);
      const sum = sorted.reduce((acc, v) => acc + v, 0);
      return {
        route,
        calls: sorted.length,
        avg_ms: Math.round(sum / sorted.length),
        p50_ms: Math.round(percentile(sorted, 50)),
        p95_ms: Math.round(percentile(sorted, 95)),
        max_ms: Math.round(sorted[sorted.length - 1]),
      };
    })
    .sort((a, b) => b.p95_ms - a.p95_ms);

requestTimer.reset = () => samples.clear();

module.exports = requestTimer;
