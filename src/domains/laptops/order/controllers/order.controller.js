/**
 * Order Controller (Laptops Domain)
 * Handles order creation and management with MOQ, bulk pricing, and delivery scheduling
 */
//

// ── Warranty date helpers ─────────────────────────────────────────────────────
// Duration is now stored as a plain Number (months).
// This wrapper keeps backward compat in case any old string slips through.
const parseMonthsFromString = (val) => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

// Returns a new Date that is `months` calendar months after `date`
const addMonthsToDate = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};
// ─────────────────────────────────────────────────────────────────────────────
import Order from "../models/Order.model.js";
import Product from "../../product/models/Product.model.js";
import User from "../../auth/models/User.model.js";
import {
  AppError,
  asyncHandler,
} from "../../../../shared/common/utils/errorHandler.js";
import {
  calculateUnitPrice,
  calculateOrderTotal,
} from "../../product/services/pricing.service.js";
import {
  generateAndSaveInvoiceNumber,
  formatInvoiceData,
} from "../../../../shared/common/utils/invoice.service.js";

/**
 * @route   POST /api/laptops/orders
 * @desc    Create a new order
 * @access  Private
 */
export const createOrder = asyncHandler(async (req, res, next) => {
  const { products, shippingAddress, paymentMethod, notes } = req.body;

  console.log("CREATE ORDER BODY:", JSON.stringify(req.body, null, 2));

  if (!products || products.length === 0) {
    return next(new AppError("No order items", 400));
  }

  const orderType = req.user.role === "B2B_BUYER" ? "B2B" : "B2C";

  const productIds = products.map((item) => item.productId);
  const fetchedProducts = await Product.find({
    _id: { $in: productIds },
    isActive: true,
  });

  if (fetchedProducts.length !== productIds.length) {
    return next(
      new AppError("One or more products not found or inactive", 404),
    );
  }

  const orderItems = [];

  for (const item of products) {
    const product = fetchedProducts.find(
      (p) => p._id.toString() === item.productId.toString(),
    );

    if (!product) {
      return next(new AppError(`Product ${item.productId} not found`, 404));
    }

    if (product.stock < item.quantity) {
      return next(
        new AppError(
          `Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`,
          400,
        ),
      );
    }

    let unitPrice = calculateUnitPrice(
      product.basePrice,
      item.quantity,
      req.user.role,
      product.b2bPrice || null,
      product.moq || 1,
      product.bulkPricing || [],
    );

    // Handle selected warranty
    let warrantyObj = { duration: 0, price: 0 };

    // Defensive check
    let warrantyKey = item.selectedWarranty;
    if (
      typeof item.selectedWarranty === "object" &&
      item.selectedWarranty !== null
    ) {
      warrantyKey = item.selectedWarranty.duration || item.selectedWarranty.id;
    }

    if (warrantyKey && warrantyKey !== "default" && warrantyKey !== "Default") {
      // Match by duration number
      const numKey = Number(warrantyKey);
      const warrantyOption = product.warrantyOptions.find(
        (w) => Number(w.duration) === numKey,
      );

      if (warrantyOption) {
        unitPrice += warrantyOption.price;
        warrantyObj = {
          duration: warrantyOption.duration,
          price: warrantyOption.price,
        };
      }
    }

    // Handle selected configuration variants (RAM/Storage)
    if (
      item.selectedConfig &&
      product.configurationVariants &&
      product.configurationVariants.length > 0
    ) {
      if (item.selectedConfig.ram) {
        const ramVariant = product.configurationVariants.find(
          (v) =>
            v.type === "RAM" &&
            v.value.trim().toLowerCase() ===
              item.selectedConfig.ram.trim().toLowerCase(),
        );
        if (ramVariant) {
          unitPrice += ramVariant.priceAdjustment;
        }
      }
      if (item.selectedConfig.storage) {
        const storageVariant = product.configurationVariants.find(
          (v) =>
            v.type === "STORAGE" &&
            v.value.trim().toLowerCase() ===
              item.selectedConfig.storage.trim().toLowerCase(),
        );
        if (storageVariant) {
          unitPrice += storageVariant.priceAdjustment;
        }
      }
    }

    // Calculate warranty dates at purchase time
    const wStart = new Date();
    // 1. Use selected warranty duration (add-on)
    let wMonths = parseMonthsFromString(warrantyObj.duration);
    // 2. Fall back to product's defaultWarranty (e.g. "12" or 12)
    if (!wMonths) wMonths = parseMonthsFromString(product.defaultWarranty);
    // 3. Hard fallback: 12 months
    if (!wMonths) wMonths = 12;
    const wEnd = addMonthsToDate(wStart, wMonths);

    orderItems.push({
      productId: product._id,
      quantity: item.quantity,
      priceAtPurchase: unitPrice,
      selectedWarranty: warrantyObj,
      selectedConfig: item.selectedConfig || {},
      warrantyStartDate: wStart,
      warrantyEndDate: wEnd,
    });
  }

  const totalAmount = calculateOrderTotal(orderItems);
  const defaultStatus = orderType === "B2C" ? "APPROVED" : "PENDING";

  const order = await Order.create({
    userId: req.user._id,
    products: orderItems,
    orderType,
    status: defaultStatus,
    totalAmount,
    notes: notes || "",
  });

  if (defaultStatus === "APPROVED") {
    for (const item of orderItems) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: {
          stock: -item.quantity,
          soldCount: item.quantity, // Increment sold count
        },
      });
    }
  }

  await order.populate("products.productId", "name description");

  res.status(201).json({
    success: true,
    data: {
      order,
    },
  });
});

