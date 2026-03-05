/**
 * Specification Routes (Laptops Domain)
 */
import express from 'express';
import { getSpecifications } from '../controllers/specification.controller.js';

const router = express.Router();

// Public routes
router.get('/', getSpecifications);

export default router;
