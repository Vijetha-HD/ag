/**
 * Payment Controller (Laptops Domain)
 * Handles Razorpay payment integration
 */

// ── Warranty date helpers (mirrors order.controller.js) ──────────────────────
// Duration is stored as a Number (months). Converts safely.
const parseWarrantyMonths = (val) => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

// Returns a new Date that is `months` calendar months after `date`
const addWarrantyMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};
// ─────────────────────────────────────────────────────────────────────────────

import Razorpay from "razorpay";
import crypto from "crypto";
import Cart from "../../cart/models/Cart.model.js";
import Order from "../../order/models/Order.model.js";
import Transaction from "../models/Transaction.model.js";
import Product from "../../product/models/Product.model.js";
import {
  AppError,
  asyncHandler,
} from "../../../../shared/common/utils/errorHandler.js";
import { calculateOrderTotal } from "../../product/services/pricing.service.js";
import env from "../../../../shared/infrastructure/config/env.js";
import { sendOrderConfirmationEmail } from "../../../../shared/common/utils/emailService.js";
import { generateAndSaveInvoiceNumber } from "../../../../shared/common/utils/invoice.service.js";

let razorpay = null;

const getRazorpayInstance = () => {
  if (!razorpay) {
    if (!env.razorpay.keyId || !env.razorpay.keySecret) {
      console.error("Razorpay keys not configured");
      throw new AppError("Razorpay configuration missing", 500);
    }
    razorpay = new Razorpay({
      key_id: env.razorpay.keyId,
      key_secret: env.razorpay.keySecret,
    });
  }
  return razorpay;
};

/**
 * @route   POST /api/laptops/payment/create-order
 * @desc    Create Razorpay order based on cart total
 * @access  Private
 */
export const createRazorpayOrder = asyncHandler(async (req, res, next) => {
  const cart = await Cart.findOne({ userId: req.user._id }).populate(
    "items.productId",
  );

  if (!cart || !cart.items || cart.items.length === 0) {
    return next(new AppError("Cart is empty", 400));
  }

  const instance = getRazorpayInstance();

  // Verify stock and active status
  const productIds = cart.items.map((item) => item.productId._id);
  const products = await Product.find({
    _id: { $in: productIds },
    isActive: true,
  });

  if (products.length !== productIds.length) {
    return next(
      new AppError("One or more products not found or inactive", 404),
    );
  }

  // Recalculate total to be safe
  const orderItems = [];
  for (const cartItem of cart.items) {
    const product = products.find(
      (p) => p._id.toString() === cartItem.productId._id.toString(),
    );

    if (!product) {
      return next(
        new AppError(`Product ${cartItem.productId._id} not found`, 404),
      );
    }

    if (product.stock < cartItem.quantity) {
      return next(
        new AppError(
          `Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${cartItem.quantity}`,
          400,
        ),
      );
    }

    orderItems.push({
      productId: product._id,
      quantity: cartItem.quantity,
      priceAtPurchase: cartItem.unitPrice,
    });
  }

  const totalAmount = calculateOrderTotal(orderItems);

  // Create Razorpay Order
  const options = {
    amount: Math.round(totalAmount * 100), // amount in paise
    currency: "INR",
    receipt: `receipt_order_${Date.now()}`,
  };

  try {
    console.log("--- Razorpay Order Creation Debug ---");
    console.log(
      "Using Key ID:",
      env.razorpay.keyId
        ? env.razorpay.keyId.substring(0, 10) + "..."
        : "MISSING",
    );
    console.log("Order Amount:", options.amount);

    const order = await instance.orders.create(options);

    console.log("Razorpay Order Created:", order.id);

    // Log initial transaction
    await Transaction.create({
      userId: req.user._id,
      razorpayOrderId: order.id,
      amount: totalAmount,
      currency: "INR",
      status: "PENDING",
      paymentMethod: "RAZORPAY",
    });

    res.status(200).json({
      success: true,
      data: order,
      key: env.razorpay.keyId,
    });
  } catch (error) {
    console.error("Razorpay Order Create Error:", error);
    return next(new AppError("Failed to create payment order", 500));
  }
});

/**
 * @route   POST /api/laptops/payment/verify-payment
 * @desc    Verify payment signature and place order
 * @access  Private
 */
