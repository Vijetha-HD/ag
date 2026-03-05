/**
 * Product Controller (Laptops Domain)
 * Handles product CRUD operations with MOQ, bulk pricing, and B2B pricing
 */
import mongoose from "mongoose";
import Product from "../models/Product.model.js";
import Category from "../../category/models/Category.model.js"; // Import Category model
import UserModel from "../../auth/models/User.model.js";
import {
  AppError,
  asyncHandler,
} from "../../../../shared/common/utils/errorHandler.js";

// Ensure User model is initialized on laptops connection before using Product.populate()
// Access UserModel to trigger Proxy getter which registers User on laptops connection
try {
  void UserModel.modelName;
} catch (e) {
  // User model will be registered when needed
}

/**
 * @route   POST /api/laptops/products
 * @desc    Create a new product
 * @access  Private (Seller/Admin only)
 */
export const createProduct = asyncHandler(async (req, res, next) => {
  const {
    name,
    description,
    images,
    brand,
    brandImage,
    condition,
    basePrice,
    mrp,
    discountPercentage,
    b2bPrice,

    gstPercentage,
    moq,
    bulkPricing,
    stock,
    soldCount,
    category,
    rating,
    reviewsCount,
    liveViewers,
    specifications,
    configurationVariants,
    defaultWarranty,
    warrantyOptions,
    warrantyRenewalOptions,
    shipping,
    offers,
    warehouseId,
  } = req.body;
  console.log("BODY", req.body);

  // Validate required fields
  if (!name || basePrice === undefined || stock === undefined || !category) {
    return next(
      new AppError("Please provide name, basePrice, stock, and category", 400),
    );
  }

  // Validate images
  if (!images || !Array.isArray(images) || images.length === 0) {
    return next(new AppError("At least one product image is required", 400));
  }

  // Normalize category: trim, lowercase, and replace hyphens with spaces
  // const normalizedCategory = category.trim().toLowerCase().replace(/-/g, ' ');

  // Prepare product data
  const productData = {
    name,
    description: description || "",
    images,
    brand: brand || undefined,
    brandImage: brandImage || undefined,
    condition: "refurbished", // Force default
    basePrice,
    mrp: mrp || undefined,
    discountPercentage: discountPercentage || 0,
    b2bPrice: b2bPrice || undefined,

    gstPercentage: gstPercentage || 18,
    moq: moq || 1,
    bulkPricing: bulkPricing || [],
    stock,
    soldCount: soldCount || 0,
    category,
    rating: rating || 0,
    reviewsCount: reviewsCount || 0,
    liveViewers: liveViewers || 0,
    specifications: specifications || {},
    configurationVariants: configurationVariants || [],
    defaultWarranty: defaultWarranty || "12 months",
    warrantyOptions: warrantyOptions || [],
    warrantyRenewalOptions: warrantyRenewalOptions || [],
    shipping: shipping || { freeShipping: false, estimatedDeliveryDays: 7 },
    offers: offers || {
      exchangeOffer: false,
      exchangeDiscountPercentage: 0,
      noCostEMI: false,
      bankOffers: false,
    },
    warehouseId: warehouseId || null,
    sellerId: req.user._id,
  };

  console.log("DEBUG CONTROLLER: warehouseId from body:", warehouseId);
  console.log(
    "DEBUG CONTROLLER: productData.warehouseId:",
    productData.warehouseId,
  );

  // Create product
  const product = await Product.create(productData);

  res.status(201).json({
    success: true,
    data: {
      product,
    },
  });
});

/**
 * @route   GET /api/laptops/products
 * @desc    Get all products
 * @access  Public
 */
