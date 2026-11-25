
import type {
  NextApiRequest,
  NextApiResponse,
} from "next";

import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";

import mongoose from "mongoose";

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
      sizeLimit: "10mb",
    },
  },
};

/* =========================================
   TYPES
========================================= */

type ApiResponse = {
  success: boolean;
  message?: string;
  product?: unknown;
};

type Category = "Men" | "Women" | "Children";

type UpdateData = {
  name?: string;
  slug?: string;
  description?: string;
  price?: number;
  category?: Category;
  sizes?: string[];
  colors?: string[];
  stock?: number;
  images?: string[];
  isActive?: boolean;
};

/* =========================================
   CONSTANTS
========================================= */

const CATEGORIES: readonly Category[] = [
  "Men",
  "Women",
  "Children",
];

const MAX_IMAGES = 8;

/* =========================================
   HELPERS
========================================= */

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function createSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseNumber(
  value: unknown
): number | null {
  if (
    typeof value !== "number" &&
    typeof value !== "string"
  ) {
    return null;
  }

  if (
    typeof value === "string" &&
    value.trim() === ""
  ) {
    return null;
  }

  const result = Number(value);

  return Number.isFinite(result)
    ? result
    : null;
}

function normalizeArray(
  value: unknown,
  uppercase = false
): string[] | null {
  if (
    !Array.isArray(value) ||
    !value.every(
      (item) => typeof item === "string"
    )
  ) {
    return null;
  }

  const normalized = value
    .map((item: string) => item.trim())
    .filter(Boolean)
    .map((item: string) =>
      uppercase
        ? item.toUpperCase()
        : item.toLowerCase()
    );

  return [...new Set(normalized)];
}

function isValidImage(
  image: string
): boolean {
  if (
    image.startsWith("https://")
  ) {
    return image.length <= 2048;
  }

  return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(
    image
  );
}

/* =========================================
   VALIDATE UPDATE BODY
========================================= */

function validateUpdate(
  body: unknown
):
  | {
      success: true;
      data: UpdateData;
    }
  | {
      success: false;
      message: string;
    } {
  if (!isRecord(body)) {
    return {
      success: false,
      message: "Invalid request body.",
    };
  }

  const allowedFields = new Set([
    "name",
    "description",
    "price",
    "category",
    "sizes",
    "colors",
    "stock",
    "images",
    "isActive",
  ]);

  const keys = Object.keys(body);

  if (keys.length === 0) {
    return {
      success: false,
      message: "No update fields provided.",
    };
  }

  if (
    keys.some(
      (key) => !allowedFields.has(key)
    )
  ) {
    return {
      success: false,
      message: "Unsupported product field.",
    };
  }

  const data: UpdateData = {};

  /* NAME */

  if (body.name !== undefined) {
    if (
      typeof body.name !== "string"
    ) {
      return {
        success: false,
        message: "Invalid product name.",
      };
    }

    const name = body.name.trim();

    if (
      name.length < 2 ||
      name.length > 150
    ) {
      return {
        success: false,
        message:
          "Product name must contain 2–150 characters.",
      };
    }

    const slug = createSlug(name);

    if (!slug) {
      return {
        success: false,
        message:
          "Product name cannot generate a valid slug.",
      };
    }

    data.name = name;
    data.slug = slug;
  }

  /* DESCRIPTION */

  if (
    body.description !== undefined
  ) {
    if (
      typeof body.description !== "string"
    ) {
      return {
        success: false,
        message: "Invalid description.",
      };
    }

    const description =
      body.description.trim();

    if (
      description.length < 10 ||
      description.length > 10000
    ) {
      return {
        success: false,
        message:
          "Description must contain 10–10000 characters.",
      };
    }

    data.description = description;
  }

  /* PRICE */

  if (body.price !== undefined) {
    const price = parseNumber(
      body.price
    );

    if (
      price === null ||
      price < 0
    ) {
      return {
        success: false,
        message:
          "Price must be a non-negative number.",
      };
    }

    data.price = price;
  }

  /* CATEGORY */

  if (
    body.category !== undefined
  ) {
    if (
      !CATEGORIES.some(
        (category) =>
          category === body.category
      )
    ) {
      return {
        success: false,
        message:
          "Invalid product category.",
      };
    }

    data.category =
      body.category as Category;
  }

  /* STOCK */

  if (body.stock !== undefined) {
    const stock = parseNumber(
      body.stock
    );

    if (
      stock === null ||
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      return {
        success: false,
        message:
          "Stock must be a non-negative whole number.",
      };
    }

    data.stock = stock;
  }

  /* SIZES */

  if (body.sizes !== undefined) {
    const sizes = normalizeArray(
      body.sizes,
      true
    );

    if (
      !sizes ||
      sizes.length === 0
    ) {
      return {
        success: false,
        message:
          "At least one shoe size is required.",
      };
    }

    data.sizes = sizes;
  }

  /* COLORS */

  if (body.colors !== undefined) {
    const colors = normalizeArray(
      body.colors
    );

    if (
      !colors ||
      colors.length === 0
    ) {
      return {
        success: false,
        message:
          "At least one product color is required.",
      };
    }

    data.colors = colors;
  }

  /* IMAGES */

  if (body.images !== undefined) {
    if (
      !Array.isArray(body.images) ||
      body.images.length < 1 ||
      body.images.length > MAX_IMAGES ||
      !body.images.every(
        (image): image is string =>
          typeof image === "string" &&
          isValidImage(image)
      )
    ) {
      return {
        success: false,
        message:
          "Provide 1–8 valid product images.",
      };
    }

    data.images = body.images;
  }

  /* VISIBILITY */

  if (
    body.isActive !== undefined
  ) {
    if (
      typeof body.isActive !== "boolean"
    ) {
      return {
        success: false,
        message:
          "isActive must be a boolean.",
      };
    }

    data.isActive = body.isActive;
  }

  return {
    success: true,
    data,
  };
}

