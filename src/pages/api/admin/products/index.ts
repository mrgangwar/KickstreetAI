
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
} from "../../auth/[...nextauth]";

import dbConnect from "@/lib/db";
import Product from "@/models/Product";
import User from "@/models/User";
import cloudinary from "@/lib/cloudinary";

/* =========================================
   API CONFIGURATION
========================================= */

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "15mb",
    },
  },
};

/* =========================================
   CONSTANTS
========================================= */

const OBJECT_ID_REGEX =
  /^[a-fA-F0-9]{24}$/;

const CATEGORIES = [
  "Men",
  "Women",
  "Children",
] as const;

type ProductCategory =
  (typeof CATEGORIES)[number];

const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES =
  2 * 1024 * 1024;

const MAX_NAME_LENGTH = 150;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_BRAND_LENGTH = 100;

const MAX_VARIANTS = 30;
const MAX_VARIANT_LENGTH = 50;

const MAX_PRICE = 10000000;
const MAX_STOCK = 1000000;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_PAGE = 10000;

const IMAGE_REGEX =
  /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

/* =========================================
   TYPES
========================================= */

interface ProductInput {
  name: string;
  description: string;
  brand: string;
  price: number;
  category: ProductCategory;
  sizes: string[];
  colors: string[];
  stock: number;
  images: string[];
  isActive: boolean;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

type ApiResponse =
  | {
      success: true;
      product: unknown;
    }
  | {
      success: true;
      products: unknown[];
      pagination: Pagination;
    }
  | {
      success: false;
      message: string;
    };

class InputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputValidationError";
  }
}

/* =========================================
   VALIDATION HELPERS
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

function requiredString(
  value: unknown,
  field: string,
  min: number,
  max: number
): string {
  if (typeof value !== "string") {
    throw new InputValidationError(
      `${field} is required.`
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
      requiredString(
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

function validateImages(
  value: unknown
): string[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_IMAGES
  ) {
    throw new InputValidationError(
      `Provide between 1 and ${MAX_IMAGES} images.`
    );
  }

  return value.map((image) => {
    if (
      typeof image !== "string"
    ) {
      throw new InputValidationError(
        "Invalid image data."
      );
    }

    const match =
      IMAGE_REGEX.exec(image);

    if (!match) {
      throw new InputValidationError(
        "Only base64 JPEG, PNG and WebP images are supported."
      );
    }

    const encoded = match[2];

    const estimatedBytes =
      Math.floor(
        (encoded.length * 3) / 4
      ) -
      (encoded.endsWith("==")
        ? 2
        : encoded.endsWith("=")
          ? 1
          : 0);

    if (
      estimatedBytes <= 0 ||
      estimatedBytes >
        MAX_IMAGE_BYTES
    ) {
      throw new InputValidationError(
        "Each image must be 2 MB or smaller."
      );
    }

    return image;
  });
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
   PRODUCT VALIDATION
========================================= */

function validateProductInput(
  body: unknown
): ProductInput {
  if (!isPlainObject(body)) {
    throw new InputValidationError(
      "Invalid product data."
    );
  }

  const name = requiredString(
    body.name,
    "Product name",
    2,
    MAX_NAME_LENGTH
  );

  const description =
    requiredString(
      body.description,
      "Description",
      10,
      MAX_DESCRIPTION_LENGTH
    );

  const brand = requiredString(
    body.brand,
    "Brand",
    1,
    MAX_BRAND_LENGTH
  );

  if (
    typeof body.category !== "string" ||
    !CATEGORIES.some(
      (category) =>
        category === body.category
    )
  ) {
    throw new InputValidationError(
      "Category must be Men, Women, or Children."
    );
  }

  if (
    body.isActive !== undefined &&
    typeof body.isActive !== "boolean"
  ) {
    throw new InputValidationError(
      "isActive must be a boolean."
    );
  }

  return {
    name,
    description,
    brand,

    price: validateNumber(
      body.price,
      "price",
      MAX_PRICE
    ),

    category:
      body.category as ProductCategory,

    sizes: validateStringArray(
      body.sizes,
      "Sizes",
      true
    ),

    colors: validateStringArray(
      body.colors,
      "Colors",
      true
    ),

    stock: validateNumber(
      body.stock,
      "stock",
      MAX_STOCK,
      true
    ),

    images: validateImages(
      body.images
    ),

    isActive:
      body.isActive === undefined
        ? true
        : body.isActive,
  };
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

  const admin =
    await User.exists({
      _id: userId,
      role: "admin",
      isVerified: true,
    });

  return Boolean(admin);
}

/* =========================================
   SAME-ORIGIN CHECK
========================================= */

function isAllowedOrigin(
  req: NextApiRequest
): boolean {
  const origin =
    req.headers.origin;

  if (!origin) {
    return false;
  }

  try {
    const expectedOrigin =
      process.env.NEXTAUTH_URL;

    if (!expectedOrigin) {
      return false;
    }

    return (
      new URL(origin).origin ===
      new URL(expectedOrigin).origin
    );
  } catch {
    return false;
  }
}

