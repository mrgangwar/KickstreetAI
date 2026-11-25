import type {
  NextApiRequest,
  NextApiResponse,
} from "next";

import mongoose from "mongoose";

import {
  getServerSession,
} from "next-auth/next";

import {
  authOptions,
} from "../auth/[...nextauth]";

import dbConnect from "@/lib/db";
import Product from "@/models/Product";
import User from "@/models/User";

/* =========================================
   CONSTANTS
========================================= */

const OBJECT_ID_REGEX =
  /^[a-fA-F0-9]{24}$/;

const PRODUCT_CATEGORIES = [
  "Men",
  "Women",
  "Children",
] as const;

const MAX_IMAGES = 5;
const MAX_VARIANTS = 30;
const MAX_VARIANT_LENGTH = 50;
const MAX_PRICE = 10000000;
const MAX_STOCK = 1000000;

/* =========================================
   TYPES
========================================= */

type ProductCategory =
  (typeof PRODUCT_CATEGORIES)[number];

interface ProductUpdate {
  name?: string;
  description?: string;
  price?: number;
  category?: ProductCategory;
  brand?: string;
  sizes?: string[];
  colors?: string[];
  stock?: number;
  images?: string[];
  isActive?: boolean;
}

type ApiResponse = {
  success: boolean;
  message?: string;
  product?: unknown;
};

class InputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputValidationError";
  }
}

/* =========================================
   HELPERS
========================================= */

function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) ===
      Object.prototype
  );
}

function validateString(
  value: unknown,
  field: string,
  min: number,
  max: number
): string {
  if (typeof value !== "string") {
    throw new InputValidationError(
      `Invalid ${field}.`
    );
  }

  const normalized = value.trim();

  if (
    normalized.length < min ||
    normalized.length > max
  ) {
    throw new InputValidationError(
      `${field} must contain ${min}–${max} characters.`
    );
  }

  return normalized;
}

function validateNumber(
  value: unknown,
  field: string,
  max: number,
  integer = false
): number {
  if (
    typeof value !== "number" &&
    typeof value !== "string"
  ) {
    throw new InputValidationError(
      `Invalid ${field}.`
    );
  }

  if (
    typeof value === "string" &&
    value.trim() === ""
  ) {
    throw new InputValidationError(
      `Invalid ${field}.`
    );
  }

  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number < 0 ||
    number > max ||
    (integer && !Number.isInteger(number))
  ) {
    throw new InputValidationError(
      `Invalid ${field}.`
    );
  }

  return number;
}

function validateStringArray(
  value: unknown,
  field: string,
  required: boolean
): string[] {
  if (
    !Array.isArray(value) ||
    value.length > MAX_VARIANTS
  ) {
    throw new InputValidationError(
      `Invalid ${field}.`
    );
  }

  const normalized = value.map(
    (item) =>
      validateString(
        item,
        field,
        1,
        MAX_VARIANT_LENGTH
      )
  );

  const unique = [
    ...new Set(normalized),
  ];

  if (
    required &&
    unique.length === 0
  ) {
    throw new InputValidationError(
      `At least one ${field} is required.`
    );
  }

  return unique;
}

function validateImageUrls(
  value: unknown
): string[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_IMAGES
  ) {
    throw new InputValidationError(
      "Provide between 1 and 5 images."
    );
  }

  const images = value.map(
    (image) => {
      if (
        typeof image !== "string" ||
        image.length > 2048
      ) {
        throw new InputValidationError(
          "Invalid image URL."
        );
      }

      const trimmed = image.trim();

      try {
        const url = new URL(trimmed);

        if (
          url.protocol !== "https:" ||
          !url.hostname ||
          url.username ||
          url.password
        ) {
          throw new Error("Invalid URL");
        }
      } catch {
        throw new InputValidationError(
          "Images must be valid HTTPS URLs."
        );
      }

      return trimmed;
    }
  );

  return [...new Set(images)];
}

function createSlug(
  name: string
): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* =========================================
   UPDATE VALIDATION
========================================= */

function validateProductUpdate(
  body: unknown
): ProductUpdate {
  if (!isPlainObject(body)) {
    throw new InputValidationError(
      "Invalid product data."
    );
  }

  const allowedFields = new Set([
    "name",
    "description",
    "price",
    "category",
    "brand",
    "sizes",
    "colors",
    "stock",
    "images",
    "isActive",
  ]);

  const keys = Object.keys(body);

  if (keys.length === 0) {
    throw new InputValidationError(
      "No product fields provided."
    );
  }

  for (const key of keys) {
    if (!allowedFields.has(key)) {
      throw new InputValidationError(
        `Field ${key} cannot be updated.`
      );
    }
  }

  const update: ProductUpdate = {};

  if (body.name !== undefined) {
    update.name = validateString(
      body.name,
      "Product name",
      2,
      150
    );
  }

  if (body.description !== undefined) {
    update.description =
      validateString(
        body.description,
        "Description",
        10,
        5000
      );
  }

  if (body.price !== undefined) {
    update.price = validateNumber(
      body.price,
      "price",
      MAX_PRICE
    );
  }

  if (body.category !== undefined) {
    if (
      typeof body.category !== "string" ||
      !PRODUCT_CATEGORIES.some(
        (category) =>
          category === body.category
      )
    ) {
      throw new InputValidationError(
        "Category must be Men, Women, or Children."
      );
    }

    update.category =
      body.category as ProductCategory;
  }

  if (body.brand !== undefined) {
    update.brand = validateString(
      body.brand,
      "Brand",
      1,
      100
    );
  }

  if (body.sizes !== undefined) {
    update.sizes = validateStringArray(
      body.sizes,
      "size",
      true
    );
  }

  if (body.colors !== undefined) {
    update.colors = validateStringArray(
      body.colors,
      "color",
      true
    );
  }

  if (body.stock !== undefined) {
    update.stock = validateNumber(
      body.stock,
      "stock",
      MAX_STOCK,
      true
    );
  }

  if (body.images !== undefined) {
    update.images = validateImageUrls(
      body.images
    );
  }

  if (body.isActive !== undefined) {
    if (
      typeof body.isActive !== "boolean"
    ) {
      throw new InputValidationError(
        "isActive must be a boolean."
      );
    }

    update.isActive =
      body.isActive;
  }

  return update;
}