export const getProducts = asyncHandler(async (req, res, next) => {
  const {
    sellerId,
    isActive,
    category,
    page = 1,
    limit = 10,
    warehouseId,
    minStock,
    maxStock,
    minPrice,
    maxPrice,
  } = req.query;

  // Check if database connection is ready
  const { isConnected } =
    await import("../../../../shared/infrastructure/database/connections.js");
  if (!isConnected("laptops")) {
    return next(
      new AppError(
        "Database connection not ready. Please try again in a moment.",
        503,
      ),
    );
  }

  // Build query
  const query = {};
  if (sellerId) {
    query.sellerId = sellerId;
  }
  if (isActive !== undefined) {
    query.isActive = isActive === "true";
  } else {
    query.isActive = true;
  }
  // Filter by category (case-insensitive, handle both hyphens and spaces)
  if (category) {
    query.category = category.trim().toLowerCase().replace(/-/g, " ");
  }

  // Filter by Warehouse
  if (warehouseId) {
    query.warehouseId = warehouseId;
  }

  // Filter by Stock Range
  if (minStock || maxStock) {
    query.stock = {};
    if (minStock) query.stock.$gte = parseInt(minStock);
    if (maxStock) query.stock.$lte = parseInt(maxStock);
  }

  // Filter by Price Range
  if (minPrice || maxPrice) {
    query.basePrice = {};
    if (minPrice) query.basePrice.$gte = parseFloat(minPrice);
    if (maxPrice) query.basePrice.$lte = parseFloat(maxPrice);
  }

  // Pagination logic
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const products = await Product.find(query)
    .populate("sellerId", "name email companyName")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum)
    .maxTimeMS(5000); // Set query timeout to 5 seconds

  // Get total count
  const total = await Product.countDocuments(query);

  res.status(200).json({
    success: true,
    count: products.length,
    pagination: {
      total,
      pages: Math.ceil(total / limitNum),
      page: pageNum,
      limit: limitNum,
    },
    data: {
      products,
    },
  });
});

/**
 * @route   GET /api/laptops/products/:id
 * @desc    Get single product
 * @access  Public
 */
export const getProduct = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id).populate(
    "sellerId",
    "name email companyName",
  );

  if (!product) {
    return next(new AppError("Product not found", 404));
  }

  res.status(200).json({
    success: true,
    data: {
      product,
    },
  });
});

/**
 * @route   PUT /api/laptops/products/:id
 * @desc    Update product
 * @access  Private (Seller/Admin only)
 */
export const updateProduct = asyncHandler(async (req, res, next) => {
  const {
    name,
    description,
    images,
    brand,
    brandImage,
    condition,
    basePrice,
    mrp,
    discountPercentage,
    b2bPrice,

    gstPercentage,
    moq,
    bulkPricing,
    stock,
    soldCount,
    isActive,
    category,
    rating,
    reviewsCount,
    liveViewers,
    specifications,
    configurationVariants,
    defaultWarranty,
    warrantyOptions,
    warrantyRenewalOptions,
    shipping,
    offers,
    warehouseId,
  } = req.body;
  // console.log("body", req.body);
  // console.log("soldCount", soldCount);

  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new AppError("Product not found", 404));
  }

  // Check if user is the seller or admin
  if (
    product.sellerId.toString() !== req.user._id.toString() &&
    req.user.role !== "ADMIN"
  ) {
    return next(new AppError("Not authorized to update this product", 403));
  }

  // Update fields
  if (name !== undefined) product.name = name;
  if (description !== undefined) product.description = description;
  if (images !== undefined) product.images = images;
  if (brand !== undefined) product.brand = brand;
  if (brandImage !== undefined) product.brandImage = brandImage;
  if (condition !== undefined) product.condition = condition;
  if (basePrice !== undefined) product.basePrice = basePrice;
  if (mrp !== undefined) product.mrp = mrp;
  if (discountPercentage !== undefined)
    product.discountPercentage = discountPercentage;
  if (b2bPrice !== undefined) product.b2bPrice = b2bPrice;

  if (gstPercentage !== undefined) product.gstPercentage = gstPercentage;
  if (moq !== undefined) product.moq = moq;
  if (bulkPricing !== undefined) product.bulkPricing = bulkPricing;
  if (stock !== undefined) product.stock = stock;
  if (soldCount !== undefined) product.soldCount = soldCount;
  if (isActive !== undefined) product.isActive = isActive;
  // Normalize category if provided (replace hyphens with spaces)
  if (category !== undefined) {
    product.category = category;
  }
  if (rating !== undefined) product.rating = rating;
  if (reviewsCount !== undefined) product.reviewsCount = reviewsCount;
  if (liveViewers !== undefined) product.liveViewers = liveViewers;
  if (specifications !== undefined) product.specifications = specifications;
  if (configurationVariants !== undefined)
    product.configurationVariants = configurationVariants;
  if (defaultWarranty !== undefined) product.defaultWarranty = defaultWarranty;
  if (warrantyOptions !== undefined) product.warrantyOptions = warrantyOptions;
  if (warrantyRenewalOptions !== undefined)
    product.warrantyRenewalOptions = warrantyRenewalOptions;
  if (shipping !== undefined) product.shipping = shipping;
  if (offers !== undefined) product.offers = offers;
  if (warehouseId !== undefined) product.warehouseId = warehouseId;

  await product.save();

  res.status(200).json({
    success: true,
    data: {
      product,
    },
  });
});