/* =========================================
   CLOUDINARY CLEANUP
========================================= */

async function cleanupUploads(
  publicIds: string[]
): Promise<void> {
  if (publicIds.length === 0) {
    return;
  }

  const results =
    await Promise.allSettled(
      publicIds.map(
        (publicId) =>
          cloudinary.uploader.destroy(
            publicId,
            {
              resource_type: "image",
            }
          )
      )
    );

  const failures =
    results.filter(
      (result) =>
        result.status ===
          "rejected" ||
        (
          result.status ===
            "fulfilled" &&
          result.value.result !==
            "ok" &&
          result.value.result !==
            "not found"
        )
    );

  if (failures.length > 0) {
    console.error(
      "PRODUCT_IMAGE_CLEANUP_FAILED:",
      failures.length
    );
  }
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
    req.method !== "POST"
  ) {
    res.setHeader(
      "Allow",
      "GET, POST"
    );

    return res.status(405).json({
      success: false,
      message: "Method not allowed.",
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
        message:
          "Admin access required.",
      });
    }

    /* ===================================
       GET ADMIN PRODUCTS
    =================================== */

    if (req.method === "GET") {
      const page = Math.min(
        MAX_PAGE,
        Math.max(
          1,
          Number(req.query.page) || 1
        )
      );

      const limit = Math.min(
        MAX_LIMIT,
        Math.max(
          1,
          Number(req.query.limit) ||
            DEFAULT_LIMIT
        )
      );

      if (
        !Number.isSafeInteger(page) ||
        !Number.isSafeInteger(limit)
      ) {
        throw new InputValidationError(
          "Invalid pagination."
        );
      }

      const total =
        await Product.countDocuments(
          {}
        );

      const totalPages =
        Math.ceil(
          total / limit
        );

      const currentPage =
        totalPages > 0
          ? Math.min(
              page,
              totalPages
            )
          : 1;

      const documents =
        await Product.find({})
          .sort({
            createdAt: -1,
            _id: -1,
          })
          .skip(
            (currentPage - 1) *
              limit
          )
          .limit(limit)
          .lean();

      const products =
        documents.map(
          (document) => ({
            ...document,
            _id: String(
              document._id
            ),
          })
        );

      const pagination: Pagination = {
        page: currentPage,
        limit,
        total,
        totalPages,
        hasNextPage:
          currentPage < totalPages,
        hasPrevPage:
          currentPage > 1,
      };

      return res.status(200).json({
        success: true,
        products,
        pagination,
      });
    }

    /* ===================================
       CSRF ORIGIN CHECK
    =================================== */

    if (!isAllowedOrigin(req)) {
      return res.status(403).json({
        success: false,
        message:
          "Request origin is not allowed.",
      });
    }

    /* ===================================
       VALIDATE PRODUCT
    =================================== */

    const input =
      validateProductInput(
        req.body
      );

    const slug =
      createSlug(input.name);

    if (!slug) {
      throw new InputValidationError(
        "Invalid product name for slug generation."
      );
    }

    /* ===================================
       DUPLICATE SLUG
    =================================== */

    const existing =
      await Product.exists({
        slug,
      });

    if (existing) {
      return res.status(409).json({
        success: false,
        message:
          "A product with this slug already exists.",
      });
    }

    /* ===================================
       UPLOAD IMAGES
    =================================== */

    const uploadedImageUrls:
      string[] = [];

    const uploadedPublicIds:
      string[] = [];

    try {
      for (
        const image of input.images
      ) {
        const result =
          await cloudinary.uploader.upload(
            image,
            {
              folder:
                "kickstreet_products",

              resource_type:
                "image",

              transformation: [
                {
                  width: 1000,
                  crop: "limit",
                  quality: "auto",
                  fetch_format: "auto",
                },
              ],
            }
          );

        if (
          !result.secure_url ||
          !result.public_id
        ) {
          throw new Error(
            "Cloudinary upload returned incomplete data."
          );
        }

        uploadedImageUrls.push(
          result.secure_url
        );

        uploadedPublicIds.push(
          result.public_id
        );
      }

      /* =================================
         CREATE PRODUCT
      ================================= */

      const product =
        await Product.create({
          name: input.name,
          slug,
          description:
            input.description,
          brand: input.brand,
          price: input.price,
          category:
            input.category,
          sizes: input.sizes,
          colors: input.colors,
          stock: input.stock,
          images:
            uploadedImageUrls,
          isActive:
            input.isActive,
        });

      return res.status(201).json({
        success: true,
        product,
      });
    } catch (error: unknown) {
      await cleanupUploads(
        uploadedPublicIds
      );

      throw error;
    }
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

    console.error(
      "ADMIN_PRODUCTS_API_ERROR:",
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
