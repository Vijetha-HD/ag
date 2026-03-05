/**
 * Express Application Setup
 * Main application configuration and middleware setup
 */
import express from "express";
import cors from "cors";
import helmet from "helmet";
import env from "./shared/infrastructure/config/env.js";
import { errorHandler } from "./shared/common/utils/errorHandler.js";
import { apiLimiter } from "./shared/common/middlewares/rateLimiter.middleware.js";

// Laptop routes
import laptopsAuthRoutes from "./domains/laptops/auth/routes/auth.routes.js";
import laptopsProductRoutes from "./domains/laptops/product/routes/product.routes.js";
import laptopsOrderRoutes from "./domains/laptops/order/routes/order.routes.js";
import laptopsCartRoutes from "./domains/laptops/cart/routes/cart.routes.js";
import laptopsCategoryRoutes from "./domains/laptops/category/routes/category.routes.js";
import laptopsUploadRoutes from "./domains/laptops/upload/routes/upload.routes.js";
import laptopsContactRoutes from "./domains/laptops/contact/routes/contact.routes.js";
import laptopsUserRoutes from "./domains/laptops/user/routes/user.routes.js";
import laptopsPaymentRoutes from "./domains/laptops/payment/routes/payment.routes.js";
import laptopsComplaintRoutes from "./domains/laptops/support/routes/complaint.routes.js";
import laptopsWarehouseRoutes from "./domains/laptops/warehouse/routes/warehouse.routes.js";
import laptopsShippingRoutes from "./domains/laptops/shipping/routes/shipping.routes.js";
import laptopsRefurbishmentRoutes from "./domains/laptops/refurbishment/routes/refurbishmentRequest.routes.js";
import laptopsDashboardRoutes from "./domains/laptops/dashboard/dashboard.routes.js";
import laptopsBrandRoutes from "./domains/laptops/brand/routes/brand.routes.js";
import laptopsSpecificationRoutes from "./domains/laptops/product/routes/specification.routes.js";
import laptopsBannerRoutes from "./domains/laptops/banner/routes/banner.routes.js";

const app = express();

/* ------------------ TRUST PROXY ------------------ */
app.set("trust proxy", 1);

/* ------------------ SECURITY ------------------ */
app.use(helmet());

/* ------------------ CORS CONFIG ------------------ */
const allowedOrigins = [
  ...(env.cors.origin || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),

  env.frontendUrl,
  env.storeUrl,
  env.laptopAdminUrl,

  // ✅ ADD THIS
  "https://admin.urbansystems.in",
].filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      // console.log(`[CORS DEBUG] Request Origin: ${origin}`);
      // console.log(`[CORS DEBUG] Allowed Origins: ${JSON.stringify(allowedOrigins)}`);

      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        // console.log(`[CORS DEBUG] Allowed origin: ${origin}`);
        return callback(null, true);
      }

      console.error(`[CORS ERROR] BLOCKED Origin: ${origin}`);
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Handle preflight
app.options("*", cors());

/* ------------------ BODY PARSING ------------------ */
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

/* ------------------ RATE LIMITER ------------------ */
app.use("/api", apiLimiter);

/* ------------------ HEALTH CHECK ------------------ */
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is runningggg",
    timestamp: new Date().toISOString(),
  });
});

// API routes
// ✅ Explicit domain-based paths only (no backward compatibility for security)
// This ensures clear domain separation and prevents cross-domain confusion

/* ------------------ LAPTOP ROUTES ------------------ */
app.use("/api/laptops/auth", laptopsAuthRoutes);
app.use("/api/laptops/products", laptopsProductRoutes);
app.use("/api/laptops/orders", laptopsOrderRoutes);
app.use("/api/laptops/cart", laptopsCartRoutes);
app.use("/api/laptops/categories", laptopsCategoryRoutes);
app.use("/api/laptops/upload", laptopsUploadRoutes);
app.use("/api/laptops/contact", laptopsContactRoutes);
app.use("/api/laptops/user", laptopsUserRoutes);
app.use("/api/laptops/payment", laptopsPaymentRoutes);
app.use("/api/laptops/support/complaints", laptopsComplaintRoutes);
app.use("/api/laptops/warehouses", laptopsWarehouseRoutes);
app.use("/api/laptops/shipping", laptopsShippingRoutes);
app.use("/api/laptops/refurbishment/requests", laptopsRefurbishmentRoutes);
app.use("/api/laptops/dashboard", laptopsDashboardRoutes);
app.use("/api/laptops/brands", laptopsBrandRoutes);
app.use("/api/laptops/specifications", laptopsSpecificationRoutes);
app.use("/api/laptops/banners", laptopsBannerRoutes);

/* ------------------ 404 HANDLER ------------------ */
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

/* ------------------ ERROR HANDLER ------------------ */
app.use(errorHandler);

export default app;
/////
