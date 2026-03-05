/**
 * Banner Model (Laptops Domain)
 * Stores promotional banner images for the home page carousel.
 * Max 5 active banners enforced at controller level.
 */
import mongoose from "mongoose";
import {
  getConnection,
  isConnected,
} from "../../../../shared/infrastructure/database/connections.js";

const bannerSchema = new mongoose.Schema(
  {
    imageUrl: {
      type: String,
      required: [true, "Banner image URL is required"],
      trim: true,
    },
    publicId: {
      type: String,
      required: [true, "Cloudinary public_id is required"],
      trim: true,
    },
    order: {
      type: Number,
      default: 0,
      min: [0, "Order cannot be negative"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Index for sorting by order
bannerSchema.index({ isActive: 1, order: 1 });

// Lazy-load the model (same pattern as Product.model.js)
let Banner = null;

const getBannerModel = () => {
  if (isConnected("laptops")) {
    try {
      const conn = getConnection("laptops");
      Banner = conn.model("Banner", bannerSchema);
    } catch (error) {
      if (!Banner) {
        Banner = mongoose.model("Banner", bannerSchema);
      }
    }
  } else {
    if (!Banner) {
      Banner = mongoose.model("Banner", bannerSchema);
    }
  }
  return Banner;
};

export default new Proxy(function () {}, {
  construct(target, args) {
    return new (getBannerModel())(...args);
  },
  get(target, prop) {
    const model = getBannerModel();
    const value = model[prop];
    if (typeof value === "function") {
      return value.bind(model);
    }
    return value;
  },
  apply(target, thisArg, args) {
    return getBannerModel().apply(thisArg, args);
  },
});
