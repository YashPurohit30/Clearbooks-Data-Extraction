import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  HiDownload,
  HiLink,
  HiDocumentDownload,
  HiCheckCircle,
  HiOutlineCog,
} from "react-icons/hi";
import * as XLSX from "xlsx";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

const Dashboard = () => {
  const [data, setData] = useState([]);
  const [endpoint, setEndpoint] = useState("sales/invoices");
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // 🔑 JWT user auth state
  const [token, setToken] = useState(localStorage.getItem("cb_token") || "");
  const [user, setUser] = useState(
    localStorage.getItem("cb_user")
      ? JSON.parse(localStorage.getItem("cb_user"))
      : null
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");

  // 🔗 ClearBooks OAuth state
  const [showSuccess, setShowSuccess] = useState(false);
  const [company, setCompany] = useState(
    localStorage.getItem("clearbooks_company") || ""
  );
  const [isConnected, setIsConnected] = useState(
    !!localStorage.getItem("clearbooks_company")
  );

  // ⭐ NEW: API message (subscription / connect issues, etc.)
  const [apiMessage, setApiMessage] = useState("");

  // ✅ ClearBooks OAuth callback handle
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("auth") === "success") {
      setShowSuccess(true);
      setIsConnected(true);
    }

    const companyName = params.get("company");
    if (companyName) {
      setCompany(companyName);
      localStorage.setItem("clearbooks_company", companyName);
      setIsConnected(true);
    }

    const storedCompany = localStorage.getItem("clearbooks_company");
    if (storedCompany && !company) {
      setCompany(storedCompany);
      setIsConnected(true);
    }

    // URL clean kar do
    window.history.replaceState({}, "", window.location.pathname);
    setTimeout(() => setShowSuccess(false), 5000);
  }, [company]);

  /* ------------------------------------------------------------------
   * 🔐 LOGIN + LOGOUT FUNCTIONS
   * ------------------------------------------------------------------ */

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError("");
    setApiMessage("");

    try {
      const res = await axios.post(`${API_BASE}/auth/login`, {
        email,
        password,
      });

      if (res.data.success) {
        localStorage.setItem("cb_token", res.data.token);
        localStorage.setItem("cb_user", JSON.stringify(res.data.user));
        setToken(res.data.token);
        setUser(res.data.user);
        setEmail("");
        setPassword("");
      } else {
        setLoginError("Invalid credentials");
      }
    } catch (err) {
      console.error(err);
      setLoginError(
        err.response?.data?.message || "Login failed. Please try again."
      );
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("cb_token");
    localStorage.removeItem("cb_user");
    setToken("");
    setUser(null);
    setData([]);
    setApiMessage("");
  };

  /* ------------------------------------------------------------------
   * CLEARBOOKS CONNECT + DATA FETCH + EXPORT
   * ------------------------------------------------------------------ */

  const handleConnect = () => {
    window.location.href = `${API_BASE}/auth/connect`;
  };

  const handleDisconnect = async () => {
    try {
      await axios.post(`${API_BASE}/auth/disconnect`);
    } catch (err) {
      console.error(err);
    }

    localStorage.removeItem("clearbooks_company");
    setCompany("");
    setIsConnected(false);
    setApiMessage("");
  };

  const fetchData = async () => {
    if (!token) {
      alert("Please login first");
      return;
    }

    if (!isConnected) {
      alert("Please connect ClearBooks account first");
      return;
    }

    setLoading(true);
    setApiMessage(""); // ⭐ clear old message
    try {
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const res = await axios.get(`${API_BASE}/clearbooks/${endpoint}`, {
        params,
        headers: {
          Authorization: `Bearer ${token}`, // 🔑 JWT header
        },
      });

      setData(res.data?.data || []);
      if ((res.data?.data || []).length === 0) {
        setApiMessage("No records found for the selected filter.");
      }
    } catch (err) {
      console.error(err);
      const status = err.response?.status;
      const dataRes = err.response?.data;

      // 401 → session / token issue
      if (status === 401) {
        alert("Session expired / unauthorized. Please login again.");
        handleLogout();
        return;
      }

      // 🔔 BUSINESS_NO_SUBSCRIPTION from backend
      if (dataRes?.errorCode === "BUSINESS_NO_SUBSCRIPTION") {
        const msg =
          dataRes?.message ||
          "This ClearBooks business does not have an active subscription for this feature.";
        setApiMessage(msg);
        alert(
          "⚠️ ClearBooks subscription for this business does not allow this feature.\n\n" +
            "Please contact the client / ClearBooks to enable or upgrade the plan."
        );
        return;
      }

      // 🔔 ClearBooks not connected / auth incomplete
      if (
        dataRes?.errorCode === "CLEARBOOKS_TOKENS_NOT_FOUND" ||
        dataRes?.errorCode === "CLEARBOOKS_AUTH_INCOMPLETE"
      ) {
        const msg =
          dataRes?.message ||
          "ClearBooks connection issue. Please reconnect from the top-right Connect button.";
        setApiMessage(msg);
        alert(msg);
        return;
      }

      // Generic fallback
      const generic =
        dataRes?.message || "Failed to fetch data. Please try again.";
      setApiMessage(generic);
      alert(generic);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!data.length) return;

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "Data");

    const cleanName = endpoint.replace("/", "_");
    const fileName = `${company || "ClearBooks"}_${cleanName}_${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx`;

    XLSX.writeFile(wb, fileName);
  };

  /* ------------------------------------------------------------------
   🔐 IF NOT LOGGED IN → SHOW LOGIN / REGISTER PAGE
  ------------------------------------------------------------------- */

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white/90 backdrop-blur-xl border border-gray-200 rounded-3xl shadow-2xl p-10">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-gray-400 to-gray-600 rounded-2xl blur-xl opacity-40" />
              <div className="relative p-2 bg-white rounded-2xl border border-gray-200">
                <img
                  src="/nlogosmall.png"
                  alt="Logo"
                  className="w-10 h-10 rounded-xl"
                />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-light text-gray-900">
                ClearBooks Dashboard
              </h1>
              <p className="text-xs text-gray-500 tracking-wide">
                MMC Convert · Internal Tool
              </p>
            </div>
          </div>

          {isRegister ? (
            <>
              {/* REGISTER FORM */}
              <h2 className="text-xl font-light text-gray-800 mb-6">
                Create New Account
              </h2>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setLoginError("");
                  setApiMessage("");

                  try {
                    const res = await axios.post(`${API_BASE}/auth/register`, {
                      name,
                      email,
                      password,
                    });

                    if (res.data.success) {
                      alert("Account created successfully. Please login now.");
                      setIsRegister(false);
                    } else {
                      setLoginError(
                        res.data.message || "Registration failed"
                      );
                    }
                  } catch (err) {
                    setLoginError(
                      err.response?.data?.message || "Registration failed."
                    );
                  }
                }}
                className="space-y-5"
              >
                <div>
                  <label className="block text-sm text-gray-600 mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 rounded-2xl border border-gray-300 bg-gray-50"
                    placeholder="Your Name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    className="w-full px-4 py-3 rounded-2xl border border-gray-300 bg-gray-50"
                    placeholder="you@mmcconvert.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    className="w-full px-4 py-3 rounded-2xl border border-gray-300 bg-gray-50"
                    placeholder="••••••••"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                {loginError && (
                  <p className="text-sm text-red-500">{loginError}</p>
                )}

                <button
                  type="submit"
                  className="w-full py-3 mt-2 bg-gray-900 text-white rounded-2xl"
                >
                  Register
                </button>
              </form>

              <p className="mt-4 text-sm text-center text-gray-500">
                Already have an account?{" "}
                <button
                  onClick={() => setIsRegister(false)}
                  className="text-gray-900 underline"
                >
                  Login here
                </button>
              </p>
            </>
          ) : (
            <>
              {/* LOGIN FORM */}
              <p className="text-sm text-gray-500 mb-6">
                Sign in to access the ClearBooks extraction dashboard.
              </p>

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-sm text-gray-600 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    className="w-full px-4 py-3 rounded-2xl border border-gray-300 bg-gray-50"
                    placeholder="you@mmcconvert.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    className="w-full px-4 py-3 rounded-2xl border border-gray-300 bg-gray-50"
                    placeholder="••••••••"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                {loginError && (
                  <p className="text-sm text-red-500">{loginError}</p>
                )}

                <button
                  type="submit"
                  className="w-full py-3 mt-2 bg-gray-900 text-white rounded-2xl"
                >
                  Sign In
                </button>
              </form>

              <p className="mt-4 text-sm text-center text-gray-500">
                Don't have an account?{" "}
                <button
                  onClick={() => setIsRegister(true)}
                  className="text-gray-900 underline"
                >
                  Create one
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------
   * ✅ LOGGED IN → SHOW MAIN DASHBOARD
   * ------------------------------------------------------------------ */

  return (
    <>
      {/* Loader */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-white"
          >
            <div className="relative">
              <div className="w-28 h-28 border-8 border-gray-100 rounded-full animate-spin"></div>
              <div
                className="absolute inset-0 w-28 h-28 border-t-8 border-gray-900 rounded-full animate-spin"
                style={{ animationDelay: "0.15s" }}
              ></div>
              <div className="absolute inset-4 w-20 h-20 bg-gray-900/5 rounded-full blur-xl animate-pulse"></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="min-h-screen bg-white text-gray-900 relative overflow-hidden">
        {/* Background */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-white to-gray-50"></div>
          <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-gray-200/20 to-transparent rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-tl from-gray-200/20 to-transparent rounded-full blur-3xl"></div>
        </div>

        {/* Success Toast */}
        <AnimatePresence>
          {showSuccess && (
            <motion.div
              initial={{ y: -100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -100, opacity: 0 }}
              className="fixed top-8 left-1/2 -translate-x-1/2 z-50"
            >
              <div className="bg-white/95 backdrop-blur-2xl border border-gray-200 px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3">
                <HiCheckCircle className="w-6 h-6 text-gray-900" />
                <span className="font-medium text-gray-800">
                  Connected to ClearBooks
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative z-10 max-w-7xl mx-auto px-6 py-12">
          {/* Header */}
          <motion.header
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex items-center justify-between mb-16"
          >
            <div className="flex items-center gap-6">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-gray-400 to-gray-600 rounded-3xl blur-2xl opacity-50 group-hover:opacity-70 transition-all duration-500"></div>
                <div className="relative p-3 bg-white rounded-3xl shadow-2xl border border-gray-200">
                  <img
                    src="/nlogosmall.png"
                    alt="Logo"
                    className="w-16 h-16 rounded-2xl"
                  />
                </div>
              </div>

              <div>
                <h1 className="text-5xl font-extralight tracking-tight">
                  <span className="text-gray-900">ClearBooks</span>
                  <span className="text-gray-600 ml-3">Dashboard</span>
                </h1>
                <p className="text-gray-500 text-sm tracking-widest">
                  {company
                    ? `Connected: ${company}`
                    : "Not connected to ClearBooks"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {user && (
                <div className="text-right">
                  <p className="text-sm text-gray-600">Logged in as</p>
                  <p className="text-sm font-medium text-gray-900">
                    {user.name}
                  </p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                </div>
              )}

              {!isConnected ? (
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={handleConnect}
                  className="px-6 py-4 bg-gray-900 text-white font-medium rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300"
                >
                  <span className="flex items-center gap-3">
                    <HiLink className="w-5 h-5" />
                    Connect Account
                  </span>
                </motion.button>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-3 px-6 py-4 bg-gray-100 border border-gray-300 rounded-2xl">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <div className="flex flex-col">
                      <span className="text-gray-700 font-medium">
                        Secure Sync Active
                      </span>
                      {company && (
                        <span className="text-gray-500 text-sm">
                          {company}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={handleDisconnect}
                    className="px-4 py-2 bg-white border border-gray-300 rounded-2xl text-xs text-gray-700 hover:border-red-400 hover:text-red-500"
                  >
                    Disconnect
                  </button>
                </div>
              )}

              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-2xl text-sm text-gray-700 hover:border-gray-900"
              >
                Logout
              </button>
            </div>
          </motion.header>

          {/* Control Panel */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white/80 backdrop-blur-2xl border border-gray-200 rounded-3xl p-10 mb-10 shadow-2xl"
          >
            <div className="flex items-center gap-4 mb-6">
              <HiOutlineCog className="w-8 h-8 text-gray-700" />
              <h2 className="text-2xl font-light text-gray-800">
                Control Panel
              </h2>
            </div>

            {/* 🔔 API message banner */}
            {apiMessage && (
              <div className="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
                {apiMessage}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
              <div className="md:col-span-2">
                <label className="text-gray-600 text-sm font-medium mb-3 block">
                  Data Source
                </label>
                <select
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 text-gray-900 px-6 py-5 rounded-2xl focus:border-gray-900 focus:outline-none transition-all duration-300"
                >
                  <option value="sales/invoices">Sales Invoices</option>
                  <option value="purchases/bills">Purchase Bills</option>
                  <option value="payments">Payments</option>
                  <option value="invoice-payments">Invoice Payments</option>
                  <option value="bill-payments">Bill Payments</option>
                  <option value="customers">Customers</option>
                  <option value="suppliers">Suppliers</option>
                  <option value="bankAccounts">Bank Accounts</option>
                  <option value="accountCodes">Account Code</option>
                  <option value="payment-allocations">Allocation</option>
                </select>
              </div>

              <div>
                <label className="text-gray-600 text-sm font-medium mb-3 block">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 text-gray-900 px-6 py-5 rounded-2xl focus:border-gray-900 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="text-gray-600 text-sm font-medium mb-3 block">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 text-gray-900 px-6 py-5 rounded-2xl focus:border-gray-900 focus:outline-none transition-all"
                />
              </div>
            </div>

            <div className="flex gap-6">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                onClick={fetchData}
                className="px-12 py-5 bg-gray-900 text-white font-medium rounded-2xl shadow-xl hover:shadow-2xl flex items-center gap-3 transition-all"
              >
                <HiDownload className="w-6 h-6" />
                Fetch Records
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleExport}
                disabled={!data.length}
                className="px-12 py-5 bg-gray-100 border-2 border-gray-300 text-gray-700 font-medium rounded-2xl flex items-center gap-3 disabled:opacity-50 transition-all hover:border-gray-900"
              >
                <HiDocumentDownload className="w-6 h-6" />
                Export Excel
              </motion.button>
            </div>
          </motion.div>

          {/* Data Table */}
          {data.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/80 backdrop-blur-2xl border border-gray-200 rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="px-10 py-8 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-light text-gray-800">
                    Financial Records
                  </h3>
                  <span className="text-gray-900 font-semibold">
                    {data.length} entries
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left border-b border-gray-200">
                      {Object.keys(data[0] || {})
                        .slice(0, 6)
                        .map((key) => (
                          <th
                            key={key}
                            className="px-8 py-6 text-gray-600 font-medium text-sm tracking-wider"
                          >
                            {key}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.slice(0, 12).map((row, i) => (
                      <motion.tr
                        key={i}
                        initial={{ opacity: 0, x: -40 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="border-b border-gray-100 hover:bg-gray-50/50 transition-all"
                      >
                        {Object.values(row)
                          .slice(0, 6)
                          .map((val, j) => (
                            <td
                              key={j}
                              className="px-8 py-6 text-gray-700 text-sm"
                            >
                              {String(val).substring(0, 100)}
                              {String(val).length > 100 && "..."}
                            </td>
                          ))}
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </>
  );
};

export default Dashboard;
