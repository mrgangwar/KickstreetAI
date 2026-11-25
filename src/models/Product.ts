import mongoose, {
  Schema,
  type Document,
  type Model,
} from "mongoose";

/* =========================================
   TYPES
========================================= */

export type ProductCategory =
  | "Men"
  | "Women"
  | "Children";

export interface IRecommendationFeatures {
  comfort: number;
  cushioning: number;
  durability: number;
  breathability: number;
  flexibility: number;
  grip: number;
  style: number;
  valueForMoney: number;
}

export interface IProductSpecifications {
  upperMaterial: string;
  soleMaterial: string;
  closureType: string;
  fit: string;
  weightGrams?: number | null;
  waterproof: boolean;
  breathable: boolean;
  cushioned: boolean;
  lightweight: boolean;
  slipResistant: boolean;
}

export interface IShoppingOffer {
  platform: string;
  sellerName?: string;
  productUrl: string;
  affiliateUrl?: string;
  price: number;
  originalPrice?: number | null;
  currency?: string;
  isAvailable?: boolean;
}

export interface IProduct extends Document {
  name: string;
  slug: string;
  description: string;
  price: number;
  originalPrice?: number;
  category: ProductCategory;
  brand: string;
  sizes: string[];
  colors: string[];
  stock: number;
  images: string[];
  ratings: number;
  numOfReviews: number;
  isActive: boolean;

  /* SoleMatch AI Feature Extensions */
  gender: string;
  subCategory: string;
  useCases: string[];
  recommendationFeatures: IRecommendationFeatures;
  specifications: IProductSpecifications;
  shoppingOffers: IShoppingOffer[];
  pros: string[];
  cons: string[];

  createdAt: Date;
  updatedAt: Date;
}

/* =========================================
   CONSTANTS
========================================= */

const PRODUCT_CATEGORIES: ProductCategory[] = [
  "Men",
  "Women",
  "Children",
];

const MAX_NAME_LENGTH = 150;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_BRAND_LENGTH = 100;
const MAX_VARIANTS = 30;
const MAX_VARIANT_LENGTH = 50;
const MAX_IMAGES = 10;
const MAX_PRICE = 10000000;
const MAX_STOCK = 1000000;

/* =========================================
   HELPERS
========================================= */

function createSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeStringArray(values: string[]): string[] {
  if (!Array.isArray(values)) {
    return values;
  }

  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ];
}

function validateStringArray(values: unknown, required: boolean): boolean {
  if (!Array.isArray(values)) {
    return false;
  }

  if (values.length > MAX_VARIANTS || (required && values.length === 0)) {
    return false;
  }

  return values.every(
    (value) =>
      typeof value === "string" &&
      value.trim().length > 0 &&
      value.trim().length <= MAX_VARIANT_LENGTH
  );
}

function isValidImageUrl(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    return false;
  }

  if (value.startsWith("/") || value.startsWith("data:image/")) {
    return true;
  }

  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      Boolean(url.hostname)
    );
  } catch {
    return false;
  }
}

function validateImages(values: unknown): boolean {
  if (!Array.isArray(values)) {
    return false;
  }
  if (values.length === 0) {
    return true;
  }
  return values.length <= MAX_IMAGES && values.every(isValidImageUrl);
}

/* =========================================
   SUB-SCHEMAS
========================================= */

const RecommendationFeaturesSchema = new Schema<IRecommendationFeatures>(
  {
    comfort: { type: Number, min: 0, max: 10, default: 7 },
    cushioning: { type: Number, min: 0, max: 10, default: 7 },
    durability: { type: Number, min: 0, max: 10, default: 8 },
    breathability: { type: Number, min: 0, max: 10, default: 7 },
    flexibility: { type: Number, min: 0, max: 10, default: 7 },
    grip: { type: Number, min: 0, max: 10, default: 7 },
    style: { type: Number, min: 0, max: 10, default: 8 },
    valueForMoney: { type: Number, min: 0, max: 10, default: 8 },
  },
  { _id: false }
);

const SpecificationsSchema = new Schema<IProductSpecifications>(
  {
    upperMaterial: { type: String, default: "mesh", trim: true },
    soleMaterial: { type: String, default: "rubber", trim: true },
    closureType: { type: String, default: "lace-up", trim: true },
    fit: { type: String, default: "regular", trim: true },
    weightGrams: { type: Number, default: 350 },
    waterproof: { type: Boolean, default: false },
    breathable: { type: Boolean, default: true },
    cushioned: { type: Boolean, default: true },
    lightweight: { type: Boolean, default: true },
    slipResistant: { type: Boolean, default: true },
  },
  { _id: false }
);

const ShoppingOfferSchema = new Schema<IShoppingOffer>(
  {
    platform: { type: String, required: true, trim: true },
    sellerName: { type: String, default: "", trim: true },
    productUrl: { type: String, required: true, trim: true },
    affiliateUrl: { type: String, default: "", trim: true },
    price: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, default: null },
    currency: { type: String, default: "INR" },
    isAvailable: { type: Boolean, default: true },
  },
  { _id: false }
);

/* =========================================
   PRODUCT SCHEMA
========================================= */

