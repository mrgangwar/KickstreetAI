
import type {
  NextApiRequest,
  NextApiResponse,
} from "next";

import dbConnect from "@/lib/db";
import User from "@/models/User";

import {
  generateOTP,
  getOTPExpiry,
  sendResetPasswordOTPEmail,
} from "@/lib/email";

/* =========================================
   TYPES
========================================= */

type ApiResponse = {
  success: boolean;
  message: string;
};

/* =========================================
   CONSTANTS
========================================= */

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const OTP_REGEX =
  /^\d{6}$/;

const OTP_LIFETIME_MS =
  5 * 60 * 1000;

const RESET_COOLDOWN_MS =
  30 * 1000;

const OTP_LIFETIME_TOLERANCE_MS =
  5000;

const GENERIC_SUCCESS_MESSAGE =
  "If a verified account exists with this email, a password reset code will be sent.";

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

function normalizeEmail(
  value: unknown
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const email =
    value.trim().toLowerCase();

  if (
    email.length === 0 ||
    email.length > 254 ||
    !EMAIL_REGEX.test(email)
  ) {
    return null;
  }

  return email;
}

/* =========================================
   GENERATE RESET OTP
========================================= */

function createResetOTP(): {
  otp: string;
  otpExpires: Date;
} {
  const otp =
    generateOTP();

  if (
    typeof otp !== "string" ||
    !OTP_REGEX.test(otp)
  ) {
    throw new Error(
      "Invalid OTP generator output."
    );
  }

  const otpExpires =
    getOTPExpiry();

  if (
    !(otpExpires instanceof Date) ||
    Number.isNaN(
      otpExpires.getTime()
    ) ||
    otpExpires.getTime() <=
      Date.now()
  ) {
    throw new Error(
      "Invalid OTP expiry."
    );
  }

  return {
    otp,
    otpExpires,
  };
}

/* =========================================
   FORGOT PASSWORD API
========================================= */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  /* SECURITY HEADERS */

  res.setHeader(
    "Cache-Control",
    "no-store, max-age=0"
  );

  res.setHeader(
    "X-Content-Type-Options",
    "nosniff"
  );

  /* POST ONLY */

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

  try {
    /* =====================================
       STEP 1: VALIDATE REQUEST
    ===================================== */

    if (!isPlainObject(req.body)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid request body.",
      });
    }

    const email =
      normalizeEmail(
        req.body.email
      );

    if (!email) {
      return res.status(400).json({
        success: false,
        message:
          "Please enter a valid email address.",
      });
    }

    /* =====================================
       STEP 2: CONNECT DATABASE
    ===================================== */

    await dbConnect();

    /* =====================================
       STEP 3: FIND VERIFIED USER
    ===================================== */

    const user =
      await User.findOne({
        email,
        isVerified: true,
      })
        .select("_id")
        .lean();

    /*
     * Unknown and unverified
     * accounts receive the same
     * public response.
     */

    if (!user) {
      return res.status(200).json({
        success: true,
        message:
          GENERIC_SUCCESS_MESSAGE,
      });
    }

    /* =====================================
       STEP 4: GENERATE OTP
    ===================================== */

    const {
      otp,
      otpExpires,
    } = createResetOTP();

    const now =
      Date.now();

    const actualLifetime =
      otpExpires.getTime() - now;

    /* =====================================
       STEP 5: VALIDATE OTP LIFETIME
    ===================================== */

    if (
      Math.abs(
        actualLifetime -
        OTP_LIFETIME_MS
      ) >
      OTP_LIFETIME_TOLERANCE_MS
    ) {
      throw new Error(
        "OTP lifetime configuration mismatch."
      );
    }

    /* =====================================
       STEP 6: COOLDOWN THRESHOLD
    ===================================== */

    /*
     * Compatibility approach:
     *
     * Existing OTP expiry is used
     * to estimate when the last
     * OTP was generated.
     *
     * A dedicated last-sent
     * timestamp would be more
     * reliable.
     */

    const cooldownThreshold =
      new Date(
        now +
          OTP_LIFETIME_MS -
          RESET_COOLDOWN_MS
      );

    /* =====================================
       STEP 7: ATOMIC OTP UPDATE
    ===================================== */

    const updatedUser =
      await User.findOneAndUpdate(
        {
          _id: user._id,

          isVerified: true,

          $or: [
            {
              otpExpires: {
                $exists: false,
              },
            },

            {
              otpExpires: null,
            },

            {
              otpExpires: {
                $lte:
                  cooldownThreshold,
              },
            },
          ],
        },
        {
          $set: {
            otp,
            otpExpires,
          },
        },
        {
          new: false,

          runValidators: true,

          projection: {
            _id: 1,
          },
        }
      ).lean();

    /* =====================================
       STEP 8: COOLDOWN ACTIVE
    ===================================== */

    if (!updatedUser) {
      return res.status(200).json({
        success: true,
        message:
          GENERIC_SUCCESS_MESSAGE,
      });
    }

    /* =====================================
       STEP 9: SEND RESET EMAIL
    ===================================== */

    try {
      await sendResetPasswordOTPEmail(
        email,
        otp
      );
    } catch (emailError: unknown) {
      /*
       * Do not restore the previous
       * OTP automatically.
       *
       * The provider might have
       * accepted the message before
       * reporting an error.
       */

      console.error(
        "FORGOT_PASSWORD_EMAIL_ERROR:",
        emailError instanceof Error
          ? emailError.name
          : "UnknownError"
      );

      return res.status(200).json({
        success: true,
        message:
          GENERIC_SUCCESS_MESSAGE,
      });
    }

    /* =====================================
       STEP 10: SUCCESS
    ===================================== */

    return res.status(200).json({
      success: true,
      message:
        GENERIC_SUCCESS_MESSAGE,
    });
  } catch (error: unknown) {
    console.error(
      "FORGOT_PASSWORD_API_ERROR:",
      error instanceof Error
        ? error.name
        : "UnknownError"
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to process your request. Please try again later.",
    });
  }
}
