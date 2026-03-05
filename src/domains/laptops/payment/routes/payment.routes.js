/**
 * Payment Routes (Laptops Domain)
 */
import express from "express";
import {
  createRazorpayOrder,
  verifyPaymentAndPlaceOrder,
  createWarrantyRazorpayOrder,
  verifyWarrantyRenewalPayment,
} from "../controllers/payment.controller.js";
import { protect } from "../../../../shared/common/middlewares/auth.middleware.js";

const router = express.Router();

router.use(protect);

router.post("/create-order", createRazorpayOrder);
router.post("/verify-payment", verifyPaymentAndPlaceOrder);

// Warranty Renewal Payment Routes
router.post("/create-warranty-order", createWarrantyRazorpayOrder);
router.post("/verify-warranty-payment", verifyWarrantyRenewalPayment);

export default router;

////
