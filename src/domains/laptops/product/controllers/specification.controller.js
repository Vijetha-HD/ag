/**
 * Specification Controller (Laptops Domain)
 * API endpoints for fetching hardcoded specification options
 */
import { asyncHandler } from '../../../../shared/common/utils/errorHandler.js';

// Define options directly in the controller to source them from backend
const RAM_OPTIONS = [
    '4GB', '8GB', '12GB', '16GB', '24GB', '32GB', '64GB', '96GB', '128GB'
];

const STORAGE_OPTIONS = [
    '128GB', '256GB', '512GB', '1TB', '2TB', '4TB'
];

const SCREEN_SIZE_OPTIONS = [
    '13"', '14"', '15.6"', '16"', '17.3"'
];

const PROCESSOR_OPTIONS = [
    'Intel i3', 'Intel i5', 'Intel i7', 'Intel i9',
    'AMD Ryzen 3', 'AMD Ryzen 5', 'AMD Ryzen 7', 'AMD Ryzen 9'
];

/**
 * @desc    Get all specification options
 * @route   GET /api/laptops/specifications
 * @access  Public
 */
export const getSpecifications = asyncHandler(async (req, res, next) => {
    res.status(200).json({
        success: true,
        data: {
            ram: RAM_OPTIONS,
            storage: STORAGE_OPTIONS,
            screenSize: SCREEN_SIZE_OPTIONS,
            processor: PROCESSOR_OPTIONS
        },
    });
});
