/**
 * Bulk Product Upload Validation Schema
 * Validates the array of products sent from CSV/Excel bulk upload
 */
import Joi from "joi";

const bulkPricingTierSchema = Joi.object({
  minQty: Joi.number().integer().min(1).required(),
  price: Joi.number().min(0).required(),
});

const specificationsSchema = Joi.object({
  screenSize: Joi.string().trim().allow("").optional(),
  resolution: Joi.string().trim().allow("").optional(),
  screenType: Joi.string().trim().allow("").optional(),
  processor: Joi.string().trim().allow("").optional(),
  generation: Joi.string().trim().allow("").optional(),
  ram: Joi.string().trim().allow("").optional(),
  storage: Joi.string().trim().allow("").optional(),
  touch: Joi.boolean().optional().default(false),
  battery: Joi.string().trim().allow("").optional(),
  adapter: Joi.string().trim().allow("").optional(),
}).optional();

const configVariantSchema = Joi.object({
  type: Joi.string().valid("RAM", "STORAGE").required(),
  value: Joi.string().trim().required(),
  priceAdjustment: Joi.number().default(0),
});

const warrantyOptionSchema = Joi.object({
  duration: Joi.number().integer().min(1).required(),
  price: Joi.number().min(0).required(),
});

// Single product schema inside the bulk array
const singleBulkProductSchema = Joi.object({
  name: Joi.string().trim().min(2).max(200).required(),
  description: Joi.string().trim().max(2000).allow("").optional().default(""),
  images: Joi.array().items(Joi.string().uri().trim()).min(1).required(),
  brand: Joi.string().trim().allow("").optional(),
  // categoryName: resolved to ObjectId on backend
  categoryName: Joi.string().trim().required().messages({
    "any.required": "categoryName is required per product row",
  }),
  // warehouseName: resolved to ObjectId on backend
  warehouseName: Joi.string().trim().allow("").optional(),
  basePrice: Joi.number().min(0).required(),
  mrp: Joi.number().min(0).optional(),
  discountPercentage: Joi.number().min(0).max(100).optional().default(0),
  b2bPrice: Joi.number().min(0).optional(),

  gstPercentage: Joi.number().min(0).max(100).optional().default(18),
  moq: Joi.number().integer().min(1).optional().default(1),
  bulkPricing: Joi.array().items(bulkPricingTierSchema).optional().default([]),
  stock: Joi.number().integer().min(0).required(),
  soldCount: Joi.number().integer().min(0).optional().default(0),
  rating: Joi.number().min(0).max(5).optional().default(0),
  reviewsCount: Joi.number().integer().min(0).optional().default(0),
  liveViewers: Joi.number().integer().min(0).optional().default(0),
  specifications: specificationsSchema,
  configurationVariants: Joi.array()
    .items(configVariantSchema)
    .optional()
    .default([]),
  defaultWarranty: Joi.string().trim().optional().default("12 months"),
  warrantyOptions: Joi.array()
    .items(warrantyOptionSchema)
    .optional()
    .default([]),
  warrantyRenewalOptions: Joi.array()
    .items(warrantyOptionSchema)
    .optional()
    .default([]),
  shipping: Joi.object({
    freeShipping: Joi.boolean().optional().default(false),
    estimatedDeliveryDays: Joi.number().integer().min(0).optional().default(7),
  })
    .optional()
    .default({ freeShipping: false, estimatedDeliveryDays: 7 }),
  offers: Joi.object({
    exchangeOffer: Joi.boolean().optional().default(false),
    exchangeDiscountPercentage: Joi.number()
      .min(0)
      .max(100)
      .optional()
      .default(0),
    noCostEMI: Joi.boolean().optional().default(false),
    bankOffers: Joi.boolean().optional().default(false),
  })
    .optional()
    .default({}),
});

// The top-level schema — an array of products
export const bulkCreateProductSchema = Joi.object({
  products: Joi.array()
    .items(singleBulkProductSchema)
    .min(1)
    .max(500)
    .required()
    .messages({
      "array.min": "At least 1 product is required",
      "array.max": "Maximum 500 products allowed per bulk upload",
      "any.required": "products array is required",
    }),
});
