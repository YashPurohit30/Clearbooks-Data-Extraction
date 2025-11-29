const express = require("express");
const axios = require("axios");
const fs = require("fs");
const router = express.Router();
// const { getBusinesses } = require("../services/clearbooksAPI");
  
// 🏢 Get businesses
router.get("/businesses", async (req, res) => {
  try {
    const data = await getBusinesses();
    res.json({ success: true, data });
  } catch (err) {
    console.error("❌ /businesses error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ⚙️ Common function to load credentials
function loadAuth() {
  if (!fs.existsSync("tokens.json")) throw new Error("tokens.json not found");

  const tokens = JSON.parse(fs.readFileSync("tokens.json"));

  const accessToken = tokens.access_token;
  const businessId = tokens.business_id || process.env.CLEARBOOKS_BUSINESS_ID;

  if (!accessToken || !businessId) {
    throw new Error("Missing access token or business ID");
  }

  return { accessToken, businessId };
}

// 🗓️ Date filtering helper function
function filterByDate(records, startDate, endDate, dateField = 'date') {
  if (!startDate && !endDate) return records;
  
  return records.filter(record => {
    const recordDate = new Date(record[dateField]);
    
    if (startDate && endDate) {
      return recordDate >= new Date(startDate) && recordDate <= new Date(endDate);
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

  // id -> code map (yahan se 1 -> 7502001 banaenge)
  const map = {};
  for (const b of all) {
    // ClearBooks structure ke hisab se possible fields check kar rahe hain
    const code =
      b.accountCode ||   // most likely
      b.nominalCode ||
      b.code ||
      b.accountNumber || // worst fallback
      b.id;              // final fallback: just id

    map[b.id] = code;
  }

  return map;
}


// 📦 SALES (Invoices, Credit Notes, etc.)
router.get("/sales/:salesType", async (req, res) => {
  try {
    const { salesType } = req.params;
    const { startDate, endDate } = req.query;
    const { accessToken, businessId } = loadAuth();

    const baseUrl = `https://api.clearbooks.co.uk/v1/accounting/sales/${salesType}`;
    let allData = [];
    let page = 1;
    const limit = 200;

    console.log(`📤 Fetching all sales pages for: ${salesType}...`);
    if (startDate) console.log(`📅 Start Date: ${startDate}`);
    if (endDate) console.log(`📅 End Date: ${endDate}`);

    // ✅ Fetch all data first (API doesn't support date filters)
    while (true) {
      const params = { 
        businessId,
        limit, 
        page 
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

    // ✅ Apply date filtering on client side
    const filteredData = filterByDate(allData, startDate, endDate, 'date');
    
    console.log(`✅ Total records fetched: ${allData.length}`);
    console.log(`✅ After date filter: ${filteredData.length}`);
    
    res.json({ 
      success: true, 
      total: filteredData.length,
      totalFetched: allData.length,
      filtered: startDate || endDate ? true : false,
      data: filteredData 
    });

  } catch (err) {
    console.error("❌ /sales error:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.error || err.message,
      error: err.response?.data,
    });
  }
});


// 🧾 PURCHASES (Bills, Credit Notes, etc.)
router.get("/purchases/:purchaseType", async (req, res) => {
  try {
    const { purchaseType } = req.params;
    const { startDate, endDate } = req.query;
    const { accessToken, businessId } = loadAuth();

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
        page 
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

    // ✅ Apply date filtering on client side
    const filteredData = filterByDate(allData, startDate, endDate, 'date');
    
    console.log(`✅ Total records fetched: ${allData.length}`);
    console.log(`✅ After date filter: ${filteredData.length}`);

    res.json({ 
      success: true, 
      total: filteredData.length,
      totalFetched: allData.length,
      filtered: startDate || endDate ? true : false,
      data: filteredData 
    });

  } catch (err) {
    console.error("❌ /purchases error:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.error || err.message,
      error: err.response?.data,
    });
  }
});


// 💳 PAYMENTS (fetch all pages + client-side date filter)
router.get("/payments", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { accessToken, businessId } = loadAuth();

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
        page 
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

    // ✅ Apply date filtering on client side (use 'date' or 'accountingDate')
    const filteredPayments = filterByDate(allPayments, startDate, endDate, 'date');

    console.log(`✅ Total payments fetched: ${allPayments.length}`);
    console.log(`✅ After date filter: ${filteredPayments.length}`);

    res.json({ 
      success: true, 
      total: filteredPayments.length,
      totalFetched: allPayments.length,
      filtered: startDate || endDate ? true : false,
      data: filteredPayments 
    });
  } catch (err) {
    console.error("❌ /payments error:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.error || err.message,
      error: err.response?.data,
    });
  }
});




// 🔗 PAYMENT ALLOCATIONS (fetch all pages)
router.get("/payment-allocations", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { accessToken, businessId } = loadAuth();

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

    // Apply date filter
    const filteredData = filterByDate(allocations, startDate, endDate, "date");

    console.log(`✅ Total fetched: ${allocations.length}`);
    console.log(`🎯 After filter: ${filteredData.length}`);

    res.json({
      success: true,
      totalFetched: allocations.length,
      total: filteredData.length,
      filtered: startDate || endDate ? true : false,
      data: filteredData,
    });

  } catch (err) {
    console.error("❌ /payment-allocations error:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.error || err.message,
      error: err.response?.data,
    });
  }
});





router.get("/invoice-payments", async (req, res) => {
  try {
    const { accessToken, businessId } = loadAuth();
    const { startDate, endDate } = req.query;
    const limit = 200;

    let allocations = [];
    let payments = [];
    let invoices = [];

    console.log("📤 Fetching invoice payments (sales allocations + payments + invoices)...");
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
      console.log(`📄 Sales allocations page ${pageA} → ${pageData.length} records`);

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
    const salesBaseUrl = "https://api.clearbooks.co.uk/v1/accounting/sales/invoices";
    let pageS = 1;
    while (true) {
      const r = await axios.get(salesBaseUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { businessId, limit, page: pageS },
      });

      if (!Array.isArray(r.data) || r.data.length === 0) break;

      invoices = invoices.concat(r.data);
      console.log(`📄 Sales invoices page ${pageS} → ${r.data.length} records`);

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

        // 👇 EXCHANGE RATE LOGIC
        let exchangeRate = pay.exchangeRate;
        // agar payment ka rate missing / 0 / 1 hai to invoice se le lo
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

    // 7️⃣ OPTIONAL DATE FILTER
    if (startDate || endDate) {
      result = filterByDate(result, startDate, endDate, "Date");
    }

    // 8️⃣ RESPONSE
    res.json({
      success: true,
      total: result.length,
      allocationsCount: allocations.length,
      paymentsCount: payments.length,
      invoicesCount: invoices.length,
      data: result,
    });
  } catch (err) {
    console.error("❌ /invoice-payments error:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.error || err.message,
      error: err.response?.data,
    });
  }
});




