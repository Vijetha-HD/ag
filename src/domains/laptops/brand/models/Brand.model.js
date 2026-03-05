/**
 * Brand Model (Laptops Domain)
 * Defines brand schema for products
 */
import mongoose from 'mongoose';
import { getConnection, isConnected } from '../../../../shared/infrastructure/database/connections.js';

const brandSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Brand name is required'],
            trim: true,
            unique: true,
        },
        slug: {
            type: String,
            trim: true,
            unique: true,
            lowercase: true,
        },
        logo: {
            type: String,
            trim: true,
            default: '',
        },
    },
    {
        timestamps: true,
    }
);

// Generate slug from name
brandSchema.pre('save', function (next) {
    if (this.isModified('name') && !this.slug) {
        this.slug = this.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
    }
    next();
});

// Lazy-load the model
let Brand = null;

const getBrandModel = () => {
    if (isConnected('laptops')) {
        try {
            const conn = getConnection('laptops');
            if (conn.models.Brand) {
                Brand = conn.models.Brand;
            } else {
                Brand = conn.model('Brand', brandSchema);
            }
        } catch (error) {
            if (!Brand) {
                Brand = mongoose.model('Brand', brandSchema);
            }
        }
    } else {
        if (!Brand) {
            Brand = mongoose.model('Brand', brandSchema);
        }
    }
    return Brand;
};

export default new Proxy(function () { }, {
    construct(target, args) {
        return new (getBrandModel())(...args);
    },
    get(target, prop) {
        const model = getBrandModel();
        const value = model[prop];
        if (typeof value === 'function') {
            return value.bind(model);
        }
        return value;
    },
    apply(target, thisArg, args) {
        return getBrandModel().apply(thisArg, args);
    }
});
