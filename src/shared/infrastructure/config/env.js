/**
 * Environment Configuration
 * Validates and exports environment variables
 */
import dotenv from 'dotenv';

dotenv.config();

const requiredEnvVars = [

  'MONGODB_LAPTOPS_URI',
  'JWT_SECRET',
  'PORT'
];

// Validate required environment variables
// Validate required environment variables - REMOVED DB CHECKS to support partial deployment
requiredEnvVars.forEach((varName) => {
  if (!process.env[varName]) {
    if (varName.includes('MONGODB')) {
      console.warn(`⚠️  Optional variable ${varName} is missing.`);
    } else {
      throw new Error(`Missing required environment variable: ${varName}`);
    }
  }
});

console.log('--- ENV DEBUG ---');
console.log('Cloud Name loaded:', !!process.env.CLOUDINARY_CLOUD_NAME, process.env.CLOUDINARY_CLOUD_NAME);
console.log('API Key loaded:', !!process.env.CLOUDINARY_API_KEY);
console.log('-----------------');

export default {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  // Multi-database configuration (domain-specific auth)
  // Each domain has its own database with separate connection string
  databases: {

    laptops: process.env.MONGODB_LAPTOPS_URI, // Laptops DB (users, products, orders, carts)
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expire: process.env.JWT_EXPIRE || '7d',
  },
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
  myFatoorah: {
    url: process.env.MYFATOORAH_API_URL,
    token: process.env.MYFATOORAH_API_TOKEN,
  },
  hesabe: {
    merchantCode: process.env.HESABE_MERCHANT_CODE,
    accessCode: process.env.HESABE_ACCESS_CODE,
    secretKey: process.env.HESABE_SECRET_KEY,
    ivKey: process.env.HESABE_IV_KEY,
    isTest: false,
    url: 'https://api.hesabe.com'
  },
  email: {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true' || false,
    user: process.env.EMAIL_USER || '',
    password: process.env.EMAIL_PASSWORD || '',
    fromName: process.env.EMAIL_FROM_NAME || 'Bright Laptop',
    contactEmail: process.env.EMAIL_CONTACT_EMAIL || process.env.EMAIL_USER || '',
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
  },
  shiprocket: {
    email: process.env.SHIPROCKET_EMAIL,
    password: process.env.SHIPROCKET_PASSWORD,
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5174',
  storeUrl: process.env.STORE_URL || 'http://localhost:3000',

  laptopAdminUrl: process.env.LAPTOP_ADMIN_URL || 'http://localhost:5175',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:5000',
};


/////