/**
 * @route   DELETE /api/laptops/products/:id
 * @desc    Delete product (soft delete by setting isActive to false)
 * @access  Private (Seller/Admin only)
 */
export const deleteProduct = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new AppError("Product not found", 404));
  }

  // Check if user is the seller or admin
  if (
    product.sellerId.toString() !== req.user._id.toString() &&
    req.user.role !== "ADMIN"
  ) {
    return next(new AppError("Not authorized to delete this product", 403));
  }

  // Check if already deleted
  if (!product.isActive) {
    return res.status(200).json({
      success: true,
      message: "Product is already deleted",
      data: {
        product: {
          _id: product._id,
          name: product.name,
          isActive: false,
        },
      },
    });
  }

  // Soft delete - set isActive to false
  product.isActive = false;
  await product.save();

  res.status(200).json({
    success: true,
    message: "Product deleted successfully",
    data: {
      product: {
        _id: product._id,
        name: product.name,
        isActive: false,
      },
    },
  });
});

/**
 * @route   GET /api/laptops/products/categories/list
 * @desc    Get all unique categories from products
 * @access  Public
 */
export const getAllCategories = asyncHandler(async (req, res, next) => {
  // Get distinct categories from active products only
  const categoryIds = await Product.distinct("category", { isActive: true });

  // Fetch category details
  const categories = await Category.find({ _id: { $in: categoryIds } }).select(
    "name",
  );

  // Extract names and sort alphabetically
  const sortedCategories = categories.map((c) => c.name).sort();

  res.status(200).json({
    success: true,
    count: sortedCategories.length,
    data: {
      categories: sortedCategories,
    },
  });
});

/**
 * @route   GET /api/laptops/categories/:categoryName/products
 * @desc    Get all products from a specific category
 * @access  Public
 */
export const getProductsByCategory = asyncHandler(async (req, res, next) => {
  const { categoryName } = req.params;
  const { sellerId, isActive, page = 1, limit = 10 } = req.query;

  // Check if database connection is ready
  const { isConnected } =
    await import("../../../../shared/infrastructure/database/connections.js");
  if (!isConnected("laptops")) {
    return next(
      new AppError(
        "Database connection not ready. Please try again in a moment.",
        503,
      ),
    );
  }

  // Normalize category name (trim, lowercase, and convert hyphens to spaces)
  // This handles both URL slugs (mini-pcs) and database format (mini pcs)
  const normalizedCategory = categoryName
    .trim()
    .toLowerCase()
    .replace(/-/g, " ");
  const slug = categoryName.trim().toLowerCase().replace(/\s+/g, "-");

  // Find category by slug or name
  const categoryDoc = await Category.findOne({
    $or: [
      { slug: slug },
      { name: { $regex: new RegExp(`^${normalizedCategory}$`, "i") } },
    ],
  });

  if (!categoryDoc) {
    return res.status(200).json({
      success: true,
      count: 0,
      pagination: {
        total: 0,
        pages: 0,
        page: parseInt(page),
        limit: parseInt(limit),
      },
      data: {
        category: normalizedCategory,
        products: [],
      },
    });
  }

  // Build query using Category ID
  const query = {
    category: categoryDoc._id,
  };

  if (sellerId) {
    query.sellerId = sellerId;
  }
  if (isActive !== undefined) {
    query.isActive = isActive === "true";
  } else {
    query.isActive = true; // Default to active products only
  }

  // Pagination logic
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  // Execute query with pagination
  const products = await Product.find(query)
    .populate("sellerId", "name email companyName")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum)
    .maxTimeMS(5000); // Set query timeout to 5 seconds

  // Get total count for pagination metadata
  const total = await Product.countDocuments(query);

  res.status(200).json({
    success: true,
    count: products.length,
    pagination: {
      total,
      pages: Math.ceil(total / limitNum),
      page: pageNum,
      limit: limitNum,
    },
    data: {
      category: normalizedCategory,
      products,
    },
  });
});

