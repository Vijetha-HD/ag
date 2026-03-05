/**
 * Authentication Middleware
 * Verifies JWT tokens and attaches user to request
 * Domain-aware: Uses the correct User model based on request path
 */
import jwt from 'jsonwebtoken';
import env from '../../infrastructure/config/env.js';
import Admin from '../../../domains/laptops/auth/models/Admin.model.js';
import LaptopsUser from '../../../domains/laptops/auth/models/User.model.js';
import { AppError, asyncHandler } from '../utils/errorHandler.js';

/**
 * Determine which domain's User model to use based on request path
 */
const getUserModel = (req) => {
  return LaptopsUser;
};

/**
 * Protect routes - requires valid JWT token
 * Automatically uses the correct domain's User model based on request path
 */
export const protect = asyncHandler(async (req, res, next) => {
  let token;

  // Check for token in Authorization header
  if (req.headers.authorization) {
    // Handle both "Bearer <token>" and just "<token>" formats
    if (req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else {
      // If no "Bearer " prefix, assume the entire header is the token
      // (for backward compatibility, but recommend using "Bearer " prefix)
      token = req.headers.authorization;
      console.warn('Warning: Token should include "Bearer " prefix. Using token without prefix.');
    }
  }

  if (!token) {
    return next(new AppError('Not authorized to access this route. Please provide a valid token in Authorization header.', 401));
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, env.jwt.secret);

let user = null;

// If token contains type
if (decoded.type === 'ADMIN') {
  user = await Admin.findById(decoded.id).select('-password');
} else {
  const User = getUserModel(req);
  user = await User.findById(decoded.id).select('-password');
}

if (!user) {
  return next(new AppError('User not found', 401));
}

req.user = user;
next();
  } catch (error) {
    console.error('JWT Verification Error:', error.message);

    // Handle specific JWT errors with 401
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Your session has expired. Please log in again.', 401));
    }
    if (error.name === 'JsonWebTokenError' || error.name === 'NotBeforeError') {
      return next(new AppError('Invalid token. Please log in again.', 401));
    }

    // For other errors (e.g., DB connection issues), pass them to global error handler
    // This will result in a 500 error instead of 401, preventing auto-logout on frontend
    return next(error);
  }
});


/**
 * Restrict routes to specific roles
 * @param {...string} roles - Allowed roles
 */
export const restrictTo = (...roles) => {
  return (req, res, next) => {
    // Check if user exists and has a role
    if (!req.user || !req.user.role) {
      return next(new AppError('User role not found', 403));
    }

    // Check if user's role is included in allowed roles
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }

    next();
  };
};

export const admin = restrictTo('ADMIN');