const ProductSchema = new Schema<IProduct>(
  {
    name: {
      type: String,
      required: [true, "Product name is required."],
      trim: true,
      minlength: [2, "Product name must contain at least 2 characters."],
      maxlength: [MAX_NAME_LENGTH, "Product name cannot exceed 150 characters."],
      unique: true,
    },

    slug: {
      type: String,
      lowercase: true,
      trim: true,
      required: [true, "Product slug is required."],
      unique: true,
      maxlength: [180, "Product slug cannot exceed 180 characters."],
    },

    description: {
      type: String,
      required: [true, "Product description is required."],
      trim: true,
      minlength: [10, "Product description must contain at least 10 characters."],
      maxlength: [MAX_DESCRIPTION_LENGTH, "Product description cannot exceed 5000 characters."],
    },

    price: {
      type: Number,
      required: [true, "Product price is required."],
      min: [0, "Product price cannot be negative."],
      max: [MAX_PRICE, "Product price cannot exceed 10000000."],
    },

    originalPrice: {
      type: Number,
      default: null,
      min: 0,
    },

    category: {
      type: String,
      required: [true, "Product category is required."],
      enum: {
        values: PRODUCT_CATEGORIES,
        message: "Invalid product category.",
      },
    },

    brand: {
      type: String,
      required: [true, "Product brand is required."],
      trim: true,
      minlength: [1, "Product brand is required."],
      maxlength: [MAX_BRAND_LENGTH, "Product brand cannot exceed 100 characters."],
    },

    sizes: {
      type: [{ type: String, trim: true }],
      required: [true, "Product sizes are required."],
      validate: {
        validator: (value) => validateStringArray(value, true),
        message: "Provide between 1 and 30 valid sizes.",
      },
    },

    colors: {
      type: [{ type: String, trim: true, lowercase: true }],
      required: [true, "Product colors are required."],
      validate: {
        validator: (value) => validateStringArray(value, true),
        message: "Provide between 1 and 30 valid colors.",
      },
    },

    stock: {
      type: Number,
      required: [true, "Product stock is required."],
      min: [0, "Stock cannot be negative."],
      max: [MAX_STOCK, "Stock cannot exceed 1000000."],
      default: 0,
    },

    images: {
      type: [{ type: String, trim: true }],
      default: [],
      validate: {
        validator: validateImages,
        message: "Provide valid image URLs.",
      },
    },

    ratings: {
      type: Number,
      default: 0,
      min: [0, "Rating cannot be negative."],
      max: [5, "Rating cannot exceed 5."],
    },

    numOfReviews: {
      type: Number,
      default: 0,
      min: [0, "Review count cannot be negative."],
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    /* =========================================
       SOLEMATCH AI EXTENSIONS
    ========================================= */

    gender: {
      type: String,
      enum: ["men", "women", "kids", "unisex"],
      default: function (this: IProduct) {
        if (this.category === "Men") return "men";
        if (this.category === "Women") return "women";
        if (this.category === "Children") return "kids";
        return "unisex";
      },
      index: true,
    },

    subCategory: {
      type: String,
      default: "sneakers",
      trim: true,
      lowercase: true,
      index: true,
    },

    useCases: {
      type: [{ type: String, trim: true, lowercase: true }],
      default: ["daily-wear", "casual", "sneakers"],
    },

    recommendationFeatures: {
      type: RecommendationFeaturesSchema,
      default: () => ({
        comfort: 7,
        cushioning: 7,
        durability: 8,
        breathability: 7,
        flexibility: 7,
        grip: 7,
        style: 8,
        valueForMoney: 8,
      }),
    },

    specifications: {
      type: SpecificationsSchema,
      default: () => ({
        upperMaterial: "mesh",
        soleMaterial: "rubber",
        closureType: "lace-up",
        fit: "regular",
        weightGrams: 350,
        waterproof: false,
        breathable: true,
        cushioned: true,
        lightweight: true,
        slipResistant: true,
      }),
    },

    shoppingOffers: {
      type: [ShoppingOfferSchema],
      default: [],
    },

    pros: {
      type: [String],
      default: ["Premium build quality", "Comfortable all-day wear", "Sleek and versatile styling"],
    },

    cons: {
      type: [String],
      default: ["Requires regular cleaning to maintain finish"],
    },
  },
  {
    timestamps: true,
    versionKey: "__v",
    strict: true,
  }
);

/* =========================================
   SLUG GENERATION & PRE-VALIDATION
========================================= */

ProductSchema.pre("validate", function () {
  if (this.isNew || this.isModified("name")) {
    const slug = createSlug(this.name || "");
    if (!slug) {
      this.invalidate("slug", "Product name cannot generate a valid slug.");
      return;
    }
    this.slug = slug;
  }

  if (!this.gender) {
    if (this.category === "Men") this.gender = "men";
    else if (this.category === "Women") this.gender = "women";
    else if (this.category === "Children") this.gender = "kids";
    else this.gender = "unisex";
  }

  if (this.sizes) {
    this.sizes = normalizeStringArray(this.sizes);
  }

  if (this.colors) {
    this.colors = normalizeStringArray(this.colors);
  }
});

/* =========================================
   INDEXES
========================================= */

ProductSchema.index({ category: 1, isActive: 1, createdAt: -1 });
ProductSchema.index({ gender: 1, isActive: 1 });
ProductSchema.index({ subCategory: 1, isActive: 1 });
ProductSchema.index({ isActive: 1, price: 1 });
ProductSchema.index({ brand: 1, isActive: 1 });
ProductSchema.index({ createdAt: -1 });

/* =========================================
   MODEL EXPORT
========================================= */

const Product: Model<IProduct> =
  (mongoose.models.Product as Model<IProduct> | undefined) ??
  mongoose.model<IProduct>("Product", ProductSchema);

export default Product;
