
import type {
  NextApiRequest,
  NextApiResponse,
} from "next";

import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";

import dbConnect from "@/lib/db";
import User from "@/models/User";
import cloudinary from "@/lib/cloudinary";

/* =========================================
   API CONFIGURATION
========================================= */

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};

/* =========================================
   TYPES
========================================= */

type UploadType = "slider" | "product";

type ApiResponse = {
  success: boolean;
  message?: string;
  url?: string;
  publicId?: string;
};

type ValidationResult =
  | {
      success: true;
      image: string;
      mimeType: string;
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

const PRODUCT_MAX_BYTES =
  2 * 1024 * 1024;

const SLIDER_MAX_BYTES =
  5 * 1024 * 1024;

const IMAGE_REGEX =
  /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/i;

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

function getUploadType(
  value: unknown
): UploadType | null {
  if (value === undefined) {
    return "slider";
  }

  if (
    value === "slider" ||
    value === "product"
  ) {
    return value;
  }

  return null;
}

/* =========================================
   SAME-ORIGIN VALIDATION
========================================= */

function isAllowedOrigin(
  req: NextApiRequest
): boolean {
  const origin = req.headers.origin;
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
   IMAGE SIGNATURE VALIDATION
========================================= */

function hasValidSignature(
  buffer: Buffer,
  mimeType: string
): boolean {
  if (mimeType === "image/jpeg") {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }

  if (mimeType === "image/png") {
    const pngSignature =
      Buffer.from([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
      ]);

    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        pngSignature
      )
    );
  }

  if (mimeType === "image/webp") {
    return (
      buffer.length >= 12 &&
      buffer.toString(
        "ascii",
        0,
        4
      ) === "RIFF" &&
      buffer.toString(
        "ascii",
        8,
        12
      ) === "WEBP"
    );
  }

  return false;
}

/* =========================================
   IMAGE VALIDATION
========================================= */

function validateImage(
  value: unknown,
  uploadType: UploadType
): ValidationResult {
  if (typeof value !== "string") {
    return {
      success: false,
      message:
        "Image must be a Base64 data URL.",
    };
  }

  const match =
    IMAGE_REGEX.exec(value);

  if (!match) {
    return {
      success: false,
      message:
        "Only JPEG, PNG and WebP Base64 images are supported.",
    };
  }

  const mimeType =
    match[1].toLowerCase();

  const base64 = match[2];

  const maxBytes =
    uploadType === "product"
      ? PRODUCT_MAX_BYTES
      : SLIDER_MAX_BYTES;

  const maxBase64Length =
    Math.ceil(maxBytes / 3) * 4;

  if (
    base64.length === 0 ||
    base64.length > maxBase64Length
  ) {
    return {
      success: false,
      message:
        `Image exceeds the ${uploadType === "product" ? "2 MB" : "5 MB"} limit.`,
    };
  }

  const buffer =
    Buffer.from(
      base64,
      "base64"
    );

  if (
    buffer.length === 0 ||
    buffer.length > maxBytes
  ) {
    return {
      success: false,
      message:
        "Invalid image size.",
    };
  }

  if (
    buffer.toString("base64") !==
    base64
  ) {
    return {
      success: false,
      message:
        "Invalid Base64 encoding.",
    };
  }

  if (
    !hasValidSignature(
      buffer,
      mimeType
    )
  ) {
    return {
      success: false,
      message:
        "Image content does not match its declared format.",
    };
  }

  return {
    success: true,
    image: value,
    mimeType,
  };
}

/* =========================================
   ADMIN AUTHENTICATION
========================================= */

async function verifyAdmin(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<
  "unauthorized" | "forbidden" | "authorized"
> {
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
   CLOUDINARY CLEANUP
========================================= */

async function cleanupUpload(
  publicId: string
): Promise<void> {
  try {
    await cloudinary.uploader.destroy(
      publicId,
      {
        resource_type: "image",
      }
    );
  } catch (error) {
    console.error(
      "CLOUDINARY_CLEANUP_ERROR:",
      error instanceof Error
        ? error.name
        : "UnknownError"
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

  if (req.method !== "POST") {
    res.setHeader(
      "Allow",
      "POST"
    );

    return res.status(405).json({
      success: false,
      message:
        "Method not allowed.",
    });
  }

  /* =====================================
     SAME-ORIGIN CHECK
  ===================================== */

  if (!isAllowedOrigin(req)) {
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
       ADMIN AUTHORIZATION
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
       REQUEST VALIDATION
    =================================== */

    if (!isRecord(req.body)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid request body.",
      });
    }

    const uploadType =
      getUploadType(
        req.body.type
      );

    if (!uploadType) {
      return res.status(400).json({
        success: false,
        message:
          "Upload type must be slider or product.",
      });
    }

    const validation =
      validateImage(
        req.body.image,
        uploadType
      );

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message:
          validation.message,
      });
    }

    /* ===================================
       CLOUDINARY UPLOAD
    =================================== */

    const isSlider =
      uploadType === "slider";

    const result =
      await cloudinary.uploader.upload(
        validation.image,
        {
          folder: isSlider
            ? "kickstreet_sliders"
            : "kickstreet_products",

          resource_type: "image",

          overwrite: false,

          unique_filename: true,

          transformation: isSlider
            ? [
                {
                  width: 1920,
                  height: 1080,
                  crop: "fill",
                },
                {
                  quality: "auto",
                },
                {
                  fetch_format: "auto",
                },
              ]
            : [
                {
                  width: 1200,
                  height: 1200,
                  crop: "limit",
                },
                {
                  quality: "auto",
                },
                {
                  fetch_format: "auto",
                },
              ],
        }
      );

    /* ===================================
       VALIDATE UPLOAD RESULT
    =================================== */

    if (
      !result.secure_url ||
      !result.public_id
    ) {
      if (result.public_id) {
        await cleanupUpload(
          result.public_id
        );
      }

      return res.status(502).json({
        success: false,
        message:
          "Image provider returned an invalid response.",
      });
    }

    /* ===================================
       SUCCESS
    =================================== */

    return res.status(200).json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
    });
  } catch (error: unknown) {
    console.error(
      "CLOUDINARY_UPLOAD_ERROR:",
      error instanceof Error
        ? error.name
        : "UnknownError"
    );

    return res.status(500).json({
      success: false,
      message:
        "Image upload failed. Please try again.",
    });
  }
}
