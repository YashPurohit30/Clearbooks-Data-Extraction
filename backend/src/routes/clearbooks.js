const express = require("express");
const axios = require("axios");
const router = express.Router();
const Token = require("../Models/Token"); // 👈 NEW: MongoDB Token model
// const { getBusinesses } = require("../services/clearbooksAPI");

/* ------------------------------------------------------------------ */
/*  COMMON ERROR HANDLER FOR ROUTES                                   */
/* ------------------------------------------------------------------ */
function handleClearbooksError(route, err, res) {
  const apiError = err.response?.data;

  // ✅ 1. BUSINESS SUBSCRIPTION NOT ACTIVE
  if (
    Array.isArray(apiError) &&
    apiError[0]?.errorCode === "BUSINESS_NO_SUBSCRIPTION"
  ) {
    console.warn(`⚠️ ${route}: BUSINESS_NO_SUBSCRIPTION`);
    return res.status(403).json({
      success: false,
      message:
        "Your ClearBooks subscription does not support this feature. Please upgrade your plan.",
      errorCode: "BUSINESS_NO_SUBSCRIPTION",
    });
  }

  // ✅ 2. ClearBooks not connected
  if (err.code === "CLEARBOOKS_TOKENS_NOT_FOUND") {
    return res.status(400).json({
      success: false,
      message: "ClearBooks not connected. Please run Connect ClearBooks first.",
      errorCode: "CLEARBOOKS_TOKENS_NOT_FOUND",
    });
  }

  // ✅ 3. Token / business missing
  if (err.code === "CLEARBOOKS_AUTH_INCOMPLETE") {
    return res.status(400).json({
      success: false,
      message: "ClearBooks token or business ID missing. Please reconnect.",
      errorCode: "CLEARBOOKS_AUTH_INCOMPLETE",
    });
  }

  // ✅ 4. Generic fallback
  console.error(`❌ ${route} error:`, apiError || err.message);

  return res.status(500).json({
    success: false,
    message:
      (Array.isArray(apiError) && apiError[0]?.errorMessage) ||
      apiError?.error ||
      err.message,
    error: apiError,
  });
}


/* ------------------------------------------------------------------ */
/*  AUTH STORE: MongoDB BASED (NO tokens.json)                         */
/* ------------------------------------------------------------------ */

// ⚙️ Common function to load credentials FROM MONGODB (no tokens.json)
async function loadAuth() {
  const doc = await Token.findOne({ name: "clearbooks_main" });

  if (!doc) {
    const err = new Error("clearbooks_tokens_not_found");
    err.code = "CLEARBOOKS_TOKENS_NOT_FOUND";
    throw err;
  }

  const accessToken = doc.accessToken;
  const businessId = doc.businessId || process.env.CLEARBOOKS_BUSINESS_ID;

  if (!accessToken || !businessId) {
    const err = new Error("Missing access token or business ID");
    err.code = "CLEARBOOKS_AUTH_INCOMPLETE";
    throw err;
  }

  return { accessToken, businessId, refreshToken: doc.refreshToken };
}


// (Ye function tum auth callback me use kar sakte ho; agar already kahin aur bana liya
// hai to ignore kar sakte ho, warna yahan se export karke use karo.)
async function saveAuth({ accessToken, refreshToken, businessId }) {
  await Token.findOneAndUpdate(
    { name: "clearbooks_main" },
    { accessToken, refreshToken, businessId },
    { upsert: true, new: true }
  );
}

/* ------------------------------------------------------------------ */
/*  HELPERS                                                           */
/* ------------------------------------------------------------------ */

// 🗓️ Date filtering helper function
function filterByDate(records, startDate, endDate, dateField = "date") {
  if (!startDate && !endDate) return records;

  return records.filter((record) => {
    const recordDate = new Date(record[dateField]);

    if (startDate && endDate) {
      return (
        recordDate >= new Date(startDate) &&
        recordDate <= new Date(endDate)
      );
    } else if (startDate) {
      return recordDate >= new Date(startDate);
    } else if (endDate) {
      return recordDate <= new Date(endDate);
    }

    return true;
  });
}

async function getBankAccountMap(accessToken, businessId) {
  const baseUrl = "https://api.clearbooks.co.uk/v1/accounting/bankAccounts";
  const limit = 200;
  let page = 1;
  let all = [];

  while (true) {
    const r = await axios.get(baseUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { businessId, limit, page },
    });

    const data = r.data;
    if (!Array.isArray(data) || data.length === 0) break;

    all = all.concat(data);
    if (data.length < limit) break;
    page++;
  }

  // id -> code map
  const map = {};
  for (const b of all) {
    const code =
      b.accountCode || // most likely
      b.nominalCode ||
      b.code ||
      b.accountNumber || // fallback
      b.id; // final fallback

    map[b.id] = code;
  }

  return map;
}

