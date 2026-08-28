const { timingSafeEqual } = require("crypto");

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isAdmin(req) {
  const password = req.headers["x-admin-password"];
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedPassword || expectedPassword === "change-moi") return false;
  return safeEqual(password, expectedPassword);
}

function requireAdmin(req, res) {
  if (!isAdmin(req)) {
    res.status(401).json({ error: "Acces admin refuse" });
    return false;
  }
  return true;
}

module.exports = { isAdmin, requireAdmin };
