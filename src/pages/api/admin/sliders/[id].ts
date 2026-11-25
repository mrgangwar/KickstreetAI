
import type {
  NextApiRequest,
  NextApiResponse,
} from "next";

import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";

import mongoose from "mongoose";

import dbConnect from "@/lib/db";
import User from "@/models/User";
import Slider from "@/models/Slider";
import Product from "@/models/Product";

/* =========================================
   TYPES
========================================= */

type ApiResponse = {
  success: boolean;
  message?: string;
  slider?: unknown;
};

type AdminStatus =
  | "authorized"
  | "unauthorized"
  | "forbidden";

type SliderUpdate = {
  image?: string;
  productId?: string | null;
  title?: string;
  subtitle?: string;
  order?: number;
  isActive?: boolean;
};

type ValidationResult =
  | {
      success: true;
      data: SliderUpdate;
    }
  | {
      success: false;
      message: string;
    };

/* =========================================
   CONSTANTS
========================================= */

const OBJECT_ID_REGEX =
  /^[a-fA-F0-9]{24}$/;

const MAX_TITLE_LENGTH = 150;
const MAX_SUBTITLE_LENGTH = 300;
const MAX_ORDER = 1000;

const ALLOWED_FIELDS = new Set([
  "image",
  "productId",
  "title",
  "subtitle",
  "order",
  "isActive",
]);

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

function isValidObjectId(
  value: unknown
): value is string {
  return (
    typeof value === "string" &&
    OBJECT_ID_REGEX.test(value) &&
    mongoose.Types.ObjectId.isValid(value)
  );
}

function serializeDocument(
  value: unknown
): unknown {
  return JSON.parse(
    JSON.stringify(value)
  );
}

/* =========================================
   CLOUDINARY URL VALIDATION
========================================= */

