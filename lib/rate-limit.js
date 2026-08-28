const attempts = globalThis.__atcLoginAttempts || new Map();
globalThis.__atcLoginAttempts = attempts;

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function clientAddress(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket?.remoteAddress || "unknown";
}

function checkLoginRateLimit(req, scope = "login") {
  const now = Date.now();
  const key = `${scope}:${clientAddress(req)}`;
  const recent = (attempts.get(key) || []).filter((timestamp) => now - timestamp < WINDOW_MS);
  if (recent.length >= MAX_ATTEMPTS) {
    attempts.set(key, recent);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - recent[0])) / 1000)) };
  }
  return { allowed: true, recordFailure: () => attempts.set(key, [...recent, now]), clear: () => attempts.delete(key) };
}

module.exports = { checkLoginRateLimit };