/* =========================================
   CLOUDINARY HELPERS
========================================= */

/*
  Only attempt cleanup for URLs that
  match the configured Cloudinary
  cloud and standard upload paths.

  External image URLs and data URLs
  must never be passed to destroy().
*/

function getCloudinaryPublicId(
  imageUrl: string
): string | null {
  try {
    const url = new URL(imageUrl);

    if (
      url.protocol !== "https:" ||
      url.hostname !== "res.cloudinary.com"
    ) {
      return null;
    }

    const cloudName =
      process.env.CLOUDINARY_CLOUD_NAME;

    if (!cloudName) {
      return null;
    }

    const prefix =
      `/${cloudName}/image/upload/`;

    if (!url.pathname.startsWith(prefix)) {
      return null;
    }

    let assetPath =
      url.pathname.slice(
        prefix.length
      );

    /*
      Remove optional transformation
      segments before the version.

      This supports standard Cloudinary
      URLs containing /v1234567890/.
    */

    const segments =
      assetPath.split("/");

    const versionIndex =
      segments.findIndex(
        (segment) =>
          /^v\d+$/.test(segment)
      );

    if (versionIndex >= 0) {
      assetPath = segments
        .slice(versionIndex + 1)
        .join("/");
    } else {
      /*
        Without a version marker,
        transformed URLs are ambiguous.
        Skip deletion rather than guess.
      */
      return null;
    }

    const publicId =
      decodeURIComponent(assetPath)
        .replace(
          /\.(jpg|jpeg|png|webp|gif|avif)$/i,
          ""
        );

    if (
      !publicId ||
      publicId.includes("..") ||
      publicId.startsWith("/")
    ) {
      return null;
    }

    return publicId;
  } catch {
    return null;
  }
}