/**
 * @route   GET /api/laptops/orders
 * @desc    Get user's orders
 * @access  Private
 */
export const getOrders = asyncHandler(async (req, res, next) => {
  console.log("inside get orders");

  const {
    status,
    orderType,
    page = 1,
    limit = 10,
    startDate,
    endDate,
    userId,
  } = req.query;
  console.log("status", status);
  console.log("orderType", orderType);

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  let query = {};

  // If user is a buyer, restrict to their own orders
  if (req.user.role === "B2C_BUYER" || req.user.role === "B2B_BUYER") {
    query.userId = req.user._id;
  } else if (userId) {
    query.userId = userId;
  }

  if (status) {
    query.status = status;
  }
  if (orderType) {
    query.orderType = orderType;
  }

  // Filter by Date Range
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      query.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      // Set end date to end of the day
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  const orders = await Order.find(query)
    .populate(
      "products.productId",
      "name description images brand specifications warrantyRenewalOptions",
    )
    .populate("userId", "name email companyName")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum);

  const total = await Order.countDocuments(query);

  res.status(200).json({
    success: true,
    count: orders.length,
    pagination: {
      total,
      pages: Math.ceil(total / limitNum),
      page: pageNum,
      limit: limitNum,
    },
    data: {
      orders,
    },
  });
});

/**
 * @route   GET /api/laptops/orders/:id
 * @desc    Get single order
 * @access  Private
 */
export const getOrder = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id)
    .populate(
      "products.productId",
      "name description basePrice moq images brand specifications warrantyRenewalOptions",
    )
    .populate("userId", "name email companyName");

  if (!order) {
    return next(new AppError("Order not found", 404));
  }

  const orderUserId = order.userId._id
    ? order.userId._id.toString()
    : order.userId.toString();
  if (
    orderUserId !== req.user._id.toString() &&
    req.user.role !== "ADMIN" &&
    req.user.role !== "SELLER"
  ) {
    return next(new AppError("Not authorized to view this order", 403));
  }

  res.status(200).json({
    success: true,
    data: {
      order,
    },
  });
});

/**
 * @route   PUT /api/laptops/orders/:id/approve
 * @desc    Approve an order (Seller/Admin only)
 * @access  Private (Seller/Admin only)
 */
export const approveOrder = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id).populate(
    "products.productId",
  );

  if (!order) {
    return next(new AppError("Order not found", 404));
  }

  if (order.status !== "PENDING") {
    return next(
      new AppError(`Cannot approve order with status: ${order.status}`, 400),
    );
  }

  for (const item of order.products) {
    const product = item.productId;
    if (product.stock < item.quantity) {
      return next(
        new AppError(
          `Insufficient stock for ${product.name}. Available: ${product.stock}, Required: ${item.quantity}`,
          400,
        ),
      );
    }
  }

  order.status = "APPROVED";
  await order.save();

  for (const item of order.products) {
    const productId = item.productId._id || item.productId;
    await Product.findByIdAndUpdate(productId, {
      $inc: {
        stock: -item.quantity,
        soldCount: item.quantity, // Increment sold count
      },
    });
  }

  res.status(200).json({
    success: true,
    data: {
      order,
    },
    message: "Order approved successfully. Stock has been deducted.",
  });
});

