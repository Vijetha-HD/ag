/**
 * Multi-Database Connection Manager
 * Handles connections to multiple MongoDB databases
 * 
 * Architecture (Domain-Specific Auth):

 * - Laptops DB: Users, Products, Orders, Cart (laptops domain - complete isolation)
 */
import mongoose from 'mongoose';
import env from '../config/env.js';

// Connection instances
const connections = {

  laptops: null,
};

/**
 * Create a named MongoDB connection
 * @param {string} name - Connection name (flowers, laptops)
 * @param {string} uri - MongoDB connection URI
 * @returns {Promise<mongoose.Connection>}
 */
const createConnection = async (name, uri) => {
  try {
    // Create a new connection (not using default mongoose connection)
    const conn = mongoose.createConnection(uri, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds instead of 30
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      connectTimeoutMS: 10000, // Give up initial connection after 10 seconds
      maxPoolSize: 10, // Maintain up to 10 socket connections
      minPoolSize: 2, // Maintain at least 2 socket connections
    });

    // Handle connection events
    conn.on('connected', () => {
      const host = conn.host || conn.connection?.host || 'unknown';
      console.log(`✅ ${name.toUpperCase()} Database Connected: ${host}`);
    });

    conn.on('error', (err) => {
      console.error(`❌ ${name.toUpperCase()} Database Error:`, err.message);
    });

    conn.on('disconnected', () => {
      console.log(`⚠️  ${name.toUpperCase()} Database Disconnected`);
    });

    // Wait for connection to be ready
    await conn.asPromise();

    return conn;
  } catch (error) {
    console.error(`❌ Error connecting to ${name} database:`, error.message);
    throw error;
  }
};

/**
 * Connect to all databases
 * Connects to laptops database with separate connection string
 * @returns {Promise<void>}
 */
export const connectAllDatabases = async () => {
  try {
    console.log('🔄 Connecting to databases...\n');


    // Validate required database URIs


    if (!env.databases.laptops) {
      throw new Error('MONGODB_LAPTOPS_URI is required. Please set it in your .env file.');
    }



    // Connect to laptops database
    connections.laptops = await createConnection('LAPTOPS', env.databases.laptops);

    console.log('\n✅ All databases connected successfully!\n');
  } catch (error) {
    console.error('❌ Database connection setup failed:', error.message);
    if (process.env.VERCEL) {
      console.warn('⚠️  Running in serverless mode - continuing despite DB connection error');
    } else {
      process.exit(1);
    }
    throw error;
  }
};

/**
 * Get a specific database connection
 * @param {string} name - Connection name (flowers, laptops)
 * @returns {mongoose.Connection}
 */
export const getConnection = (name) => {
  if (!name || name !== 'laptops') {
    throw new Error(`Invalid connection name "${name}". Must be "laptops".`);
  }

  const conn = connections[name];
  if (!conn) {
    throw new Error(`Database connection "${name}" not found. Available: ${Object.keys(connections).join(', ')}`);
  }
  return conn;
};

/**
 * Close all database connections
 * @returns {Promise<void>}
 */
export const closeAllConnections = async () => {
  console.log('🔄 Closing all database connections...');

  for (const [name, conn] of Object.entries(connections)) {
    if (conn && conn.readyState === 1) {
      await conn.close();
      console.log(`✅ ${name.toUpperCase()} connection closed`);
    }
  }
};

/**
 * Check if a connection is ready
 * @param {string} name - Connection name (flowers, laptops)
 * @returns {boolean}
 */
export const isConnected = (name) => {
  if (!name || name !== 'laptops') {
    return false;
  }
  const conn = connections[name];
  return conn && conn.readyState === 1;
};

export default {
  connectAllDatabases,
  getConnection,
  closeAllConnections,
  isConnected,
};
