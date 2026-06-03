function isAdmin(req) {
  const password = req.headers["x-admin-password"];
  return Boolean(process.env.ADMIN_PASSWORD || "change-moi") && password === (process.env.ADMIN_PASSWORD || "change-moi");
}

function requireAdmin(req, res) {
  if (!isAdmin(req)) {
    res.status(401).json({ error: "Acces admin refuse" });
    return false;
  }
  return true;
}

module.exports = { isAdmin, requireAdmin };
