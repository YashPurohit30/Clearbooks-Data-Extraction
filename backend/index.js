// server.js
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const authRoutes = require("./src/routes/auth");               // 👈 tumhara abhi wala auth.js
const clearbooksRoutes = require("./src/routes/clearbooks"); // 👈 woh bada routes file
const authMiddleware = require("./src/middlewares/auth"); // 👈 JWT middleware

const app = express();

app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
}));    
app.use(express.json());

// MongoDB Atlas connect
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch((err) => console.error("❌ MongoDB connection error:", err.message));

// Public auth routes
app.use("/auth", authRoutes); // /auth/login, /auth/register, /auth/connect, /auth/callback

// Protected ClearBooks API routes – saare pe JWT check
app.use("/clearbooks", authMiddleware, clearbooksRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