/**
 * @route   GET /api/laptops/products/best-sellers
 * @desc    Get best selling products based on soldCount, rating, and reviewsCount
 * @access  Public
 */
export const getBestSellers = asyncHandler(async (req, res, next) => {
  const { limit = 10 } = req.query;

  // Check database connection
  const { isConnected } =
    await import("../../../../shared/infrastructure/database/connections.js");
  if (!isConnected("laptops")) {
    return next(
      new AppError(
        "Database connection not ready. Please try again in a moment.",
        503,
      ),
    );
  }

  // Get all active products
  const products = await Product.find({ isActive: true })
    .populate("sellerId", "name email companyName")
    .maxTimeMS(5000);

  // Calculate best seller score for each product
  // Score = (rating × reviewsCount × 0.3) + (soldCount × 0.7)
  const productsWithScore = products.map((product) => {
    const ratingScore =
      (product.rating || 0) * (product.reviewsCount || 0) * 0.3;
    const salesScore = (product.soldCount || 0) * 0.7;
    const bestSellerScore = ratingScore + salesScore;

    return {
      ...product.toObject(),
      bestSellerScore,
    };
  });

  // Sort by best seller score (descending) and take top N
  const bestSellers = productsWithScore
    .sort((a, b) => b.bestSellerScore - a.bestSellerScore)
    .slice(0, parseInt(limit));

  res.status(200).json({
    success: true,
    count: bestSellers.length,
    data: {
      products: bestSellers,
    },
  });
});

/**
 * @route   GET /api/laptops/products/best-deals
 * @desc    Get products with best deals (highest discount percentages)
 * @access  Public
 */
export const getBestDeals = asyncHandler(async (req, res, next) => {
  const { limit = 10 } = req.query;

  // Check database connection
  const { isConnected } =
    await import("../../../../shared/infrastructure/database/connections.js");
  if (!isConnected("laptops")) {
    return next(
      new AppError(
        "Database connection not ready. Please try again in a moment.",
        503,
      ),
    );
  }

  // Get active products with discounts, sorted by discount percentage (descending)
  const products = await Product.find({
    isActive: true,
    discountPercentage: { $gt: 0 }, // Only products with discounts
  })
    .populate("sellerId", "name email companyName")
    .sort({ discountPercentage: -1 }) // Sort by highest discount first
    .limit(parseInt(limit))
    .maxTimeMS(5000);

  res.status(200).json({
    success: true,
    count: products.length,
    data: {
      products,
    },
  });
});

/**
 * @route   GET /api/laptops/products/search
 * @desc    Search products by name, brand, category, or description
 * @access  Public
 */
