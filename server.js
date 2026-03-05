/**
 * Server Entry Point
 * Initializes database connection and starts the Express server
 */
//
import app from "./src/app.js";
import { connectAllDatabases } from "./src/shared/infrastructure/database/connections.js";
import { seedAdminOnStartup } from "./src/shared/utils/seedAdmin.js";
import env from "./src/shared/infrastructure/config/env.js";
import {
  startWarrantyExpiryReminderScheduler,
  checkAndSendWarrantyReminders,
} from "./src/shared/common/schedulers/warrantyExpiryReminderScheduler.js";
import { startPostDeliveryFollowUpScheduler } from "./src/shared/common/schedulers/postDeliveryFollowUpScheduler.js";

// Import models to ensure registration on connection
import User from "./src/domains/laptops/auth/models/User.model.js";
import Product from "./src/domains/laptops/product/models/Product.model.js";
import Cart from "./src/domains/laptops/cart/models/Cart.model.js";
import Order from "./src/domains/laptops/order/models/Order.model.js";
import Category from "./src/domains/laptops/category/models/Category.model.js";

// Connect to databases
connectAllDatabases().then(() => {
  console.log("📦 Initializing models...");

  // Touch models to register them on the connection
  // Accessing modelName property triggers the Proxy getter which creates the model
  const models = [User, Product, Cart, Order, Category];
  models.forEach((model) => {
    try {
      if (model) void model.modelName;
    } catch (e) {
      console.warn("Model initialization warning:", e.message);
    }
  });

  // Auto-seed admin user after database connection
  seedAdminOnStartup();
});

// Start server
const PORT = env.port || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server running in ${env.nodeEnv} mode on port ${PORT}`);
  console.log(`🌐 Server URL: http://localhost:${PORT}`);
  console.log(`📋 Health Check: http://localhost:${PORT}/health`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
});

// Initialize Socket.io
import { initSocket } from "./src/shared/common/utils/socketService.js";
initSocket(server);

// ─── Start Schedulers ──────────────────────────────────────────────────────
startWarrantyExpiryReminderScheduler();
startPostDeliveryFollowUpScheduler();

// ─── TEMPORARY TEST ROUTE (remove after testing) ───────────────────────────
// Hit GET http://localhost:5000/api/test/trigger-warranty-check to run the
// warranty check immediately without waiting for 12 PM.
app.get("/api/test/trigger-warranty-check", async (req, res) => {
  try {
    await checkAndSendWarrantyReminders();
    res.json({
      success: true,
      message: "Warranty check triggered. Check server logs and your inbox.",
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// INCREASE TIMEOUT for slow uploads (5 minutes)
server.timeout = 300000;
server.keepAliveTimeout = 300000;
server.headersTimeout = 301000;

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Promise Rejection:", err);
  server.close(() => {
    process.exit(1);
  });
});

// Handle SIGTERM
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  server.close(() => {
    console.log("Process terminated");
  });
});
