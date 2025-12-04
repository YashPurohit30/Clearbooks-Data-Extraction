/// routes/auth.js
const express = require("express");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const User = require("../Models/User");
const Token = require("../Models/Token"); // 👈 NEW: MongoDB Token model
require("dotenv").config();

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_clearbooks_jwt_123";

// 🌍 FRONTEND URL (Local + Render + Vercel)
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

/* ===========================================================
   USER AUTH (REGISTER + LOGIN)
=========================================================== */

// 🆕 Register user (Admin/Postman only)
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res
        .status(400)
        .json({ success: false, message: "Email already registered" });
    }

    const user = new User({ name, email, password });
    await user.save();

    res.json({ success: true, message: "User registered successfully" });
  } catch (err) {
    console.error("❌ /auth/register error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// 🔑 Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    const payload = {
      id: user._id,
      email: user.email,
      name: user.name,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });

    res.json({
      success: true,
      token,
      user: payload,
    });
  } catch (err) {
    console.error("❌ /auth/login error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ===========================================================
   CLEARBOOKS OAUTH (CONNECT + CALLBACK + DISCONNECT)
=========================================================== */

// 🚀 Step 1: Redirect user to ClearBooks OAuth
router.get("/connect", (req, res) => {
  const scopes = [
    "accounting.sales:read",
    "accounting.purchases:read",
    "accounting.transactions:read",
    "accounting.payments:read",
    "accounting.payments:write",
    "businesses:read",
    "accounting.customers:read",
    "accounting.suppliers:read",
    "accounting.account_codes:read",
    "accounting.bank_accounts:read",
    "accounting.allocations:read",
  ].join(" ");

  const authUrl = `${process.env.AUTHORIZATION_URL}?response_type=code&client_id=${
    process.env.CLIENT_ID
  }&redirect_uri=${encodeURIComponent(
    process.env.REDIRECT_URI
  )}&scope=${encodeURIComponent(scopes)}`;

  res.redirect(authUrl);
});

// 🚀 Step 2: OAuth Callback
router.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("Missing authorization code");

  try {
    console.log("🔁 Received code:", code);
    console.log("🔁 redirect_uri:", process.env.REDIRECT_URI);

    // 1️⃣ Exchange code for token
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.REDIRECT_URI,
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
    });

    const tokenRes = await axios.post(
      process.env.TOKEN_URL,
      params.toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const tokenData = tokenRes.data;
    tokenData.expires_at = Date.now() + tokenData.expires_in * 1000;

    // 2️⃣ Fetch businesses
    console.log("🔍 Fetching businesses...");
    const bizRes = await axios.get(
      "https://api.clearbooks.co.uk/v1/businesses",
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }
    );

    const businesses = bizRes.data;
    console.log("🏢 Businesses:", businesses);

    if (!businesses || businesses.length === 0) {
      return res.json({
        success: false,
        message: "No businesses found.",
      });
    }

    // 3️⃣ Select first business
    const selected = businesses[0];
    console.log(`✅ Selected business: ${selected.name} (${selected.id})`);

    // 4️⃣ Save business_id inside tokenData
    tokenData.business_id = selected.id;

    // 5️⃣ 🔄 Save tokens in MongoDB instead of tokens.json
    await Token.findOneAndUpdate(
      { name: "clearbooks_main" },
      {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        businessId: tokenData.business_id,
      },
      { upsert: true, new: true }
    );
    console.log("💾 Tokens saved in MongoDB for clearbooks_main");

    // 6️⃣ Redirect to frontend
    return res.redirect(
      `${FRONTEND_URL}/?auth=success&company=${encodeURIComponent(
        selected.name
      )}`
    );
  } catch (err) {
    console.error("❌ Callback Error:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: "Failed to exchange token or fetch businesses.",
      error: err.response?.data || err.message,
    });
  }
});

// 🔌 Disconnect ClearBooks
router.post("/disconnect", async (req, res) => {
  try {
    await Token.deleteOne({ name: "clearbooks_main" }); // 👈 DB se tokens hatao

    console.log("🗑 ClearBooks tokens deleted from MongoDB");

    return res.json({
      success: true,
      message: "Disconnected from ClearBooks.",
    });
  } catch (err) {
    console.error("❌ /auth/disconnect error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to disconnect ClearBooks.",
    });
  }
});

module.exports = router;
