/**
 * SMS Service using Twilio
 * Handles sending SMS notifications
 */
import twilio from 'twilio';
import env from '../../infrastructure/config/env.js';

/**
 * Send SMS
 * @param {string} to - Recipient phone number
 * @param {string} body - SMS body content
 * @returns {Promise} Promise that resolves when SMS is sent
 */
export const sendSMS = async (to, body) => {
    try {
        // Check if Twilio is configured
        if (!env.twilio.accountSid || !env.twilio.authToken || !env.twilio.phoneNumber) {
            console.warn('Twilio configuration missing. SMS NOT sent. Check process.env');
            return;
        }

        const client = twilio(env.twilio.accountSid, env.twilio.authToken);

        const message = await client.messages.create({
            body: body,
            from: env.twilio.phoneNumber,
            to: to,
        });

        console.log(`SMS sent successfully to ${to}: ${message.sid}`);
        return message;
    } catch (error) {
        console.error(`Error sending SMS to ${to}:`, error.message);
        // Don't throw error to prevent blocking the flow if SMS fails
        // Just log it. The user might still get the email.
    }
};

/**
 * Send WhatsApp Message
 * @param {string} to - Recipient phone number
 * @param {string} body - Message body content
 * @returns {Promise} Promise that resolves when WhatsApp is sent
 */
export const sendWhatsApp = async (to, body) => {
    try {
        // Check if Twilio is configured
        if (!env.twilio.accountSid || !env.twilio.authToken || !env.twilio.phoneNumber) {
            console.warn('Twilio configuration missing. WhatsApp NOT sent.');
            return;
        }

        const client = twilio(env.twilio.accountSid, env.twilio.authToken);

        // Twilio WhatsApp requires 'whatsapp:' prefix for both from and to
        const fromNumber = `whatsapp:${env.twilio.phoneNumber}`;
        const toNumber = `whatsapp:${to}`;

        const message = await client.messages.create({
            body: body,
            from: fromNumber,
            to: toNumber,
        });

        console.log(`WhatsApp sent successfully to ${to}: ${message.sid}`);
        return message;
    } catch (error) {
        console.error(`Error sending WhatsApp to ${to}:`, error.message);
    }
};