/* =========================================
   ADMIN AUTHORIZATION
========================================= */

async function isCurrentAdmin(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<boolean> {
  const session =
    await getServerSession(
      req,
      res,
      authOptions
    );

  const userId =
    session?.user?.id;

  if (
    typeof userId !== "string" ||
    !OBJECT_ID_REGEX.test(userId)
  ) {
    return false;
  }

  const admin = await User.exists({
    _id: userId,
    role: "admin",
    isVerified: true,
  });

  return Boolean(admin);
}

/* =========================================
   API HANDLER
========================================= */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  res.setHeader(
    "X-Content-Type-Options",
    "nosniff"
  );

  /* =====================================
     METHOD VALIDATION
  ===================================== */

  if (
    req.method !== "GET" &&
    req.method !== "PUT" &&
    req.method !== "DELETE"
  ) {
    res.setHeader(
      "Allow",
      "GET, PUT, DELETE"
    );

    return res.status(405).json({
      success: false,
      message: "Method not allowed.",
    });
  }

  /* =====================================
     PRODUCT ID VALIDATION
  ===================================== */

  const { id } = req.query;

  if (
    typeof id !== "string" ||
    !OBJECT_ID_REGEX.test(id) ||
    !mongoose.isValidObjectId(id)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid product ID.",
    });
  }

  try {
    await dbConnect();

    /* ===================================
       ADMIN AUTHORIZATION
    =================================== */

    const authorized =
      await isCurrentAdmin(
        req,
        res
      );

    if (!authorized) {
      return res.status(403).json({
        success: false,
        message: "Admin access required.",
      });
    }

    /* ===================================
       GET PRODUCT
    =================================== */

    if (req.method === "GET") {
      const product =
        await Product.findById(
          id
        ).lean();

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found.",
        });
      }

      return res.status(200).json({
        success: true,
        product,
      });
    }

    /* ===================================
       UPDATE PRODUCT
    =================================== */

    if (req.method === "PUT") {
      const update =
        validateProductUpdate(
          req.body
        );

      let slug: string | undefined;

      if (update.name !== undefined) {
        slug = createSlug(
          update.name
        );

        if (!slug) {
          throw new InputValidationError(
            "Invalid product name for slug generation."
          );
        }

        const existing =
          await Product.findOne({
            slug,
            _id: {
              $ne: id,
            },
          })
            .select("_id")
            .lean();

        if (existing) {
          return res.status(409).json({
            success: false,
            message:
              "A product with this slug already exists.",
          });
        }
      }

      const updateData: Record<
        string,
        unknown
      > = {
        ...update,
      };

      if (slug !== undefined) {
        updateData.slug = slug;
      }

      const product =
        await Product.findByIdAndUpdate(
          id,
          {
            $set: updateData,
          },
          {
            new: true,
            runValidators: true,
            context: "query",
          }
        );

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found.",
        });
      }

      return res.status(200).json({
        success: true,
        product,
      });
    }

    /* ===================================
       SOFT DELETE PRODUCT
    =================================== */

    const product =
      await Product.findByIdAndUpdate(
        id,
        {
          $set: {
            isActive: false,
          },
        },
        {
          new: true,
          runValidators: true,
        }
      );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    /*
     * Soft delete keeps the product
     * record and its image URLs.
     *
     * No Cloudinary cleanup is
     * performed because images may
     * still be referenced elsewhere.
     */

    return res.status(200).json({
      success: true,
      message:
        "Product deactivated successfully.",
      product,
    });
  } catch (error: unknown) {
    /* ===================================
       INPUT VALIDATION
    =================================== */

    if (
      error instanceof
      InputValidationError
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    /* ===================================
       DUPLICATE KEY
    =================================== */

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Product slug already exists.",
      });
    }

    /* ===================================
       MONGOOSE VALIDATION
    =================================== */

    if (
      error instanceof
        mongoose.Error.ValidationError
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid product data.",
      });
    }

    /* ===================================
       SERVER ERROR
    =================================== */

    console.error(
      "ADMIN_PRODUCT_ID_API_ERROR:",
      error instanceof Error
        ? error.name
        : "UnknownError"
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to process product request.",
    });
  }
}