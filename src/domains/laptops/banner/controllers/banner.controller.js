/**
 * Banner Controller (Laptops Domain)
 * Handles CRUD for homepage carousel banner images.
 * Limit: maximum 5 active banners at any time.
 */
import Banner from "../models/Banner.model.js";
import {
  AppError,
  asyncHandler,
} from "../../../../shared/common/utils/errorHandler.js";
import { deleteImage } from "../../../../shared/common/utils/s3Upload.js";

const MAX_BANNERS = 5;

/**
 * @route   GET /api/laptops/banners
 * @desc    Get all active banners sorted by order
 * @access  Public
 */
export const getBanners = asyncHandler(async (req, res, next) => {
  const banners = await Banner.find({ isActive: true }).sort({
    order: 1,
    createdAt: 1,
  });

  res.status(200).json({
    success: true,
    count: banners.length,
    data: { banners },
  });
});

/**
 * @route   POST /api/laptops/banners
 * @desc    Add a new banner (imageUrl + publicId from upload endpoint)
 * @access  Private (Admin only)
 */
export const addBanner = asyncHandler(async (req, res, next) => {
  const { imageUrl, publicId } = req.body;

  if (!imageUrl || !publicId) {
    return next(new AppError("imageUrl and publicId are required", 400));
  }

  // Enforce max 5 banners
  const activeCount = await Banner.countDocuments({ isActive: true });
  if (activeCount >= MAX_BANNERS) {
    return next(
      new AppError(
        `Maximum banner limit reached. You can only have ${MAX_BANNERS} banners. Please delete an existing banner before adding a new one.`,
        400,
      ),
    );
  }

  // Set order to end of list
  const banner = await Banner.create({
    imageUrl,
    publicId,
    order: activeCount, // append at end
    isActive: true,
  });

  res.status(201).json({
    success: true,
    message: "Banner added successfully",
    data: { banner },
  });
});

/**
 * @route   DELETE /api/laptops/banners/:id
 * @desc    Delete a banner (removes image from S3 + removes DB record)
 * @access  Private (Admin only)
 */
export const deleteBanner = asyncHandler(async (req, res, next) => {
  const banner = await Banner.findById(req.params.id);

  if (!banner) {
    return next(new AppError("Banner not found", 404));
  }

  // Delete from S3 storage (non-blocking — log error but don't fail request)
  try {
    await deleteImage(banner.publicId);
  } catch (err) {
    console.error(
      "Warning: Could not delete banner image from S3:",
      err.message,
    );
  }

  // Hard delete from DB
  await Banner.findByIdAndDelete(req.params.id);

  // Re-normalize order values so they stay sequential (0, 1, 2, ...)
  const remaining = await Banner.find({ isActive: true }).sort({ order: 1 });
  const bulkOps = remaining.map((b, idx) => ({
    updateOne: { filter: { _id: b._id }, update: { order: idx } },
  }));
  if (bulkOps.length > 0) {
    await Banner.bulkWrite(bulkOps);
  }

  res.status(200).json({
    success: true,
    message: "Banner deleted successfully",
  });
});

/**
 * @route   PUT /api/laptops/banners/:id
 * @desc    Replace banner image (delete old S3 image, save new imageUrl + publicId)
 * @access  Private (Admin only)
 */
export const replaceBanner = asyncHandler(async (req, res, next) => {
  const { imageUrl, publicId } = req.body;

  if (!imageUrl || !publicId) {
    return next(new AppError("imageUrl and publicId are required", 400));
  }

  const banner = await Banner.findById(req.params.id);

  if (!banner) {
    return next(new AppError("Banner not found", 404));
  }

  // Delete old image from S3
  try {
    await deleteImage(banner.publicId);
  } catch (err) {
    console.error(
      "Warning: Could not delete old banner image from S3:",
      err.message,
    );
  }

  // Update with new image
  banner.imageUrl = imageUrl;
  banner.publicId = publicId;
  await banner.save();

  res.status(200).json({
    success: true,
    message: "Banner replaced successfully",
    data: { banner },
  });
});

/**
 * @route   PATCH /api/laptops/banners/reorder
 * @desc    Reorder banners — body: [{ id, order }]
 * @access  Private (Admin only)
 */
export const reorderBanners = asyncHandler(async (req, res, next) => {
  const { banners } = req.body; // [{ id, order }]

  if (!Array.isArray(banners) || banners.length === 0) {
    return next(new AppError("banners array is required", 400));
  }

  const bulkOps = banners.map(({ id, order }) => ({
    updateOne: {
      filter: { _id: id },
      update: { order: Number(order) },
    },
  }));

  await Banner.bulkWrite(bulkOps);

  const updated = await Banner.find({ isActive: true }).sort({ order: 1 });

  res.status(200).json({
    success: true,
    message: "Banners reordered successfully",
    data: { banners: updated },
  });
});
