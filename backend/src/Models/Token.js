// src/Models/Token.js
const mongoose = require("mongoose");

const tokenSchema = new mongoose.Schema(
  {
    name: { type: String, unique: true }, // e.g. "clearbooks_main"
    accessToken: String,
    refreshToken: String,
    businessId: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Token", tokenSchema);
