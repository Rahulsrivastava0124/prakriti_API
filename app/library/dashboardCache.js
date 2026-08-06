/**
 * Small in-process TTL cache for dashboard data.
 *
 * Scope of usefulness: this is a per-process Map. It is the right tool for a
 * single Node process serving an admin panel. If you later run the API under
 * PM2 cluster mode or multiple containers, each worker keeps its own copy —
 * still correct, just a lower hit rate. Move to Redis at that point; the
 * interface below is deliberately narrow so the swap is contained.
 *
 * Two distinct uses:
 *
 *   remember(key, ttl, fn)  — cache an expensive result across requests
 *   requestScope(req)       — memoise within a single request, so a helper
 *                             called twice with the same arguments only runs once
 */

const store = new Map();

const now = () => Date.now();

/**
 * Cache an async result under `key` for `ttlMs`.
 *
 * Concurrent callers that miss share one in-flight promise rather than each
 * launching their own — otherwise a cold cache under load produces a thundering
 * herd, which on this dashboard would mean N × 134 queries at once.
 */
const remember = async (key, ttlMs, produce) => {
  const hit = store.get(key);

  if (hit) {
    if (hit.pending) return hit.pending;
    if (now() - hit.at < ttlMs) return hit.value;
  }

  const pending = (async () => {
    try {
      const value = await produce();
      store.set(key, { value, at: now() });
      return value;
    } catch (error) {
      // Never cache a failure — drop the entry so the next call retries.
      store.delete(key);
      throw error;
    }
  })();

  store.set(key, { pending, at: now() });
  return pending;
};

/**
 * Drop everything whose key starts with `prefix`.
 *
 * Call this from write paths that invalidate dashboard figures — sale create
 * and update, purchase create and update, stock movement, user create. With a
 * 60-second TTL this is optional; with a longer TTL it is not.
 *
 *   const { invalidate } = require('@library/dashboardCache');
 *   invalidate('dashboard:');
 */
const invalidate = (prefix = '') => {
  let dropped = 0;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      dropped += 1;
    }
  }
  return dropped;
};

/**
 * Per-request memoisation.
 *
 * The dashboard calls avlStockUserIdsNew twice with identical arguments, and
 * getSuperAdminId four or more times. Each call is a fresh round-trip to a
 * remote database for an answer that cannot have changed mid-request.
 *
 * Usage inside a controller:
 *
 *   const scope = requestScope(req);
 *   const ids = await scope('avlIds:superadmin', () => avlStockUserIdsNew(req, roleId));
 *
 * The cache lives on the req object, so it is garbage-collected with the
 * request and can never serve one user's data to another.
 */
const requestScope = (req) => {
  if (!req.__dashScope) req.__dashScope = new Map();
  const scope = req.__dashScope;

  return (key, produce) => {
    if (scope.has(key)) return scope.get(key);
    const promise = Promise.resolve().then(produce);
    scope.set(key, promise);
    return promise;
  };
};

/**
 * Module-scope memo for values that are effectively constant for the process
 * lifetime — the super admin's user id being the obvious one.
 *
 *   const getSuperAdminIdCached = constant('superAdminId', getSuperAdminId);
 */
const constant = (key, produce) => {
  let cached = null;
  return async () => {
    if (cached !== null) return cached;
    cached = await produce();
    return cached;
  };
};

const stats = () => ({
  entries: store.size,
  keys: [...store.keys()],
});

module.exports = { remember, invalidate, requestScope, constant, stats };