async function cleanupCloudinaryImages(
  images: string[]
): Promise<void> {
  for (const imageUrl of images) {
    const publicId =
      getCloudinaryPublicId(imageUrl);

    if (!publicId) {
      continue;
    }

    try {
      await cloudinary.uploader.destroy(
        publicId,
        {
          resource_type: "image",
          invalidate: true,
        }
      );
    } catch (error: unknown) {
      /*
        Cleanup failure must be logged
        without exposing credentials.
      */

      console.error(
        "CLOUDINARY_CLEANUP_FAILED:",
        error instanceof Error
          ? error.name
          : "UnknownError"
      );
    }
  }
}

/* =========================================
   ERROR HANDLER
========================================= */

function handleError(
  error: unknown,
  res: NextApiResponse<ApiResponse>
) {
  if (
    isRecord(error) &&
    error.code === 11000
  ) {
    return res.status(409).json({
      success: false,
      message:
        "A product with this name or slug already exists.",
    });
  }

  if (
    error instanceof mongoose.Error.ValidationError
  ) {
    const firstError =
      Object.values(
        error.errors
      )[0];

    return res.status(400).json({
      success: false,
      message:
        firstError?.message ||
        "Invalid product data.",
    });
  }

  console.error(
    "ADMIN_PRODUCT_ID_API_ERROR:",
    error instanceof Error
      ? error.name
      : "UnknownError"
  );

  return res.status(500).json({
    success: false,
    message:
      "Internal server error. Please try again.",
  });
}

/* =========================================
   API HANDLER
========================================= */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  /* ALLOWED METHODS */

  if (
    req.method !== "GET" &&
    req.method !== "PUT" &&
    req.method !== "DELETE"
  ) {
    res.setHeader(
      "Allow",
      ["GET", "PUT", "DELETE"]
    );

    return res.status(405).json({
      success: false,
      message:
        `Method ${req.method} not allowed.`,
    });
  }

  /* AUTHENTICATION */

  const session =
    await getServerSession(
      req,
      res,
      authOptions
    );

  if (!session?.user?.email) {
    return res.status(401).json({
      success: false,
      message:
        "Authentication required.",
    });
  }

  /* PRODUCT ID */

  const { id } = req.query;

  if (
    typeof id !== "string" ||
    !mongoose.isValidObjectId(id)
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Invalid product ID.",
    });
  }

  try {
    await dbConnect();

    /* VERIFY CURRENT ADMIN ROLE */

    const admin =
      await User.findOne({
        email:
          session.user.email
            .toLowerCase()
            .trim(),
        role: "admin",
        isVerified: true,
      })
        .select("_id")
        .lean();

    if (!admin) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. Admin only.",
      });
    }

    /* ===================================
       GET PRODUCT
    =================================== */

    if (req.method === "GET") {
      const product =
        await Product.findById(id)
          .lean();

      if (!product) {
        return res.status(404).json({
          success: false,
          message:
            "Product not found.",
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
      const validation =
        validateUpdate(req.body);

      if (!validation.success) {
        return res.status(400).json({
          success: false,
          message:
            validation.message,
        });
      }

      const updatedProduct =
        await Product.findByIdAndUpdate(
          id,
          {
            $set: validation.data,
          },
          {
            new: true,
            runValidators: true,
          }
        );

      if (!updatedProduct) {
        return res.status(404).json({
          success: false,
          message:
            "Product not found.",
        });
      }

      return res.status(200).json({
        success: true,
        product: updatedProduct,
      });
    }

    /* ===================================
       DELETE PRODUCT
    =================================== */

    /*
      Delete the database document first.

      Then attempt Cloudinary cleanup.

      This prevents an image from being
      deleted while its product record
      still exists if database deletion
      fails.
    */

    const deletedProduct =
      await Product.findByIdAndDelete(
        id
      );

    if (!deletedProduct) {
      return res.status(404).json({
        success: false,
        message:
          "Product not found.",
      });
    }

    const productImages =
      Array.isArray(
        deletedProduct.images
      )
        ? deletedProduct.images
        : [];

    await cleanupCloudinaryImages(
      productImages
    );

    return res.status(200).json({
      success: true,
      message:
        "Product deleted successfully.",
    });
  } catch (error: unknown) {
    return handleError(
      error,
      res
    );
  }
}