router.get("/bill-payments", async (req, res) => {
  try {
    const { accessToken, businessId } = loadAuth();
    const { startDate, endDate } = req.query;
    const limit = 200;

    let allocations = [];
    let payments = [];
    let purchases = [];

    console.log("📤 Fetching bill payments (purchase allocations + payments + bills)...");

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
      console.log(`📄 Purchase allocations page ${pageA} → ${pageData.length} records`);

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

    // 3️⃣ PURCHASE BILLS (for PUR000110 etc.)
    const purchasesBaseUrl = "https://api.clearbooks.co.uk/v1/accounting/purchases/bills";
    let pageB = 1;
    while (true) {
      const r = await axios.get(purchasesBaseUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { businessId, limit, page: pageB },
      });

      if (!Array.isArray(r.data) || r.data.length === 0) break;

      purchases = purchases.concat(r.data);
      console.log(`📄 Purchase bills page ${pageB} → ${r.data.length} records`);

      if (r.data.length < limit) break;
      pageB++;
    }

    const bankAccountMap = await getBankAccountMap(accessToken, businessId);

    // 4️⃣ LOOKUP MAPS
    const paymentMap = Object.fromEntries(payments.map((p) => [p.id, p]));
    const purchaseMap = Object.fromEntries(purchases.map((pur) => [pur.id, pur]));

    // 5️⃣ MERGE → TEMPLATE (tumhara PUR template)
    let result = allocations
      .map((a) => {
        const pay = paymentMap[a.paymentId];
        const pur = purchaseMap[a.invoiceId];   // purchases allocation me invoiceId == bill id
        if (!pay || !pur) return null;

        const invoiceNo =
          pur.formattedDocumentNumber ||    // 👈 jo tumne screenshot me dikhaya
          pur.documentNumber ||
          `PUR${pur.id}`;

        return {
          Date: pay.date,
          "Invoice No": invoiceNo,                 // e.g. PUR000110
          Amount: a.amount,
            // ⬇️ yahi important line
            Bank: bankAccountMap[pay.bankAccountId] || pay.bankAccountId || "",
          Reference: `Payment no. ${pay.id}`,
          CurrencyRate: pay.exchangeRate || 1,
          "bank currency": pay.currency || "",
        };
      })
      .filter(Boolean);

    // 6️⃣ DATE FILTER (BY PAYMENT DATE)
    if (startDate || endDate) {
      result = filterByDate(result, startDate, endDate, "Date");
    }

    // 7️⃣ RESPONSE
    res.json({
      success: true,
      total: result.length,
      allocationsCount: allocations.length,
      paymentsCount: payments.length,
      purchasesCount: purchases.length,
      data: result,
    });
  } catch (err) {
    console.error("ERROR /bill-payments:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.error || err.message,
      error: err.response?.data,
    });
  }
});


