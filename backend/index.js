// index.js (ya server.js)
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const authRoutes = require("./src/routes/auth");
const clearbooksRoutes = require("./src/routes/clearbooks");
const authMiddleware = require("./src/middlewares/auth");

const app = express();

/* ----------------------------- CORS SETUP ----------------------------- */

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://clearbooks-data-extraction.vercel.app",
];

// agar .env me FRONTEND_URL diya ho to usko bhi allow kar
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(
  cors({
    origin: function (origin, callback) {
      // Postman / curl ke liye (origin null hota hai)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      console.log("❌ CORS blocked origin:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// preflight ke liye
// app.options("*", cors());

/* --------------------------------------------------------------------- */

app.use(express.json());

/* ------------------------- MONGODB CONNECTION ------------------------- */

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch((err) =>
    console.error("❌ MongoDB connection error:", err.message)
  );

/* ------------------------------ ROUTES -------------------------------- */

// Public auth routes
app.use("/auth", authRoutes); // /auth/login, /auth/register, ...

// Protected ClearBooks routes (JWT required)
app.use("/clearbooks", authMiddleware, clearbooksRoutes);

// Simple health check (optional)
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "ClearBooks backend is running" });
});

/* ------------------------------ SERVER -------------------------------- */

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