/**
 * @route   PUT /api/laptops/orders/:id/status
 * @desc    Update order status (Seller/Admin only)
 * @access  Private (Seller/Admin only)
 */
export const updateOrderStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.body;
  const validStatuses = ["PENDING", "APPROVED", "SHIPPED", "CANCELLED"];

  if (!status || !validStatuses.includes(status)) {
    return next(
      new AppError(
        `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        400,
      ),
    );
  }

  const order = await Order.findById(req.params.id);

  if (!order) {
    return next(new AppError("Order not found", 404));
  }

  if (order.status === "CANCELLED") {
    return next(new AppError("Cannot change status of cancelled order", 400));
  }

  order.status = status;

  // Track delivery time for follow-ups
  if (status === "DELIVERED" && !order.deliveredAt) {
    order.deliveredAt = new Date();
  } else if (status !== "DELIVERED") {
    // Optional: Reset if status is rolled back, but usually risky.
    // Let's keep it simple: only set if unset.
    // If we want to allow re-delivery updates:
    if (status === "DELIVERED") {
      order.deliveredAt = new Date();
    }
  }

  await order.save();

  res.status(200).json({
    success: true,
    data: {
      order,
    },
    message: "Order status updated successfully",
  });
});

/**
 * @route   PUT /api/laptops/orders/:id/payment-status
 * @desc    Update payment status and generate invoice if paid (Seller/Admin only)
 * @access  Private (Seller/Admin only)
 */
export const updatePaymentStatus = asyncHandler(async (req, res, next) => {
  const { paymentStatus } = req.body;
  const validStatuses = ["PENDING", "PAID", "FAILED", "REFUNDED"];

  if (!paymentStatus || !validStatuses.includes(paymentStatus)) {
    return next(
      new AppError(
        `Invalid payment status. Must be one of: ${validStatuses.join(", ")}`,
        400,
      ),
    );
  }

  const order = await Order.findById(req.params.id)
    .populate(
      "products.productId",
      "name description images brand specifications",
    )
    .populate("userId", "name email companyName");

  if (!order) {
    return next(new AppError("Order not found", 404));
  }

  const oldPaymentStatus = order.paymentStatus;
  order.paymentStatus = paymentStatus;

  // Generate invoice number when payment status changes to PAID
  if (paymentStatus === "PAID" && oldPaymentStatus !== "PAID") {
    try {
      await generateAndSaveInvoiceNumber(order);
    } catch (error) {
      console.error("Error generating invoice number:", error);
      // Continue with payment status update even if invoice generation fails
    }
  }

  await order.save();

  res.status(200).json({
    success: true,
    data: {
      order,
    },
    message:
      paymentStatus === "PAID" && !oldPaymentStatus
        ? "Payment status updated and invoice generated successfully"
        : "Payment status updated successfully",
  });
});

/**
 * @route   GET /api/laptops/orders/:id/invoice
 * @desc    Get invoice data for an order
 * @access  Private
 */
export const getInvoice = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id)
    .populate(
      "products.productId",
      "name description images brand specifications",
    )
    .populate("userId", "name email companyName gstNumber businessAddress");

  if (!order) {
    return next(new AppError("Order not found", 404));
  }

  // Check authorization
  const orderUserId = order.userId._id
    ? order.userId._id.toString()
    : order.userId.toString();
  if (
    orderUserId !== req.user._id.toString() &&
    req.user.role !== "ADMIN" &&
    req.user.role !== "SELLER"
  ) {
    return next(new AppError("Not authorized to view this invoice", 403));
  }

  // Check if order is paid
  if (order.paymentStatus !== "PAID") {
    return next(
      new AppError("Invoice can only be generated for paid orders", 400),
    );
  }

  // Generate invoice number if it doesn't exist
  if (!order.invoiceNumber) {
    try {
      await generateAndSaveInvoiceNumber(order);
      // Refresh order data
      await order.populate(
        "products.productId",
        "name description images brand specifications",
      );
      await order.populate(
        "userId",
        "name email companyName gstNumber businessAddress",
      );
    } catch (error) {
      console.error("Error generating invoice number:", error);
      return next(new AppError("Failed to generate invoice number", 500));
    }
  }

  // Format invoice data
  const invoiceData = formatInvoiceData(order, order.userId);

  res.status(200).json({
    success: true,
    data: {
      invoice: invoiceData,
      order: {
        _id: order._id,
        orderType: order.orderType,
        status: order.status,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        createdAt: order.createdAt,
      },
    },
  });
});