export const verifyPaymentAndPlaceOrder = asyncHandler(
  async (req, res, next) => {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      shippingAddress,
      billingAddress,
      contactEmail,
      contactPhone,
      notes,
    } = req.body;

    const generated_signature = crypto
      .createHmac("sha256", env.razorpay.keySecret)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      // Log failed transaction
      await Transaction.create({
        userId: req.user._id,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        amount: 0, // Amount might be unknown here or can be fetched
        status: "FAILED",
        paymentMethod: "RAZORPAY",
        errorDescription: "Signature verification failed",
      });
      return next(new AppError("Payment verification failed", 400));
    }

    // Payment is valid, now proceed to create the Order in DB
    const cart = await Cart.findOne({ userId: req.user._id }).populate(
      "items.productId",
    );

    if (!cart || !cart.items || cart.items.length === 0) {
      return next(new AppError("Cart is empty", 400));
    }

    const orderType = req.user.role === "B2B_BUYER" ? "B2B" : "B2C";
    const orderItems = [];
    const productIds = cart.items.map((item) => item.productId._id);

    const products = await Product.find({
      _id: { $in: productIds },
      isActive: true,
    });

    for (const cartItem of cart.items) {
      const product = products.find(
        (p) => p._id.toString() === cartItem.productId._id.toString(),
      );

      if (product) {
        // Compute warranty dates at purchase time
        const wStart = new Date();
        // 1. Try selected warranty duration from cart item
        let wMonths = parseWarrantyMonths(cartItem.selectedWarranty?.duration);
        // 2. Fall back to product's defaultWarranty (e.g. "12" or 12)
        if (!wMonths) wMonths = parseWarrantyMonths(product.defaultWarranty);
        // 3. Hard fallback: 12 months
        if (!wMonths) wMonths = 12;
        const wEnd = addWarrantyMonths(wStart, wMonths);

        orderItems.push({
          productId: product._id,
          quantity: cartItem.quantity,
          priceAtPurchase: cartItem.unitPrice,
          selectedWarranty: cartItem.selectedWarranty,
          selectedConfig: cartItem.selectedConfig,
          warrantyStartDate: wStart,
          warrantyEndDate: wEnd,
        });
        // Deduct stock IMMEDIATELY since payment is confirmed
        await Product.findByIdAndUpdate(product._id, {
          $inc: { stock: -cartItem.quantity, soldCount: cartItem.quantity },
        });
      }
    }

    const totalAmount = calculateOrderTotal(orderItems);
    const finalBillingAddress = billingAddress || shippingAddress;

    const order = await Order.create({
      userId: req.user._id,
      products: orderItems,
      orderType,
      status: "APPROVED", // Auto-approve since paid
      totalAmount,
      shippingAddress,
      billingAddress: finalBillingAddress,
      contactEmail,
      contactPhone,
      paymentMethod: "ONLINE", // Or RAZORPAY
      paymentStatus: "PAID",
      paymentDetails: {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      },
      notes: notes || "",
    });

    // Log successful transaction
    await Transaction.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        userId: req.user._id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        amount: totalAmount,
        status: "SUCCESS",
        orderId: order._id,
        paymentMethod: "RAZORPAY",
      },
      { upsert: true, new: true },
    );

    // Clear Cart
    cart.items = [];
    cart.totalAmount = 0;
    await cart.save();

    await order.populate("products.productId", "name description");

    // Generate Invoice Number
    try {
      await generateAndSaveInvoiceNumber(order);
    } catch (error) {
      console.error("Failed to generate invoice number:", error);
      // Don't block the response, just log it
    }

    // Send Order Confirmation Email
    try {
      await sendOrderConfirmationEmail(order);
    } catch (error) {
      console.error("Failed to send order confirmation email:", error);
      // Don't block the response, just log it
    }

    res.status(201).json({
      success: true,
      data: { order },
      message: "Payment successful and order placed",
    });
  },
);

//////

/**
 * @route   POST /api/laptops/payment/create-warranty-order
 * @desc    Create Razorpay order for warranty renewal payment
 * @body    { renewalPrice: Number }
 * @access  Private
 */
export const createWarrantyRazorpayOrder = asyncHandler(
  async (req, res, next) => {
    const { renewalPrice } = req.body;

    if (!renewalPrice || isNaN(renewalPrice) || Number(renewalPrice) <= 0) {
      return next(new AppError("Invalid renewal price", 400));
    }

    const instance = getRazorpayInstance();
    const amountInPaise = Math.round(Number(renewalPrice) * 100);

    const options = {
      amount: amountInPaise,
      currency: "INR",
      receipt: `warranty_renewal_${Date.now()}`,
    };

    try {
      const razorpayOrder = await instance.orders.create(options);

      // Log initial transaction
      await Transaction.create({
        userId: req.user._id,
        razorpayOrderId: razorpayOrder.id,
        amount: Number(renewalPrice),
        currency: "INR",
        status: "PENDING",
        paymentMethod: "RAZORPAY",
      });

      res.status(200).json({
        success: true,
        data: razorpayOrder,
        key: env.razorpay.keyId,
      });
    } catch (error) {
      console.error("Warranty Razorpay Order Create Error:", error);
      return next(new AppError("Failed to create warranty payment order", 500));
    }
  },
);