export const searchProducts = asyncHandler(async (req, res, next) => {
  const { q, limit = 10 } = req.query;

  // Check database connection
  const { isConnected } =
    await import("../../../../shared/infrastructure/database/connections.js");
  if (!isConnected("laptops")) {
    return next(
      new AppError(
        "Database connection not ready. Please try again in a moment.",
        503,
      ),
    );
  }

  // If no search query, return empty results
  if (!q || q.trim().length === 0) {
    return res.status(200).json({
      success: true,
      count: 0,
      data: {
        products: [],
      },
    });
  }

  const searchQuery = q.trim();
  const searchLimit = Math.min(parseInt(limit), 20); // Max 20 results

  // Create search regex for case-insensitive search
  const searchRegex = new RegExp(searchQuery, "i");

  // Search in name, brand, category, and description
  const products = await Product.find({
    isActive: true,
    $or: [
      { name: { $regex: searchRegex } },
      { brand: { $regex: searchRegex } },
      { category: { $regex: searchRegex } },
      { description: { $regex: searchRegex } },
    ],
  })
    .populate("sellerId", "name email companyName")
    .limit(searchLimit)
    .maxTimeMS(5000);

  res.status(200).json({
    success: true,
    count: products.length,
    query: searchQuery,
    data: {
      products,
    },
  });
});

/**
 * @route   GET /api/laptops/products/brands
 * @desc    Get unique brands with their images from products
 * @access  Public
 */
export const getBrands = asyncHandler(async (req, res, next) => {
  // Check database connection
  const { isConnected } =
    await import("../../../../shared/infrastructure/database/connections.js");
  if (!isConnected("laptops")) {
    return next(
      new AppError(
        "Database connection not ready. Please try again in a moment.",
        503,
      ),
    );
  }

  // Get all active products with brand and brandImage
  const products = await Product.find({
    isActive: true,
    brand: { $exists: true, $ne: null, $ne: "" },
  })
    .select("brand brandImage")
    .maxTimeMS(5000);

  // Extract unique brands with their images
  const brandMap = new Map();

  products.forEach((product) => {
    const brandName = product.brand?.trim();
    if (brandName) {
      // If brand doesn't exist in map, or if current product has brandImage and map doesn't
      if (
        !brandMap.has(brandName) ||
        (product.brandImage && !brandMap.get(brandName).image)
      ) {
        brandMap.set(brandName, {
          name: brandName,
          image: product.brandImage || null,
        });
      }
    }
  });

  // Convert map to array
  const brands = Array.from(brandMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  ); // Sort alphabetically

  res.status(200).json({
    success: true,
    count: brands.length,
    data: {
      brands,
    },
  });
});

/**
 * @route   GET /api/laptops/products/top-picks
 * @desc    Get top picks - products with high ratings and good reviews (quality + popularity)
 * @access  Public
 */
export const getTopPicks = asyncHandler(async (req, res, next) => {
  const { limit = 10 } = req.query;

  // Check database connection
  const { isConnected } =
    await import("../../../../shared/infrastructure/database/connections.js");
  if (!isConnected("laptops")) {
    return next(
      new AppError(
        "Database connection not ready. Please try again in a moment.",
        503,
      ),
    );
  }

  // Get active products with minimum rating and reviews
  // Top picks = products with rating >= 4.0 AND reviewsCount >= 5
  // Sorted by (rating × reviewsCount) to prioritize both quality and popularity
  const products = await Product.find({
    isActive: true,
    rating: { $gte: 4.0 }, // Minimum 4.0 rating
    reviewsCount: { $gte: 5 }, // Minimum 5 reviews
  })
    .populate("sellerId", "name email companyName")
    .maxTimeMS(5000);

  // Calculate top picks score: rating × reviewsCount (prioritizes both quality and popularity)
  const productsWithScore = products.map((product) => {
    const topPickScore = (product.rating || 0) * (product.reviewsCount || 0);
    return {
      ...product.toObject(),
      topPickScore,
    };
  });

  // Sort by top pick score (descending) and take top N
  const topPicks = productsWithScore
    .sort((a, b) => b.topPickScore - a.topPickScore)
    .slice(0, parseInt(limit));

  res.status(200).json({
    success: true,
    count: topPicks.length,
    data: {
      products: topPicks,
    },
  });
});

/**
 * @route   GET /api/laptops/products/filter
 * @desc    Get products by advanced filters
 * @access  Public
 */
