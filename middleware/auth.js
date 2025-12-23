const jwt = require("jsonwebtoken");

function authRequired(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({ error: "No token" });
  }

  const parts = header.split(" ");

  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({ error: "Invalid token format" });
  }

  try {
    const decoded = jwt.verify(parts[1], process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

module.exports = { authRequired, adminOnly };
