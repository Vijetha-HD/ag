/**
 * Post-Delivery Follow-Up Scheduler
 * Sends a WhatsApp message to users 3-4 days after their order is delivered.
 */
import env from '../../infrastructure/config/env.js';
import { sendWhatsApp } from '../utils/smsService.js';

export const startPostDeliveryFollowUpScheduler = async () => {
    // Run every hour to check for eligible orders
    setInterval(async () => {
        try {
            // Import Order model dynamically
            const Order = (await import('../../../domains/laptops/order/models/Order.model.js')).default;

            const now = Date.now();
            const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000);
            const fourDaysAgo = new Date(now - 4 * 24 * 60 * 60 * 1000);

            // Find orders delivered between 3 and 4 days ago
            // And follow-up NOT sent yet
            const eligibleOrders = await Order.find({
                status: 'DELIVERED',
                deliveredAt: {
                    $lte: threeDaysAgo,
                    // Optional: $gte: fourDaysAgo // If we only want to catch them in this window. 
                    // But to be safe (in case server was down), we just check $lte 3 days and !followUpSent.
                },
                followUpSent: { $ne: true }
            }).populate('userId', 'name phone');

            if (eligibleOrders.length > 0) {
                console.log(`Scheduler: Found ${eligibleOrders.length} orders for post-delivery follow-up.`);

                for (const order of eligibleOrders) {
                    const user = order.userId;
                    const customerName = user?.name || order.shippingAddress?.fullName || 'Customer';
                    const phone = user?.phone || order.shippingAddress?.phone;

                    if (phone) {
                        const message = `Hi ${customerName}, hope you're enjoying your new laptop from Bright Laptop! 💻✨ If you have any questions or need support, feel free to reach out to us here. We're happy to help!`;

                        await sendWhatsApp(phone, message);

                        // Mark as sent
                        order.followUpSent = true;
                        await order.save();
                    }
                }
            }
        } catch (error) {
            console.error('Scheduler Error (Post-Delivery Follow-Up):', error);
        }
    }, 60 * 60 * 1000); // Check every hour
};
