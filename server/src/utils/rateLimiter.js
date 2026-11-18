'use strict';
/** Token bucket: `rate` tokens per second, up to `burst`. take() returns false when the caller should be throttled. */
function tokenBucket(rate, burst, now = () => Date.now()) {
  let tokens = burst, last = now();
  return {
    take(cost = 1) {
      const t = now();
      tokens = Math.min(burst, tokens + (t - last) / 1000 * rate); last = t;
      if (tokens < cost) return false;
      tokens -= cost; return true;
    }
  };
}

/** Counts concurrent connections per key (IP address). */
function connectionCounter(max) {
  const counts = new Map();
  return {
    tryAdd(key) { const n = counts.get(key) || 0; if (n >= max) return false; counts.set(key, n + 1); return true; },
    remove(key) { const n = (counts.get(key) || 1) - 1; if (n <= 0) counts.delete(key); else counts.set(key, n); },
    count(key) { return counts.get(key) || 0; }
  };
}

module.exports = { tokenBucket, connectionCounter };
