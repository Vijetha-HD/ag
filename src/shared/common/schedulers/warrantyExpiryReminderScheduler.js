/**
 * Warranty Expiry Reminder Scheduler
 *
 * Runs every day at 12:00 PM (noon).
 * Finds all DELIVERED, non-WARRANTY_RENEWAL orders where a product's
 * warrantyEndDate is exactly 15 days from today AND that product has
 * warrantyRenewalOptions configured.
 * Sends a reminder EMAIL + WHATSAPP ONCE per order+product — tracked by
 * warrantyReminderSent (email) and warrantyWhatsAppSent (WhatsApp) DB flags.
 */
import cron from "node-cron";
import env from "../../infrastructure/config/env.js";
import { sendWarrantyExpiryReminderEmail } from "../utils/emailService.js";
import { sendWhatsApp } from "../utils/smsService.js";

/**
 * In-memory Set to track which (orderId_productId) pairs have already
 * been sent a reminder in this server session. Prevents duplicate emails
 * when the scheduler runs multiple times (e.g. during testing).
 */
const sentReminderKeys = new Set();

/**
 * Core logic — extracted so it can also be called from a test route immediately.
 */
export const checkAndSendWarrantyReminders = async () => {
  console.log(
    "[WarrantyExpiryReminder] Running daily warranty expiry check...",
  );

  try {
    // Dynamically import to avoid circular-dependency issues at startup
    const Order = (
      await import("../../../domains/laptops/order/models/Order.model.js")
    ).default;

    // Build the 15-day window:
    //   windowStart = start of (today + 15 days)  00:00:00
    //   windowEnd   = end   of (today + 15 days)  23:59:59
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() + 15);
    windowStart.setHours(0, 0, 0, 0);

    const windowEnd = new Date(windowStart);
    windowEnd.setHours(23, 59, 59, 999);

    // Find all DELIVERED product orders (exclude warranty renewal orders themselves)
    const orders = await Order.find({
      orderType: { $ne: "WARRANTY_RENEWAL" },
      status: "DELIVERED",
      "products.warrantyEndDate": {
        $gte: windowStart,
        $lte: windowEnd,
      },
      "products.warrantyReminderSent": { $ne: true },
    })
      .populate("userId", "name email")
      .populate("products.productId", "name warrantyRenewalOptions");

    if (!orders || orders.length === 0) {
      console.log(
        "[WarrantyExpiryReminder] No warranties expiring in 15 days. Done.",
      );
      return;
    }

    let emailsSent = 0;

    for (const order of orders) {
      const user = order.userId;
      if (!user || !user.email) continue;

      let orderUpdated = false;
      const userEmail = order.contactEmail || user.email;
      const userName =
        order.shippingAddress?.fullName || user.name || "Customer";

      for (const item of order.products) {
        // Only process items whose warrantyEndDate falls in our 15-day window
        if (!item.warrantyEndDate) continue;

        const endDate = new Date(item.warrantyEndDate);
        if (endDate < windowStart || endDate > windowEnd) continue;

        const product = item.productId;
        if (!product) continue;

        // ✅ Skip entirely only if BOTH email AND WhatsApp have already been sent
        if (item.warrantyReminderSent && item.warrantyWhatsAppSent) continue;

        // ✅ KEY RULE: Only send if the product has renewal options configured
        const renewalOptions = product.warrantyRenewalOptions;
        if (!renewalOptions || renewalOptions.length === 0) {
          console.log(
            `[WarrantyExpiryReminder] Skipping "${product.name}" — no renewal options configured.`,
          );
          continue;
        }

        // ✅ DUPLICATE GUARD: Skip if already sent for this order+product in this session
        const reminderKey = `${order._id}_${product._id}`;
        if (sentReminderKeys.has(reminderKey)) {
          console.log(
            `[WarrantyExpiryReminder] Already sent for this order+product. Skipping.`,
          );
          continue;
        }

        // Build the renewal link → /warranty-renewal/:orderId/:productId
        const renewalLink = `${env.storeUrl}/warranty-renewal/${order._id}/${product._id}`;

        // Format dates for display
        const purchaseDate = item.warrantyStartDate
          ? new Date(item.warrantyStartDate).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })
          : new Date(order.createdAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
            });

        const warrantyExpiryDate = endDate.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });

        // ── 1. SEND EMAIL (once) ────────────────────────────────────────────────
        if (!item.warrantyReminderSent) {
          try {
            await sendWarrantyExpiryReminderEmail({
              userEmail,
              userName,
              productName: product.name,
              purchaseDate,
              warrantyExpiryDate,
              renewalLink,
              renewalOptions,
            });

            // Mark email as sent in DB — will never be sent again
            item.warrantyReminderSent = true;
            orderUpdated = true;
            sentReminderKeys.add(reminderKey);
            emailsSent++;

            console.log(
              `[WarrantyExpiryReminder] ✅ Email sent to ${userEmail} for: ${product.name}`,
            );
          } catch (emailError) {
            console.error(
              `[WarrantyExpiryReminder] ❌ Email failed for ${userEmail}:`,
              emailError.message,
            );
          }
        } else {
          console.log(
            `[WarrantyExpiryReminder] Email already sent for ${product.name}. Skipping.`,
          );
        }

        // ── 2. SEND WHATSAPP (once) ─────────────────────────────────────────────
        if (!item.warrantyWhatsAppSent) {
          // Resolve phone: prefer contactPhone on order, fallback to shipping address
          const userPhone = order.contactPhone || order.shippingAddress?.phone;

          if (userPhone) {
            try {
              const waMessage =
                `Hi ${userName}! 🔔 Your warranty for *${product.name}* is expiring on *${warrantyExpiryDate}*.\n\n` +
                `Renew now to stay protected 👇\n${renewalLink}\n\n` +
                `For support, contact: btxinwardoutward@gmail.com`;

              await sendWhatsApp(userPhone, waMessage);

              // Mark WhatsApp as sent in DB — will never be sent again
              item.warrantyWhatsAppSent = true;
              orderUpdated = true;

              console.log(
                `[WarrantyExpiryReminder] ✅ WhatsApp sent to ${userPhone} for: ${product.name}`,
              );
            } catch (waError) {
              console.error(
                `[WarrantyExpiryReminder] ❌ WhatsApp failed for ${userPhone}:`,
                waError.message,
              );
            }
          } else {
            console.warn(
              `[WarrantyExpiryReminder] ⚠️ No phone found for order ${order._id}. WhatsApp skipped.`,
            );
          }
        } else {
          console.log(
            `[WarrantyExpiryReminder] WhatsApp already sent for ${product.name}. Skipping.`,
          );
        }
      }

      // Save order if any product's warranty reminder flag was updated
      if (orderUpdated) {
        await order.save();
      }
    }

    console.log(
      `[WarrantyExpiryReminder] Done. Total emails sent: ${emailsSent}`,
    );
    console.log(
      `[WarrantyExpiryReminder] Both email & WhatsApp checks complete.`,
    );
  } catch (error) {
    console.error("[WarrantyExpiryReminder] Scheduler error:", error);
  }
};

/**
 * Register the cron job — runs every day at 12:00 PM (noon) server time.
 * Schedule: "0 12 * * *"
 */
export const startWarrantyExpiryReminderScheduler = () => {
  // cron.schedule("*/10 * * * * *", () => {
  //   checkAndSendWarrantyReminders();
  // });
  cron.schedule("0 12 * * *", () => {
    checkAndSendWarrantyReminders();
  });

  console.log(
    "[WarrantyExpiryReminder] Scheduler registered — runs daily at 12:00 PM.",
  );
};