// 📘 CHART OF ACCOUNTS (no date filter)
router.get("/accountCodes", async (req, res) => {
  try {
    const { accessToken, businessId } = loadAuth();

    const baseUrl = `https://api.clearbooks.co.uk/v1/accounting/accountCodes`;
    let allData = [];
    let page = 1;
    const limit = 200;

    console.log("📤 Fetching all Account Codes pages...");

    while (true) {
      const params = { 
        businessId,
        limit, 
        page 
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
    console.error("❌ /accountCodes error:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.error || err.message,
      error: err.response?.data,
    });
  }
});







router.get("/customers", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { accessToken, businessId } = loadAuth();

    const baseUrl = `https://api.clearbooks.co.uk/v1/accounting/customers`;
    let allData = [];
    let page = 1;
    const limit = 200;

    console.log("📤 Fetching all customer pages...");
    if (startDate || endDate) {
      console.log("⚠️ Note: ClearBooks API doesn't support date filtering for customers");
    }

    while (true) {
      const params = { 
        type: 'customer',
        businessId,
        limit, 
        page 
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
      data: allData 
    });

  } catch (err) {
    console.error("❌ /customers error:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.error || err.message,
      error: err.response?.data,
    });
  }
});

// 🧾 SUPPLIERS (no date filter in API - returns all)
router.get("/suppliers", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { accessToken, businessId } = loadAuth();

    const baseUrl = `https://api.clearbooks.co.uk/v1/accounting/suppliers`;
    let allData = [];
    let page = 1;
    const limit = 200;

    console.log("📤 Fetching all supplier pages...");
    if (startDate || endDate) {
      console.log("⚠️ Note: ClearBooks API doesn't support date filtering for suppliers");
    }

    while (true) {
      const params = { 
        type: 'supplier',
        businessId,
        limit, 
        page 
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
      data: allData 
    });

  } catch (err) {
    console.error("❌ /suppliers error:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.error || err.message,
      error: err.response?.data,
    });
  }
});


// 📘 CHART OF ACCOUNTS (no date filter)
router.get("/accountCodes", async (req, res) => {
  try {
    const { accessToken, businessId } = loadAuth();

    const baseUrl = `https://api.clearbooks.co.uk/v1/accounting/accountCodes`;
    let allData = [];
    let page = 1;
    const limit = 200;

    console.log("📤 Fetching all Account Codes pages...");

    while (true) {
      const params = { 
        businessId,
        limit, 
        page 
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
    console.error("❌ /accountCodes error:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.error || err.message,
      error: err.response?.data,
    });
  }
});

// 🏦 BANK ACCOUNTS (no date filter)
router.get("/bankAccounts", async (req, res) => {
  try {
    const { accessToken, businessId } = loadAuth();

    const baseUrl = "https://api.clearbooks.co.uk/v1/accounting/bankAccounts";
    let allData = [];
    let page = 1;
    const limit = 200;

    console.log("📤 Fetching all bank accounts pages...");

    while (true) {
      const params = { 
        businessId, 
        limit, 
        page 
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
    console.error("❌ /bankAccounts error:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.error || err.message,
      error: err.response?.data,
    });
  }
});

module.exports = router;