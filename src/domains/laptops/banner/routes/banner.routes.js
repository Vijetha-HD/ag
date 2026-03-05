/**
 * Banner Routes (Laptops Domain)
 * Endpoints for managing homepage carousel banners.
 */
import express from "express";
import { protect } from "../../../../shared/common/middlewares/auth.middleware.js";
import { restrictTo } from "../../../../shared/common/middlewares/role.middleware.js";
import {
  getBanners,
  addBanner,
  deleteBanner,
  replaceBanner,
  reorderBanners,
} from "../controllers/banner.controller.js";

const router = express.Router();

// ─── Public Routes ────────────────────────────────────────────────────────────

// GET /api/laptops/banners — fetch all active banners (used by home page)
router.get("/", getBanners);

// ─── Admin-Only Routes ────────────────────────────────────────────────────────

// POST /api/laptops/banners — add a new banner (body: { imageUrl, publicId })
router.post("/", protect, restrictTo("ADMIN"), addBanner);

// PATCH /api/laptops/banners/reorder — reorder banners (body: { banners: [{ id, order }] })
// NOTE: must be before /:id routes to avoid 'reorder' being treated as an id
router.patch("/reorder", protect, restrictTo("ADMIN"), reorderBanners);

// PUT /api/laptops/banners/:id — replace an existing banner image
router.put("/:id", protect, restrictTo("ADMIN"), replaceBanner);

// DELETE /api/laptops/banners/:id — delete a banner
router.delete("/:id", protect, restrictTo("ADMIN"), deleteBanner);

export default router;
