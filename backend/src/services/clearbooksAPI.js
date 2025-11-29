// const axios = require("axios");
// const fs = require("fs");
// const readline = require("readline");
// require("dotenv").config();

// let accessToken = null;
// let refreshToken = null;

// // 🔐 Load existing tokens
// if (fs.existsSync("tokens.json")) {
//   const tokenData = JSON.parse(fs.readFileSync("tokens.json", "utf8"));
//   accessToken = tokenData.access_token;
//   refreshToken = tokenData.refresh_token;
// } else {
//   console.warn("⚠️ tokens.json not found — please authorize again via /auth/connect");
// }

// let businessId = process.env.CLEARBOOKS_BUSINESS_ID || null;

// // 🌍 Axios setup
// const clearbooksAPI = axios.create({
//   baseURL: "https://api.clearbooks.co.uk/v1",
//   headers: { "Content-Type": "application/json" },
// });

// // 🔐 Attach access token dynamically
// clearbooksAPI.interceptors.request.use((config) => {
//   if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
//   if (businessId) config.headers["X-Company-Id"] = businessId;
//   return config;
// });

// // 🔁 Handle expired tokens (attempt refresh)
// clearbooksAPI.interceptors.response.use(
//   (response) => response,
//   async (error) => {
//     const status = error.response?.status;
//     if (status === 401 && refreshToken) {
//       console.log("🔁 Token expired. Refreshing...");
//       try {
//         const newTokenData = await refreshAccessToken();
//         accessToken = newTokenData.access_token;
//         refreshToken = newTokenData.refresh_token;

//         fs.writeFileSync("tokens.json", JSON.stringify(newTokenData, null, 2));
//         updateEnvFile("CLEARBOOKS_ACCESS_TOKEN", accessToken);
//         updateEnvFile("CLEARBOOKS_REFRESH_TOKEN", refreshToken);

//         console.log("✅ Token refreshed, retrying request...");
//         error.config.headers.Authorization = `Bearer ${accessToken}`;
//         return clearbooksAPI.request(error.config);
//       } catch (err) {
//         console.error("❌ Token refresh failed:", err.response?.data || err.message);
//       }
//     }
//     return Promise.reject(error);
//   }
// );

// // 🔄 Refresh access token
// async function refreshAccessToken() {
//   const clientId = process.env.CLIENT_ID || process.env.CLEARBOOKS_CLIENT_ID;
//   const clientSecret = process.env.CLIENT_SECRET || process.env.CLEARBOOKS_CLIENT_SECRET;

//   const params = new URLSearchParams({
//     grant_type: "refresh_token",
//     refresh_token: refreshToken,
//     client_id: clientId,
//     client_secret: clientSecret,
//   });

//   const response = await axios.post(
//     process.env.TOKEN_URL || "https://api.clearbooks.co.uk/oauth/token",
//     params.toString(),
//     { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
//   );

//   response.data.expires_at = Date.now() + response.data.expires_in * 1000;
//   return response.data;
// }

// // 🏢 Ensure business id
// async function ensureBusinessId() {
//   if (businessId) return businessId;

//   console.log("🔍 Fetching businesses...");
//   const res = await clearbooksAPI.get("/businesses");
//   const businesses = res.data;

//   if (!businesses || businesses.length === 0) throw new Error("⚠️ No businesses found");

//   businesses.forEach((b, i) => console.log(`${i + 1}. ${b.name} (${b.id})`));
//   const choice = await askQuestion("👉 Choose business number: ");
//   const selected = businesses[parseInt(choice) - 1];
//   if (!selected) throw new Error("❌ Invalid choice");

//   businessId = selected.id;
//   updateEnvFile("CLEARBOOKS_BUSINESS_ID", businessId);
//   console.log(`✅ Selected "${selected.name}" (${businessId})`);
//   return businessId;
// }

// // 🔧 Utilities
// function askQuestion(query) {
//   const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
//   return new Promise((resolve) => rl.question(query, (ans) => { rl.close(); resolve(ans); }));
// }

// function updateEnvFile(key, value) {
//   if (!fs.existsSync(".env")) {
//     fs.writeFileSync(".env", `${key}=${value}\n`);
//     return;
//   }
//   let env = fs.readFileSync(".env", "utf8").split(/\r?\n/);
//   let found = false;
//   env = env.map((line) => {
//     if (line.startsWith(`${key}=`)) { found = true; return `${key}=${value}`; }
//     return line;
//   });
//   if (!found) env.push(`${key}=${value}`);
//   fs.writeFileSync(".env", env.join("\n"));
// }

// // 🗓️ Date filtering helper - client side
// function filterByDate(records, startDate, endDate, dateField = 'date') {
//   if (!startDate && !endDate) return records;
  
//   return records.filter(record => {
//     if (!record[dateField]) return true; // Include if no date field
    
//     const recordDate = new Date(record[dateField]);
    
//     if (startDate && endDate) {
//       return recordDate >= new Date(startDate) && recordDate <= new Date(endDate);
//     } else if (startDate) {
//       return recordDate >= new Date(startDate);
//     } else if (endDate) {
//       return recordDate <= new Date(endDate);
//     }
    
//     return true;
//   });
// }

// // 📄 Robust paginator - NO DATE PARAMS (API doesn't support them)
// async function fetchAllPages(resourcePath, params = {}) {
//   const id = await ensureBusinessId();
//   let allData = [];
//   let page = 1;
//   const limit = 200;
//   let totalPages = null;