/**
 * @route   POST /api/laptops/payment/verify-warranty-payment
 * @desc    Verify warranty renewal payment and update warrantyEndDate on the order item
 * @body    {
 *   razorpay_order_id:   String,   // from Razorpay response
 *   razorpay_payment_id: String,   // from Razorpay response
 *   razorpay_signature:  String,   // from Razorpay response
 *   orderId:             String,   // original laptop purchase order _id
 *   productId:           String,   // product _id inside that order
 *   renewalPrice:        Number,   // price paid for renewal
 *   newWarrantyEndDate:  String,   // ISO date string: new expiry after renewal
 * }
 * @access  Private
 */
export const verifyWarrantyRenewalPayment = asyncHandler(
  async (req, res, next) => {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
      productId,
      renewalPrice,
      newWarrantyEndDate,
    } = req.body;

    // 1 — Verify HMAC signature (same as existing payment verification)
    const generated_signature = crypto
      .createHmac("sha256", env.razorpay.keySecret)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      await Transaction.create({
        userId: req.user._id,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        amount: Number(renewalPrice) || 0,
        status: "FAILED",
        paymentMethod: "RAZORPAY",
        errorDescription: "Signature verification failed",
      });
      return next(new AppError("Warranty payment verification failed", 400));
    }

    // 2 — Find the original order and update warrantyEndDate on the matching product item
    const order = await Order.findById(orderId);

    if (!order) {
      return next(new AppError("Original order not found", 404));
    }

    // Verify this order belongs to the requesting user
    const orderUserId = order.userId.toString();
    if (orderUserId !== req.user._id.toString()) {
      return next(new AppError("Not authorized to update this order", 403));
    }

    // Find the product item inside the order
    const productItem = order.products.find((p) => {
      const pid = p.productId?._id
        ? p.productId._id.toString()
        : p.productId.toString();
      return pid === productId.toString();
    });

    if (!productItem) {
      return next(new AppError("Product not found in this order", 404));
    }

    // Save the previous expiry BEFORE overwriting
    const previousWarrantyEndDate = productItem.warrantyEndDate
      ? new Date(productItem.warrantyEndDate)
      : null;

    // Update the warrantyEndDate to the new extended date
    productItem.warrantyEndDate = new Date(newWarrantyEndDate);
    await order.save();

    // 3 — Create a new WARRANTY_RENEWAL Order document so it appears in My Orders
    const renewalDuration = Number(req.body.renewalDuration) || 0;
    const productDoc = await Product.findById(productId).select("name").lean();
    try {
      await Order.create({
        userId: req.user._id,
        orderType: "WARRANTY_RENEWAL",
        status: "APPROVED",
        paymentStatus: "PAID",
        paymentMethod: "RAZORPAY",
        totalAmount: Number(renewalPrice),
        products: [],
        linkedOrderId: order._id,
        renewalMeta: {
          productId,
          productName: productDoc?.name || "Product",
          previousWarrantyEndDate,
          newWarrantyEndDate: new Date(newWarrantyEndDate),
          renewalDuration,
        },
        notes: `Warranty renewal for order ${order._id}`,
        contactEmail: req.user.email || "",
        contactPhone: req.user.phone || "",
      });
    } catch (renewalOrderErr) {
      // Non-fatal: log but don't fail the payment
      console.error(
        "Failed to create WARRANTY_RENEWAL order doc:",
        renewalOrderErr.message,
      );
    }

    // 3 — Log successful transaction
    await Transaction.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        userId: req.user._id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        amount: Number(renewalPrice),
        status: "SUCCESS",
        orderId: order._id,
        paymentMethod: "RAZORPAY",
      },
      { upsert: true, new: true },
    );

    res.status(200).json({
      success: true,
      data: {
        orderId: order._id,
        productId,
        newWarrantyEndDate: productItem.warrantyEndDate,
        razorpayPaymentId: razorpay_payment_id,
      },
      message:
        "Warranty renewal payment verified and warranty extended successfully",
    });
  },
);
