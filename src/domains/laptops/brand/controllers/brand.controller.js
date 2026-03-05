/**
 * Brand Controller (Laptops Domain)
 */
import Brand from '../models/Brand.model.js';
import { asyncHandler, AppError } from '../../../../shared/common/utils/errorHandler.js';

/**
 * @desc    Create new brand
 * @route   POST /api/laptops/brands
 * @access  Private (Admin/Seller)
 */
export const createBrand = asyncHandler(async (req, res, next) => {
    const { name, logo, description } = req.body;

    // Check if brand exists
    const brandExists = await Brand.findOne({ name });
    if (brandExists) {
        return next(new AppError('Brand already exists', 400));
    }

    const brand = await Brand.create({
        name,
        logo,
        description,
    });

    res.status(201).json({
        success: true,
        data: brand,
    });
});

/**
 * @desc    Get all brands
 * @route   GET /api/laptops/brands
 * @access  Public
 */
export const getBrands = asyncHandler(async (req, res, next) => {
    // Removed isActive filter as the field was removed from schema
    const brands = await Brand.find({}).sort({ name: 1 });

    res.status(200).json({
        success: true,
        count: brands.length,
        data: brands,
    }); 
});