export const getProductsByFilters = asyncHandler(async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    isActive = "true",
    minPrice,
    maxPrice,
    brand,
    ram,
    storage,
    processor,
    screenSize,
    search,
    sort = "relevance",
    condition,
    category,
  } = req.query;

  const { isConnected } =
    await import("../../../../shared/infrastructure/database/connections.js");

  if (!isConnected("laptops")) {
    return next(new AppError("Database connection not ready.", 503));
  }
  console.log("inside get products by filters", req.query);

  const query = {};

  // ✅ Active filter (default true)
  query.isActive = isActive === "true";

  // ✅ Category filter
  if (category && category !== "all") {
    console.log(`Filtering by category query: ${category}`);

    let categoryQuery = {};
    if (mongoose.Types.ObjectId.isValid(category)) {
      categoryQuery = { _id: category };
    } else {
      categoryQuery = { slug: category.toLowerCase() };
    }

    let categoryDoc = await Category.findOne(categoryQuery);

    // Fallback: Try searching by name if slug match fails
    if (!categoryDoc && !mongoose.Types.ObjectId.isValid(category)) {
      console.log(
        `Category slug '${category}' not found, trying name match fallback...`,
      );
      // Replace hyphens with spaces for name search (simple heuristic)
      const namePattern = category.replace(/-/g, " ");
      const nameRegex = new RegExp(`^${namePattern}$`, "i");
      categoryDoc = await Category.findOne({ name: nameRegex });
    }

    if (categoryDoc) {
      console.log(
        `Found category: ${categoryDoc.name} (ID: ${categoryDoc._id})`,
      );
      query.category = categoryDoc._id;
    } else {
      console.log(`Category '${category}' not found in database.`);
      return res.status(200).json({
        success: true,
        count: 0,
        pagination: {
          total: 0,
          pages: 0,
          page: Number(page) || 1,
          limit: Number(limit) || 10,
        },
        data: { products: [] },
      });
    }
  }

  // ✅ Condition filter
  if (condition) {
    query.condition = condition;
  }

  // ✅ Price Range
  if (minPrice || maxPrice) {
    query.basePrice = {};
    if (minPrice) query.basePrice.$gte = Number(minPrice);
    if (maxPrice) query.basePrice.$lte = Number(maxPrice);
  }

  // ✅ Brand filter (comma separated supported)
  if (brand) {
    const brandArray = brand.split(",");
    query.brand = { $in: brandArray };
  }

  // ✅ RAM filter (specifications + configurationVariants)
  if (ram) {
    const ramArray = ram.split(",");

    query.$or = [
      { "specifications.ram": { $in: ramArray } },
      {
        configurationVariants: {
          $elemMatch: {
            type: "RAM",
            value: { $in: ramArray },
          },
        },
      },
    ];
  }

  // ✅ Storage filter
  if (storage) {
    const storageArray = storage.split(",");

    const storageCondition = {
      $or: [
        { "specifications.storage": { $in: storageArray } },
        {
          configurationVariants: {
            $elemMatch: {
              type: "STORAGE",
              value: { $in: storageArray },
            },
          },
        },
      ],
    };

    if (query.$or) {
      query.$and = [{ $or: query.$or }, storageCondition];
      delete query.$or;
    } else {
      Object.assign(query, storageCondition);
    }
  }

  // ✅ Processor filter
  if (processor) {
    query["specifications.processor"] = {
      $regex: new RegExp(processor, "i"),
    };
  }

  // ✅ Screen Size filter
  if (screenSize) {
    query["specifications.screenSize"] = {
      $regex: new RegExp(screenSize, "i"),
    };
  }

  // ✅ Search (name, brand, price)
  if (search && search.trim().length > 0) {
    const searchRegex = new RegExp(search.trim(), "i");

    const numericSearch = !isNaN(search) ? Number(search) : null;

    const searchCondition = {
      $or: [
        { name: searchRegex },
        { brand: searchRegex },
        ...(numericSearch ? [{ basePrice: numericSearch }] : []),
      ],
    };

    if (query.$and) {
      query.$and.push(searchCondition);
    } else {
      query.$and = [searchCondition];
    }
  }

  // ✅ Sorting logic
  let sortOption = {};

  switch (sort) {
    case "price-low":
      sortOption = { basePrice: 1 };
      break;
    case "price-high":
      sortOption = { basePrice: -1 };
      break;
    case "rating":
      sortOption = { rating: -1 };
      break;
    case "discount":
      sortOption = { discountPercentage: -1 };
      break;
    case "newest":
      sortOption = { createdAt: -1 };
      break;
    case "relevance":
    default:
      sortOption = { createdAt: -1 };
  }

  // ✅ Pagination
  const pageNum = Number(page);
  const limitNum = Number(limit);
  const skip = (pageNum - 1) * limitNum;

  const products = await Product.find(query)
    .populate("sellerId", "name email companyName")
    .sort(sortOption)
    .skip(skip)
    .limit(limitNum)
    .maxTimeMS(5000);

  const total = await Product.countDocuments(query);

  res.status(200).json({
    success: true,
    count: products.length,
    pagination: {
      total,
      pages: Math.ceil(total / limitNum),
      page: pageNum,
      limit: limitNum,
    },
    data: {
      products,
    },
  });
});

