/**
 * Warehouse Controller (Laptops Domain)
 */
import Warehouse from '../models/Warehouse.model.js';
import { AppError, asyncHandler } from '../../../../shared/common/utils/errorHandler.js';

/**
 * @route   POST /api/laptops/warehouses
 * @desc    Create a new warehouse
 * @access  Private (Admin only)
 */
export const createWarehouse = asyncHandler(async (req, res, next) => {
    const { name, location, address, manager, contact, stock } = req.body;

    const warehouse = await Warehouse.create({
        name,
        location,
        address,
        manager,
        contact,
        stock: Number(stock) || 0
    });

    res.status(201).json({
        success: true,
        data: {
            warehouse,
        },
        message: 'Warehouse created successfully',
    });
});

/**
 * @route   GET /api/laptops/warehouses
 * @desc    Get all warehouses
 * @access  Private
 */
export const getWarehouses = asyncHandler(async (req, res, next) => {
    const { page = 1, limit = 6 } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const warehouses = await Warehouse.find({ isActive: true })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum);

    const total = await Warehouse.countDocuments({ isActive: true });

    res.status(200).json({
        success: true,
        count: warehouses.length,
        pagination: {
            total,
            pages: Math.ceil(total / limitNum),
            page: pageNum,
            limit: limitNum
        },
        data: {
            warehouses,
        },
    });
});
