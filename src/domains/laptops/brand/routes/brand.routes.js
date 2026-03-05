/**
 * Brand Routes (Laptops Domain)
 */
import express from 'express';
import {
    createBrand,
    getBrands,
} from '../controllers/brand.controller.js';
import { protect } from '../../../../shared/common/middlewares/auth.middleware.js';
import { restrictTo } from '../../../../shared/common/middlewares/role.middleware.js';

const router = express.Router();

// Public routes
router.get('/', getBrands);

// Protected routes (Admin/Seller only)
router.post(
    '/',
    protect,
    restrictTo('SELLER', 'ADMIN'),
    createBrand
);

export default router;
