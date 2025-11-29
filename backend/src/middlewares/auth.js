// middleware/auth.js
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "super_secret_clearbooks_jwt_123";

function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"]; // "Bearer token"

  if (!authHeader) {
    return res.status(401).json({ success: false, message: "No token provided" });
  }

  const [type, token] = authHeader.split(" ");

  if (type !== "Bearer" || !token) {
    return res.status(401).json({ success: false, message: "Invalid token format" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // future me use kar sakte ho
    next();
  } catch (err) {
    console.error("JWT error:", err.message);
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

module.exports = authMiddleware;