/* ------------------------------------------------------------------ */
/*  ROUTES                                                            */
/* ------------------------------------------------------------------ */

// 🏢 Get businesses  (agar getBusinesses service use kar rahe ho)
router.get("/businesses", async (req, res) => {
  try {
    const data = await getBusinesses();
    res.json({ success: true, data });
  } catch (err) {
    handleClearbooksError("/businesses", err, res);
  }
});

// 📦 SALES (Invoices, Credit Notes, etc.)
router.get("/sales/:salesType", async (req, res) => {
  try {
    const { salesType } = req.params;
    const { startDate, endDate } = req.query;
    const { accessToken, businessId } = await loadAuth();

    const baseUrl = `https://api.clearbooks.co.uk/v1/accounting/sales/${salesType}`;
    let allData = [];
    let page = 1;
    const limit = 200;

    console.log(`📤 Fetching all sales pages for: ${salesType}...`);
    if (startDate) console.log(`📅 Start Date: ${startDate}`);
    if (endDate) console.log(`📅 End Date: ${endDate}`);

    while (true) {
      const params = {
        businessId,
        limit,
        page,
      };

      const response = await axios.get(baseUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params,
      });

      const data = response.data;
      if (!Array.isArray(data) || data.length === 0) break;

      allData = allData.concat(data);
      console.log(`📄 Page ${page} fetched (${data.length} records)`);

      if (data.length < limit) break;
      page++;
    }

    const filteredData = filterByDate(allData, startDate, endDate, "date");

    console.log(`✅ Total records fetched: ${allData.length}`);
    console.log(`✅ After date filter: ${filteredData.length}`);

    res.json({
      success: true,
      total: filteredData.length,
      totalFetched: allData.length,
      filtered: !!(startDate || endDate),
      data: filteredData,
    });
  } catch (err) {
    handleClearbooksError("/sales", err, res);
  }
});

// 🧾 PURCHASES (Bills, Credit Notes, etc.)
router.get("/purchases/:purchaseType", async (req, res) => {
  try {
    const { purchaseType } = req.params;
    const { startDate, endDate } = req.query;
    const { accessToken, businessId } = await loadAuth();

    const baseUrl = `https://api.clearbooks.co.uk/v1/accounting/purchases/${purchaseType}`;
    let allData = [];
    let page = 1;
    const limit = 200;

    console.log(`📤 Fetching all purchase pages for: ${purchaseType}...`);
    if (startDate) console.log(`📅 Start Date: ${startDate}`);
    if (endDate) console.log(`📅 End Date: ${endDate}`);

    while (true) {
      const params = {
        businessId,
        limit,
        page,
      };

      const response = await axios.get(baseUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params,
      });

      const data = response.data;
      if (!Array.isArray(data) || data.length === 0) break;

      allData = allData.concat(data);
      console.log(`📄 Page ${page} fetched (${data.length} records)`);

      if (data.length < limit) break;
      page++;
    }

    const filteredData = filterByDate(allData, startDate, endDate, "date");

    console.log(`✅ Total records fetched: ${allData.length}`);
    console.log(`✅ After date filter: ${filteredData.length}`);

    res.json({
      success: true,
      total: filteredData.length,
      totalFetched: allData.length,
      filtered: !!(startDate || endDate),
      data: filteredData,
    });
  } catch (err) {
    handleClearbooksError("/purchases", err, res);
  }
});

// 💳 PAYMENTS
router.get("/payments", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { accessToken, businessId } = await loadAuth();

    const baseUrl = `https://api.clearbooks.co.uk/v1/accounting/payments`;
    let allPayments = [];
    let page = 1;
    const limit = 200;

    console.log(`✅ Selected business: ${businessId}`);
    console.log("📤 Fetching all payment pages...");
    if (startDate) console.log(`📅 Start Date: ${startDate}`);
    if (endDate) console.log(`📅 End Date: ${endDate}`);

    while (true) {
      const params = {
        businessId,
        limit,
        page,
      };

      const response = await axios.get(baseUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params,
      });

      const data = response.data;
      if (!Array.isArray(data) || data.length === 0) break;

      allPayments = allPayments.concat(data);
      console.log(`📄 Page ${page} fetched (${data.length} records)`);

      if (data.length < limit) break;
      page++;
    }

    const filteredPayments = filterByDate(allPayments, startDate, endDate, "date");

    console.log(`✅ Total payments fetched: ${allPayments.length}`);
    console.log(`✅ After date filter: ${filteredPayments.length}`);

    res.json({
      success: true,
      total: filteredPayments.length,
      totalFetched: allPayments.length,
      filtered: !!(startDate || endDate),
      data: filteredPayments,
    });
  } catch (err) {
    handleClearbooksError("/payments", err, res);
  }
});