function isValidImageUrl(
  value: unknown
): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 2048
  ) {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      url.hostname ===
        "res.cloudinary.com" &&
      url.pathname.length > 1 &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

/* =========================================
   SAME-ORIGIN VALIDATION
========================================= */

function isAllowedOrigin(
  req: NextApiRequest
): boolean {
  const origin =
    req.headers.origin;

  const configuredUrl =
    process.env.NEXTAUTH_URL;

  if (!origin || !configuredUrl) {
    return false;
  }

  try {
    return (
      new URL(origin).origin ===
      new URL(configuredUrl).origin
    );
  } catch {
    return false;
  }
}

/* =========================================
   ADMIN AUTHORIZATION
========================================= */

async function verifyAdmin(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<AdminStatus> {
  const session =
    await getServerSession(
      req,
      res,
      authOptions
    );

  const userId =
    session?.user?.id;

  if (!isValidObjectId(userId)) {
    return "unauthorized";
  }

  const admin =
    await User.exists({
      _id: userId,
      role: "admin",
      isVerified: true,
    });

  return admin
    ? "authorized"
    : "forbidden";
}

/* =========================================
   VALIDATE UPDATE DATA
========================================= */

function validateUpdate(
  body: unknown
): ValidationResult {
  if (!isRecord(body)) {
    return {
      success: false,
      message:
        "Invalid request body.",
    };
  }

  const keys =
    Object.keys(body);

  if (keys.length === 0) {
    return {
      success: false,
      message:
        "At least one field is required.",
    };
  }

  for (const key of keys) {
    if (!ALLOWED_FIELDS.has(key)) {
      return {
        success: false,
        message:
          `Unsupported field: ${key}`,
      };
    }
  }

  const update: SliderUpdate = {};

  /* =====================================
     IMAGE
  ===================================== */

  if (
    body.image !== undefined
  ) {
    if (
      !isValidImageUrl(
        body.image
      )
    ) {
      return {
        success: false,
        message:
          "A valid Cloudinary HTTPS image URL is required.",
      };
    }

    update.image =
      body.image;
  }

  /* =====================================
     LINKED PRODUCT
  ===================================== */

  if (
    body.productId !== undefined
  ) {
    if (
      body.productId === null ||
      body.productId === ""
    ) {
      update.productId = null;
    } else if (
      isValidObjectId(
        body.productId
      )
    ) {
      update.productId =
        body.productId;
    } else {
      return {
        success: false,
        message:
          "Invalid linked product ID.",
      };
    }
  }

  /* =====================================
     TITLE
  ===================================== */

  if (
    body.title !== undefined
  ) {
    if (
      typeof body.title !==
      "string"
    ) {
      return {
        success: false,
        message:
          "Title must be a string.",
      };
    }

    const title =
      body.title.trim();

    if (
      title.length >
      MAX_TITLE_LENGTH
    ) {
      return {
        success: false,
        message:
          `Title must not exceed ${MAX_TITLE_LENGTH} characters.`,
      };
    }

    update.title = title;
  }

  /* =====================================
     SUBTITLE
  ===================================== */

  if (
    body.subtitle !== undefined
  ) {
    if (
      typeof body.subtitle !==
      "string"
    ) {
      return {
        success: false,
        message:
          "Subtitle must be a string.",
      };
    }

    const subtitle =
      body.subtitle.trim();

    if (
      subtitle.length >
      MAX_SUBTITLE_LENGTH
    ) {
      return {
        success: false,
        message:
          `Subtitle must not exceed ${MAX_SUBTITLE_LENGTH} characters.`,
      };
    }

    update.subtitle =
      subtitle;
  }

  /* =====================================
     ORDER
  ===================================== */

  if (
    body.order !== undefined
  ) {
    if (
      typeof body.order !==
        "number" ||
      !Number.isInteger(
        body.order
      ) ||
      body.order < 0 ||
      body.order > MAX_ORDER
    ) {
      return {
        success: false,
        message:
          `Order must be a whole number between 0 and ${MAX_ORDER}.`,
      };
    }

    update.order =
      body.order;
  }

  /* =====================================
     VISIBILITY
  ===================================== */

  if (
    body.isActive !== undefined
  ) {
    if (
      typeof body.isActive !==
      "boolean"
    ) {
      return {
        success: false,
        message:
          "isActive must be true or false.",
      };
    }

    update.isActive =
      body.isActive;
  }

  return {
    success: true,
    data: update,
  };
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
     METHOD CHECK
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
      message:
        "Method not allowed.",
    });
  }

  /* =====================================
     VALIDATE PRODUCT ID
  ===================================== */

  const { id } = req.query;

  if (!isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message:
        "Invalid slider ID.",
    });
  }

  /* =====================================
     SAME-ORIGIN CHECK
  ===================================== */

  if (
    req.method !== "GET" &&
    !isAllowedOrigin(req)
  ) {
    return res.status(403).json({
      success: false,
      message:
        "Request origin is not allowed.",
    });
  }

  try {
    /* ===================================
       DATABASE CONNECTION
    =================================== */

    await dbConnect();

    /* ===================================
       VERIFY ADMIN
    =================================== */

    const adminStatus =
      await verifyAdmin(
        req,
        res
      );

    if (
      adminStatus ===
      "unauthorized"
    ) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required.",
      });
    }

    if (
      adminStatus ===
      "forbidden"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Admin access required.",
      });
    }

    /* ===================================
       GET SINGLE SLIDER
    =================================== */

    if (req.method === "GET") {
      const slider =
        await Slider.findById(id)
          .lean();

      if (!slider) {
        return res.status(404).json({
          success: false,
          message:
            "Slider not found.",
        });
      }

      return res.status(200).json({
        success: true,
        slider:
          serializeDocument(
            slider
          ),
      });
    }

    /* ===================================
       DELETE SLIDER
    =================================== */

    if (
      req.method === "DELETE"
    ) {
      const deletedSlider =
        await Slider.findByIdAndDelete(
          id
        );

      if (!deletedSlider) {
        return res.status(404).json({
          success: false,
          message:
            "Slider not found.",
        });
      }

      /*
       * Do not automatically destroy
       * Cloudinary images here.
       *
       * Images may be referenced by
       * products or other sliders.
       */

      return res.status(200).json({
        success: true,
        message:
          "Slider deleted successfully.",
      });
    }

    /* ===================================
       PUT: VALIDATE UPDATE
    =================================== */

    const validation =
      validateUpdate(
        req.body
      );

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message:
          validation.message,
      });
    }

    const updateData =
      validation.data;

    /* ===================================
       CHECK LINKED PRODUCT
    =================================== */

    if (
      typeof updateData.productId ===
      "string"
    ) {
      const product =
        await Product.exists({
          _id:
            updateData.productId,
          isActive: {
            $ne: false,
          },
        });

      if (!product) {
        return res.status(400).json({
          success: false,
          message:
            "Linked product does not exist or is inactive.",
        });
      }
    }

    /* ===================================
       UPDATE SLIDER
    =================================== */

    const slider =
      await Slider.findByIdAndUpdate(
        id,
        {
          $set: updateData,
        },
        {
          new: true,
          runValidators: true,
          context: "query",
        }
      ).lean();

    if (!slider) {
      return res.status(404).json({
        success: false,
        message:
          "Slider not found.",
      });
    }

    return res.status(200).json({
      success: true,
      slider:
        serializeDocument(
          slider
        ),
    });
  } catch (error: unknown) {
    console.error(
      "ADMIN_SLIDER_DETAILS_ERROR:",
      error instanceof Error
        ? error.name
        : "UnknownError"
    );

    if (
      error instanceof
      mongoose.Error.ValidationError
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Slider validation failed.",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Unable to process slider request.",
    });
  }
}
