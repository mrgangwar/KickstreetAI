
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
  sliders?: unknown[];
  slider?: unknown;
};

type SliderInput = {
  image: string;
  productId: string | null;
  title: string;
  subtitle: string;
  order: number;
  isActive: boolean;
};

/* =========================================
   CONSTANTS
========================================= */

const MAX_SLIDERS = 3;

const MAX_TITLE_LENGTH = 150;
const MAX_SUBTITLE_LENGTH = 300;

const OBJECT_ID_REGEX =
  /^[a-fA-F0-9]{24}$/;

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

function isValidImageUrl(
  value: unknown
): value is string {
  if (
    typeof value !== "string" ||
    value.length > 2048
  ) {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      url.hostname ===
        "res.cloudinary.com"
    );
  } catch {
    return false;
  }
}

function serializeDocument(
  document: unknown
): unknown {
  return JSON.parse(
    JSON.stringify(document)
  );
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

  if (
    !origin ||
    !configuredUrl
  ) {
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
): Promise<
  "authorized" | "unauthorized" | "forbidden"
> {
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
   VALIDATE SLIDER INPUT
========================================= */

function validateSliderInput(
  body: unknown,
  defaultOrder: number
):
  | {
      success: true;
      data: SliderInput;
    }
  | {
      success: false;
      message: string;
    } {
  if (!isRecord(body)) {
    return {
      success: false,
      message:
        "Invalid request body.",
    };
  }

  const image =
    body.image;

  if (!isValidImageUrl(image)) {
    return {
      success: false,
      message:
        "A valid Cloudinary HTTPS image URL is required.",
    };
  }

  const title =
    typeof body.title === "string"
      ? body.title.trim()
      : "";

  const subtitle =
    typeof body.subtitle === "string"
      ? body.subtitle.trim()
      : "";

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

  let productId:
    string | null = null;

  if (
    body.productId !== undefined &&
    body.productId !== null &&
    body.productId !== ""
  ) {
    if (
      !isValidObjectId(
        body.productId
      )
    ) {
      return {
        success: false,
        message:
          "Invalid linked product ID.",
      };
    }

    productId =
      body.productId;
  }

  const order =
    body.order === undefined ||
    body.order === null ||
    body.order === ""
      ? defaultOrder
      : body.order;

  if (
    typeof order !== "number" ||
    !Number.isInteger(order) ||
    order < 0 ||
    order > 1000
  ) {
    return {
      success: false,
      message:
        "Slider order must be a whole number between 0 and 1000.",
    };
  }

  const isActive =
    body.isActive === undefined
      ? true
      : body.isActive;

  if (
    typeof isActive !==
    "boolean"
  ) {
    return {
      success: false,
      message:
        "isActive must be a boolean.",
    };
  }

  return {
    success: true,
    data: {
      image,
      productId,
      title,
      subtitle,
      order,
      isActive,
    },
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
    req.method !== "POST"
  ) {
    res.setHeader(
      "Allow",
      "GET, POST"
    );

    return res.status(405).json({
      success: false,
      message:
        "Method not allowed.",
    });
  }

  if (
    req.method === "POST" &&
    !isAllowedOrigin(req)
  ) {
    return res.status(403).json({
      success: false,
      message:
        "Request origin is not allowed.",
    });
  }

  try {
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
      adminStatus === "unauthorized"
    ) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required.",
      });
    }

    if (
      adminStatus === "forbidden"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Admin access required.",
      });
    }

    /* ===================================
       GET ALL SLIDERS
    =================================== */

    if (req.method === "GET") {
      const sliders =
        await Slider.find({})
          .sort({
            order: 1,
            _id: 1,
          })
          .lean();

      return res.status(200).json({
        success: true,
        sliders:
          serializeDocument(
            sliders
          ) as unknown[],
      });
    }

    /* ===================================
       POST: CREATE SLIDER
    =================================== */

    const count =
      await Slider.countDocuments();

    if (
      count >= MAX_SLIDERS
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Maximum 3 sliders allowed. Remove an existing slider first.",
      });
    }

    const validation =
      validateSliderInput(
        req.body,
        count
      );

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message:
          validation.message,
      });
    }

    const sliderData =
      validation.data;

    /* ===================================
       VALIDATE LINKED PRODUCT
    =================================== */

    if (
      sliderData.productId
    ) {
      const product =
        await Product.exists({
          _id:
            sliderData.productId,
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
       CREATE SLIDER
    =================================== */

    const slider =
      await Slider.create({
        image:
          sliderData.image,

        productId:
          sliderData.productId,

        title:
          sliderData.title,

        subtitle:
          sliderData.subtitle,

        order:
          sliderData.order,

        isActive:
          sliderData.isActive,
      });

    return res.status(201).json({
      success: true,
      slider:
        serializeDocument(
          slider
        ),
    });
  } catch (error: unknown) {
    console.error(
      "ADMIN_SLIDERS_ERROR:",
      error instanceof Error
        ? error.name
        : "UnknownError"
    );

    if (
      error instanceof mongoose.Error.ValidationError
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