/**
 * @route   POST /api/laptops/products/bulk
 * @desc    Bulk create products from CSV/Excel upload
 * @access  Private (Admin only)
 *
 * Each row in the `products` array should have:
 *   - categoryName  (string) → resolved to category ObjectId
 *   - warehouseName (string, optional) → resolved to warehouse ObjectId
 *   - All other fields matching the Product schema
 *
 * Returns a summary: { created, failed: [{ row, name, reason }] }
 */
export const bulkCreateProducts = asyncHandler(async (req, res, next) => {
  const { products } = req.body;

  if (!products || !Array.isArray(products) || products.length === 0) {
    return next(
      new AppError("products array is required and must not be empty", 400),
    );
  }

  if (products.length > 500) {
    return next(
      new AppError("Maximum 500 products allowed per bulk upload", 400),
    );
  }

  // ── 1. Collect all unique category names and warehouse names ─────────────
  const categoryNames = [
    ...new Set(products.map((p) => p.categoryName?.trim()).filter(Boolean)),
  ];
  const warehouseNames = [
    ...new Set(products.map((p) => p.warehouseName?.trim()).filter(Boolean)),
  ];

  // ── 2. Resolve all categories in one DB query ─────────────────────────────
  const categoryDocs = await Category.find({
    name: { $in: categoryNames.map((n) => new RegExp(`^${n}$`, "i")) },
    isActive: true,
  }).select("_id name");

  const categoryMap = {};
  categoryDocs.forEach((cat) => {
    categoryMap[cat.name.trim().toLowerCase()] = cat._id;
  });

  // ── 3. Resolve all warehouses in one DB query ─────────────────────────────
  let warehouseMap = {};
  if (warehouseNames.length > 0) {
    // Import Warehouse model dynamically to avoid circular imports
    const { default: Warehouse } =
      await import("../../warehouse/models/Warehouse.model.js");
    const warehouseDocs = await Warehouse.find({
      name: { $in: warehouseNames.map((n) => new RegExp(`^${n}$`, "i")) },
      isActive: true,
    }).select("_id name");

    warehouseDocs.forEach((wh) => {
      warehouseMap[wh.name.trim().toLowerCase()] = wh._id;
    });
  }

  // ── 4. Build product documents, tracking failures ─────────────────────────
  const toInsert = [];
  const failed = [];

  products.forEach((row, index) => {
    const rowNum = index + 1;

    // Resolve category
    const catKey = row.categoryName?.trim().toLowerCase();
    const categoryId = categoryMap[catKey];
    if (!categoryId) {
      failed.push({
        row: rowNum,
        name: row.name || "(unnamed)",
        reason: `Category "${row.categoryName}" not found in database`,
      });
      return;
    }

    // Resolve warehouse (optional)
    let warehouseId = null;
    if (row.warehouseName?.trim()) {
      const whKey = row.warehouseName.trim().toLowerCase();
      warehouseId = warehouseMap[whKey] || null;
      if (!warehouseId) {
        failed.push({
          row: rowNum,
          name: row.name || "(unnamed)",
          reason: `Warehouse "${row.warehouseName}" not found in database`,
        });
        return;
      }
    }

    // Validate required fields
    if (!row.name || row.name.trim().length < 2) {
      failed.push({
        row: rowNum,
        name: row.name || "(unnamed)",
        reason: "Product name is required (min 2 chars)",
      });
      return;
    }
    if (!row.images || !Array.isArray(row.images) || row.images.length === 0) {
      failed.push({
        row: rowNum,
        name: row.name,
        reason: "At least 1 image URL is required",
      });
      return;
    }
    if (
      row.basePrice === undefined ||
      row.basePrice === null ||
      isNaN(Number(row.basePrice))
    ) {
      failed.push({
        row: rowNum,
        name: row.name,
        reason: "basePrice is required and must be a number",
      });
      return;
    }
    if (
      row.stock === undefined ||
      row.stock === null ||
      isNaN(Number(row.stock))
    ) {
      failed.push({
        row: rowNum,
        name: row.name,
        reason: "stock is required and must be a number",
      });
      return;
    }

    // Build the product document
    toInsert.push({
      name: row.name.trim(),
      description: row.description?.trim() || "",
      images: row.images,
      brand: row.brand?.trim() || undefined,
      condition: "refurbished",
      basePrice: Number(row.basePrice),
      mrp: row.mrp ? Number(row.mrp) : undefined,
      discountPercentage: Number(row.discountPercentage) || 0,
      b2bPrice: row.b2bPrice ? Number(row.b2bPrice) : undefined,

      gstPercentage: Number(row.gstPercentage) || 18,
      moq: Number(row.moq) || 1,
      bulkPricing: Array.isArray(row.bulkPricing) ? row.bulkPricing : [],
      stock: Number(row.stock),
      soldCount: Number(row.soldCount) || 0,
      category: categoryId,
      warehouseId: warehouseId,
      rating: Number(row.rating) || 0,
      reviewsCount: Number(row.reviewsCount) || 0,
      liveViewers: Number(row.liveViewers) || 0,
      specifications: row.specifications || {},
      configurationVariants: Array.isArray(row.configurationVariants)
        ? row.configurationVariants
        : [],
      defaultWarranty: row.defaultWarranty || "12 months",
      warrantyOptions: Array.isArray(row.warrantyOptions)
        ? row.warrantyOptions
        : [],
      warrantyRenewalOptions: Array.isArray(row.warrantyRenewalOptions)
        ? row.warrantyRenewalOptions
        : [],
      shipping: row.shipping || {
        freeShipping: false,
        estimatedDeliveryDays: 7,
      },
      offers: row.offers || {
        exchangeOffer: false,
        exchangeDiscountPercentage: 0,
        noCostEMI: false,
        bankOffers: false,
      },
      sellerId: req.user._id,
      isActive: true,
    });
  });

  // ── 5. Insert valid products ───────────────────────────────────────────────
  let insertedCount = 0;
  if (toInsert.length > 0) {
    try {
      const inserted = await Product.insertMany(toInsert, { ordered: false });
      insertedCount = inserted.length;
    } catch (err) {
      // ordered: false means partial inserts are allowed
      // Some may fail at DB level (e.g. duplicate, schema validation)
      if (err.writeErrors) {
        err.writeErrors.forEach((we) => {
          failed.push({
            row: we.index + 1,
            name: toInsert[we.index]?.name || "(unknown)",
            reason: we.errmsg || "Database insert error",
          });
        });
        insertedCount = toInsert.length - err.writeErrors.length;
      } else {
        return next(new AppError(`Bulk insert failed: ${err.message}`, 500));
      }
    }
  }

  res.status(201).json({
    success: true,
    summary: {
      total: products.length,
      created: insertedCount,
      failedCount: failed.length,
    },
    failed,
    message: `${insertedCount} product(s) created successfully. ${failed.length} failed.`,
  });
});