// 🔗 PAYMENT ALLOCATIONS
router.get("/payment-allocations", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { accessToken, businessId } = await loadAuth();

    const invoiceTypes = ["sales", "purchases"];
    const limit = 200;
    let allocations = [];

    console.log(`📤 Fetching allocations from Clear Books...`);
    if (startDate) console.log(`📅 Start Date: ${startDate}`);
    if (endDate) console.log(`📅 End Date: ${endDate}`);

    for (const type of invoiceTypes) {
      console.log(`📁 Fetching type: ${type}`);
      let page = 1;

      while (true) {
        const response = await axios.get(
          `https://api.clearbooks.co.uk/v1/accounting/allocations/${type}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { businessId, limit, page },
          }
        );

        const data = response.data;

        if (!Array.isArray(data) || data.length === 0) break;

        allocations = allocations.concat(
          data.map((item) => ({ ...item, allocationType: type }))
        );

        console.log(`📄 Page ${page} (${type}) → ${data.length} records`);

        if (data.length < limit) break;
        page++;
      }
    }

    const filteredData = filterByDate(
      allocations,
      startDate,
      endDate,
      "date"
    );

    console.log(`✅ Total fetched: ${allocations.length}`);
    console.log(`🎯 After filter: ${filteredData.length}`);

    res.json({
      success: true,
      totalFetched: allocations.length,
      total: filteredData.length,
      filtered: !!(startDate || endDate),
      data: filteredData,
    });
  } catch (err) {
    handleClearbooksError("/payment-allocations", err, res);
  }
});

// 🧾 INVOICE PAYMENTS
router.get("/invoice-payments", async (req, res) => {
  try {
    const { accessToken, businessId } = await loadAuth();
    const { startDate, endDate } = req.query;
    const limit = 200;

    let allocations = [];
    let payments = [];
    let invoices = [];

    console.log(
      "📤 Fetching invoice payments (sales allocations + payments + invoices)..."
    );
    if (startDate) console.log(`📅 Start Date: ${startDate}`);
    if (endDate) console.log(`📅 End Date: ${endDate}`);

    // 1️⃣ SALES ALLOCATIONS (payment type only)
    let pageA = 1;
    while (true) {
      const r = await axios.get(
        "https://api.clearbooks.co.uk/v1/accounting/allocations/sales",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            businessId,
            limit,
            page: pageA,
            allocationType: "payment",
          },
        }
      );

      if (!Array.isArray(r.data) || r.data.length === 0) break;

      const pageData = r.data.filter(
        (a) => !a.allocationType || a.allocationType === "payment"
      );

      allocations = allocations.concat(pageData);
      console.log(
        `📄 Sales allocations page ${pageA} → ${pageData.length} records`
      );

      if (r.data.length < limit) break;
      pageA++;
    }

    // 2️⃣ PAYMENTS
    let pageP = 1;
    while (true) {
      const r = await axios.get(
        "https://api.clearbooks.co.uk/v1/accounting/payments",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { businessId, limit, page: pageP },
        }
      );

      if (!Array.isArray(r.data) || r.data.length === 0) break;

      payments = payments.concat(r.data);
      console.log(`📄 Payments page ${pageP} → ${r.data.length} records`);

      if (r.data.length < limit) break;
      pageP++;
    }

    // 3️⃣ SALES INVOICES
    const salesBaseUrl =
      "https://api.clearbooks.co.uk/v1/accounting/sales/invoices";
    let pageS = 1;
    while (true) {
      const r = await axios.get(salesBaseUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { businessId, limit, page: pageS },
      });

      if (!Array.isArray(r.data) || r.data.length === 0) break;

      invoices = invoices.concat(r.data);
      console.log(
        `📄 Sales invoices page ${pageS} → ${r.data.length} records`
      );

      if (r.data.length < limit) break;
      pageS++;
    }

    // 4️⃣ BANK MAP
    const bankAccountMap = await getBankAccountMap(accessToken, businessId);

    // 5️⃣ LOOKUP MAPS
    const paymentMap = Object.fromEntries(payments.map((p) => [p.id, p]));
    const invoiceMap = Object.fromEntries(invoices.map((inv) => [inv.id, inv]));

    // 6️⃣ MERGE → TEMPLATE
    let result = allocations
      .map((a) => {
        const pay = paymentMap[a.paymentId];
        const inv = invoiceMap[a.invoiceId];
        if (!pay || !inv) return null;

        const invoiceNo =
          inv.formattedDocumentNumber ||
          inv.documentNumber ||
          `INV${inv.id}`;

        let exchangeRate = pay.exchangeRate;
        if (!exchangeRate || exchangeRate === 1) {
          exchangeRate = inv.exchangeRate;
        }

        return {
          Date: pay.date,
          InvoiceNo: invoiceNo,
          Amount: a.amount,
          Bank: bankAccountMap[pay.bankAccountId] || pay.bankAccountId || "",
          Reference: `Payment no. ${pay.id}`,
          ExchangeRate: exchangeRate || 1,
          bankCurrency: pay.currency || "",
        };
      })
      .filter(Boolean);

    if (startDate || endDate) {
      result = filterByDate(result, startDate, endDate, "Date");
    }

    res.json({
      success: true,
      total: result.length,
      allocationsCount: allocations.length,
      paymentsCount: payments.length,
      invoicesCount: invoices.length,
      data: result,
    });
  } catch (err) {
    handleClearbooksError("/invoice-payments", err, res);
  }
});

// 🧾 BILL PAYMENTS
router.get("/bill-payments", async (req, res) => {
  try {
    const { accessToken, businessId } = await loadAuth();
    const { startDate, endDate } = req.query;
    const limit = 200;

    let allocations = [];
    let payments = [];
    let purchases = [];

    console.log(
      "📤 Fetching bill payments (purchase allocations + payments + bills)..."
    );

    // 1️⃣ PURCHASE ALLOCATIONS
    let pageA = 1;
    while (true) {
      const r = await axios.get(
        "https://api.clearbooks.co.uk/v1/accounting/allocations/purchases",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            businessId,
            limit,
            page: pageA,
            allocationType: "payment",
          },
        }
      );

      if (!Array.isArray(r.data) || r.data.length === 0) break;

      const pageData = r.data.filter(
        (a) => !a.allocationType || a.allocationType === "payment"
      );

      allocations = allocations.concat(pageData);
      console.log(
        `📄 Purchase allocations page ${pageA} → ${pageData.length} records`
      );

      if (r.data.length < limit) break;
      pageA++;
    }

    // 2️⃣ PAYMENTS
    let pageP = 1;
    while (true) {
      const r = await axios.get(
        "https://api.clearbooks.co.uk/v1/accounting/payments",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { businessId, limit, page: pageP },
        }
      );

      if (!Array.isArray(r.data) || r.data.length === 0) break;

      payments = payments.concat(r.data);
      console.log(`📄 Payments page ${pageP} → ${r.data.length} records`);

      if (r.data.length < limit) break;
      pageP++;
    }

    // 3️⃣ PURCHASE BILLS
    const purchasesBaseUrl =
      "https://api.clearbooks.co.uk/v1/accounting/purchases/bills";
    let pageB = 1;
    while (true) {
      const r = await axios.get(purchasesBaseUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { businessId, limit, page: pageB },
      });

      if (!Array.isArray(r.data) || r.data.length === 0) break;

      purchases = purchases.concat(r.data);
      console.log(
        `📄 Purchase bills page ${pageB} → ${r.data.length} records`
      );

      if (r.data.length < limit) break;
      pageB++;
    }

    const bankAccountMap = await getBankAccountMap(accessToken, businessId);

    const paymentMap = Object.fromEntries(payments.map((p) => [p.id, p]));
    const purchaseMap = Object.fromEntries(
      purchases.map((pur) => [pur.id, pur])
    );

    let result = allocations
      .map((a) => {
        const pay = paymentMap[a.paymentId];
        const pur = purchaseMap[a.invoiceId];
        if (!pay || !pur) return null;

        const invoiceNo =
          pur.formattedDocumentNumber ||
          pur.documentNumber ||
          `PUR${pur.id}`;

        return {
          Date: pay.date,
          "Invoice No": invoiceNo,
          Amount: a.amount,
          Bank: bankAccountMap[pay.bankAccountId] || pay.bankAccountId || "",
          Reference: `Payment no. ${pay.id}`,
          CurrencyRate: pay.exchangeRate || 1,
          "bank currency": pay.currency || "",
        };
      })
      .filter(Boolean);

    if (startDate || endDate) {
      result = filterByDate(result, startDate, endDate, "Date");
    }

    res.json({
      success: true,
      total: result.length,
      allocationsCount: allocations.length,
      paymentsCount: payments.length,
      purchasesCount: purchases.length,
      data: result,
    });
  } catch (err) {
    handleClearbooksError("/bill-payments", err, res);
  }
});

// 📘 CHART OF ACCOUNTS
router.get("/accountCodes", async (req, res) => {
  try {
    const { accessToken, businessId } = await loadAuth();

    const baseUrl = `https://api.clearbooks.co.uk/v1/accounting/accountCodes`;
    let allData = [];
    let page = 1;
    const limit = 200;

    console.log("📤 Fetching all Account Codes pages...");

    while (true) {
      const params = {
        businessId,
        limit,
        page,
      };

      const response = await axios.get(baseUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params,
      });

      const data = response.data;
      if (!Array.isArray(data) || data.length === 0) break;

      allData = allData.concat(data);
      console.log(`📄 Page ${page} fetched (${data.length} account codes)`);

      if (data.length < limit) break;
      page++;
    }

    console.log(`✅ Total Account Codes fetched: ${allData.length}`);
    res.json({ success: true, total: allData.length, data: allData });
  } catch (err) {
    handleClearbooksError("/accountCodes", err, res);
  }
});

