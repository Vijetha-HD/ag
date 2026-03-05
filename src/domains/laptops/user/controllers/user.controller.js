import { asyncHandler } from '../../../../shared/common/utils/errorHandler.js';
import User from '../../auth/models/User.model.js';

export const addAddress = asyncHandler(async (req, res) => {
    const { fullName, phone, addressLine1, addressLine2, city, state, pincode, country, details, isDefault, addressType } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    const newAddress = {
        fullName,
        phone,
        addressLine1,
        addressLine2,
        city,
        state,
        pincode,
        country,
        details,
        isDefault: isDefault || false,
        addressType: addressType || 'Home'
    };

    // If new address is default, unset previous default
    if (newAddress.isDefault) {
        user.addresses.forEach(addr => {
            addr.isDefault = false;
        });
    } else if (user.addresses.length === 0) {
        // If it's the first address, make it default automatically
        newAddress.isDefault = true;
    }

    user.addresses.push(newAddress);
    await user.save();

    res.status(201).json({
        success: true,
        data: user.addresses,
        message: 'Address added successfully'
    });
});

export const removeAddress = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    const addressId = req.params.addressId;

    user.addresses = user.addresses.filter(addr => addr._id.toString() !== addressId);

    // If we deleted the default address, make the first one default (if exists)
    if (user.addresses.length > 0 && !user.addresses.some(addr => addr.isDefault)) {
        user.addresses[0].isDefault = true;
    }

    await user.save();

    res.json({
        success: true,
        data: user.addresses,
        message: 'Address removed successfully'
    });
});

export const getAddresses = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }
    res.json({
        success: true,
        data: user.addresses
    });
});

export const getCustomers = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, role, isVerified, startDate, endDate } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const matchStage = {
        role: { $in: ['B2C_BUYER', 'B2B_BUYER'] }
    };

    if (role) {
        matchStage.role = role;
    }

    if (isVerified !== undefined && isVerified !== '') {
        matchStage.isVerified = isVerified === 'true';
    }

    if (startDate || endDate) {
        matchStage.createdAt = {};
        if (startDate) {
            matchStage.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            matchStage.createdAt.$lte = end;
        }
    }

    // Fetch users with roles B2C_BUYER or B2B_BUYER and calculate LTV
    const result = await User.aggregate([
        {
            $match: matchStage
        },
        {
            $lookup: {
                from: 'orders',
                localField: '_id',
                foreignField: 'userId',
                as: 'orders'
            }
        },
        {
            $addFields: {
                totalSpent: {
                    $sum: {
                        $map: {
                            input: {
                                $filter: {
                                    input: "$orders",
                                    as: "order",
                                    cond: {
                                        $and: [
                                            { $ne: ["$$order.status", "CANCELLED"] },
                                            { $ne: ["$$order.paymentStatus", "FAILED"] },
                                            { $ne: ["$$order.paymentStatus", "PENDING"] }
                                        ]
                                    }
                                }
                            },
                            as: "validOrder",
                            in: "$$validOrder.totalAmount"
                        }
                    }
                },
                id: "$_id" // Ensure id is available for frontend
            }
        },
        {
            $project: {
                password: 0,
                orders: 0,
                __v: 0
            }
        },
        { $sort: { createdAt: -1 } }, // Optional: sort by newest
        {
            $facet: {
                metadata: [{ $count: "total" }],
                data: [{ $skip: skip }, { $limit: limitNum }]
            }
        }
    ]);

    const customers = result[0].data;
    const total = result[0].metadata[0]?.total || 0;

    res.json({
        success: true,
        count: customers.length,
        pagination: {
            total,
            pages: Math.ceil(total / limitNum),
            page: pageNum,
            limit: limitNum
        },
        data: customers
    });
});

//////