//   const primaryPath = resourcePath.startsWith("/") ? resourcePath : `/${resourcePath}`;
//   const fallbackPath = `/businesses/${id}${primaryPath}`;

//   let useFallback = false;

//   console.log(`📤 Starting to fetch: ${resourcePath}`);
  
//   // ⚠️ Extract and remove date params (not supported by API)
//   const { startDate, endDate, ...apiParams } = params;
  
//   if (startDate || endDate) {
//     console.log("⚠️ Note: Date filtering will be applied client-side (API doesn't support it)");
//     if (startDate) console.log(`📅 Start Date: ${startDate}`);
//     if (endDate) console.log(`📅 End Date: ${endDate}`);
//   }

//   while (true) {
//     const urlToCall = useFallback ? fallbackPath : primaryPath;
//     const query = { 
//       limit, 
//       page,
//       ...apiParams // Only pass non-date params to API
//     };

//     if (!useFallback) {
//       query.businessId = id;
//     }

//     console.log(`📤 Trying ${urlToCall} (page ${page})`);

//     let res;
//     try {
//       res = await clearbooksAPI.get(urlToCall, { params: query });
//     } catch (err) {
//       const status = err.response?.status;
//       if ((status === 404 || status === 400) && !useFallback) {
//         console.warn(`⚠️ Endpoint ${primaryPath} returned ${status}. Trying fallback ${fallbackPath}...`);
//         useFallback = true;
//         continue;
//       }
//       throw err;
//     }

//     const records = Array.isArray(res.data) ? res.data : res.data.data || [];
//     const headers = res.headers;

//     const headerLimit = parseInt(headers["x-pagination-limit"] || limit);
//     const headerPage = parseInt(headers["x-pagination-current-page"] || page);
//     totalPages = parseInt(headers["x-pagination-total-pages"] || totalPages || 1);

//     console.log(`📦 Page ${headerPage}/${totalPages} | ${records.length} records`);

//     if (records.length === 0) break;
//     allData = allData.concat(records);

//     if (headerPage >= totalPages) break;
//     if (records.length < limit) break;

//     page++;
//     await new Promise((r) => setTimeout(r, 250));
//   }

//   // ✅ Apply client-side date filtering if dates were provided
//   let filteredData = allData;
//   if (startDate || endDate) {
//     filteredData = filterByDate(allData, startDate, endDate, 'date');
//     console.log(`✅ Total fetched: ${allData.length} | After date filter: ${filteredData.length}`);
//   } else {
//     console.log(`✅ Total records: ${allData.length}`);
//   }

//   return filteredData;
// }

// // Sales (invoices, creditnotes) with client-side date filtering
// async function getSalesDocuments(salesType = "invoices", { startDate, endDate } = {}) {
//   return await fetchAllPages(`/accounting/sales/${salesType}`, { startDate, endDate });
// }

// // Purchases (bills, creditnotes) with client-side date filtering
// async function getPurchaseDocuments(purchaseType = "bills", { startDate, endDate } = {}) {
//   return await fetchAllPages(`/accounting/purchases/${purchaseType}`, { startDate, endDate });
// }

// // Payments (all) with client-side date filtering
// async function getPayments({ startDate, endDate } = {}) {
//   return await fetchAllPages(`/accounting/payments`, { startDate, endDate });
// }

// // Invoice payments (filter + date)
// async function getInvoicePayments({ startDate, endDate } = {}) {
//   const allPayments = await getPayments({ startDate, endDate });
//   const invoicePayments = allPayments.filter(
//     (p) => p.sales_invoice_id || p.type === "invoice" || p.paymentType === "sales"
//   );
//   console.log(`✅ Invoice payments filtered: ${invoicePayments.length}`);
//   return invoicePayments;
// }

// // Bill payments (filter + date)
// async function getBillPayments({ startDate, endDate } = {}) {
//   const allPayments = await getPayments({ startDate, endDate });
//   const billPayments = allPayments.filter(
//     (p) => p.purchase_bill_id || p.type === "bill" || p.paymentType === "purchase"
//   );
//   console.log(`✅ Bill payments filtered: ${billPayments.length}`);
//   return billPayments;
// }

// // Customers / Suppliers / Chart of accounts (NO date filtering supported)
// async function getAllCustomers(params = {}) {
//   // Remove date params - not supported by API
//   const { startDate, endDate, ...rest } = params;
//   if (startDate || endDate) {
//     console.log("⚠️ Note: ClearBooks API doesn't support date filtering for customers");
//   }
//   return await fetchAllPages("/accounting/customers", rest);
// }

// async function getAllSuppliers(params = {}) {
//   const { startDate, endDate, ...rest } = params;
//   if (startDate || endDate) {
//     console.log("⚠️ Note: ClearBooks API doesn't support date filtering for suppliers");
//   }
//   return await fetchAllPages("/accounting/suppliers", rest);
// }

// async function getChartOfAccounts(params = {}) {
//   const { startDate, endDate, ...rest } = params;
//   return await fetchAllPages("/accounting/accountCodes", rest);
// }

// async function getBankAccounts(params = {}) {
//   const { startDate, endDate, ...rest } = params;
//   return await fetchAllPages("/accounting/bankAccounts", rest);
// }

// module.exports = {
//   getBusinesses: ensureBusinessId,
//   getSalesDocuments,
//   getPurchaseDocuments,
//   getPayments,
//   getInvoicePayments,
//   getBillPayments,
//   getAllCustomers,
//   getAllSuppliers,
//   getChartOfAccounts,
//   getBankAccounts
// };