// 🧑‍💼 CUSTOMERS
router.get("/customers", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { accessToken, businessId } = await loadAuth();

    const baseUrl = `https://api.clearbooks.co.uk/v1/accounting/customers`;
    let allData = [];
    let page = 1;
    const limit = 200;

    console.log("📤 Fetching all customer pages...");
    if (startDate || endDate) {
      console.log(
        "⚠️ Note: ClearBooks API doesn't support date filtering for customers"
      );
    }

    while (true) {
      const params = {
        type: "customer",
        businessId,
        limit,
        page,
      };

      const response = await axios.get(baseUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params,
      });

      const data = response.data;
      if (!Array.isArray(data) || data.length === 0) break;

      allData = allData.concat(data);
      console.log(`📄 Page ${page} fetched (${data.length} customers)`);

      if (data.length < limit) break;
      page++;
    }

    console.log(`✅ Total customers fetched: ${allData.length}`);
    res.json({
      success: true,
      total: allData.length,
      data: allData,
    });
  } catch (err) {
    handleClearbooksError("/customers", err, res);
  }
});

// 🧾 SUPPLIERS
router.get("/suppliers", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { accessToken, businessId } = await loadAuth();

    const baseUrl = `https://api.clearbooks.co.uk/v1/accounting/suppliers`;
    let allData = [];
    let page = 1;
    const limit = 200;

    console.log("📤 Fetching all supplier pages...");
    if (startDate || endDate) {
      console.log(
        "⚠️ Note: ClearBooks API doesn't support date filtering for suppliers"
      );
    }

    while (true) {
      const params = {
        type: "supplier",
        businessId,
        limit,
        page,
      };

      const response = await axios.get(baseUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params,
      });

      const data = response.data;
      if (!Array.isArray(data) || data.length === 0) break;

      allData = allData.concat(data);
      console.log(`📄 Page ${page} fetched (${data.length} suppliers)`);

      if (data.length < limit) break;
      page++;
    }

    console.log(`✅ Total suppliers fetched: ${allData.length}`);
    res.json({
      success: true,
      total: allData.length,
      data: allData,
    });
  } catch (err) {
    handleClearbooksError("/suppliers", err, res);
  }
});

// 🏦 BANK ACCOUNTS
router.get("/bankAccounts", async (req, res) => {
  try {
    const { accessToken, businessId } = await loadAuth();

    const baseUrl =
      "https://api.clearbooks.co.uk/v1/accounting/bankAccounts";
    let allData = [];
    let page = 1;
    const limit = 200;

    console.log("📤 Fetching all bank accounts pages...");

    while (true) {
      const params = {
        businessId,
        limit,
        page,
      };

      const response = await axios.get(baseUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params,
      });

      const data = response.data;
      if (!Array.isArray(data) || data.length === 0) break;

      allData = allData.concat(data);
      console.log(`📄 Page ${page} fetched (${data.length} bank accounts)`);

      if (data.length < limit) break;
      page++;
    }

    res.json({ success: true, total: allData.length, data: allData });
  } catch (err) {
    handleClearbooksError("/bankAccounts", err, res);
  }
});

module.exports = router;
