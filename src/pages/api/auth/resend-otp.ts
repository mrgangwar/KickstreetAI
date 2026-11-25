
import type {
  NextApiRequest,
  NextApiResponse,
} from "next";

import dbConnect from "@/lib/db";
import User from "@/models/User";

import {
  sendOTPEmail,
  generateOTP,
  getOTPExpiry,
} from "@/lib/email";

/* =========================================
   TYPES
========================================= */

type ApiResponse = {
  success: boolean;
  message: string;
  retryAfter?: number;
};

/* =========================================
   CONSTANTS
========================================= */

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const OTP_REGEX =
  /^\d{6}$/;

const RESEND_COOLDOWN_SECONDS = 30;

const RESEND_COOLDOWN_MS =
  RESEND_COOLDOWN_SECONDS * 1000;

const GENERIC_SUCCESS_MESSAGE =
  "If this email belongs to an unverified account, a verification code will be sent.";

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

function createOTP(): {
  otp: string;
  otpExpires: Date;
} {
  const generatedOtp =
    generateOTP();

  const otp =
    String(generatedOtp);

  if (
    !OTP_REGEX.test(otp)
  ) {
    throw new Error(
      "OTP generator must return exactly six digits."
    );
  }

  const otpExpires =
    new Date(getOTPExpiry());

  if (
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
   RESEND OTP API
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
       STEP 3: FIND USER
    ===================================== */

    const user =
      await User.findOne({
        email,
        isVerified: false,
      })
        .select(
          "_id isVerified +otpExpires"
        )
        .lean();

    /*
     * Avoid revealing whether
     * the email exists.
     */
    if (!user) {
      return res.status(200).json({
        success: true,
        message:
          GENERIC_SUCCESS_MESSAGE,
      });
    }

    /* =====================================
       STEP 4: GENERATE NEW OTP
    ===================================== */

    const {
      otp,
      otpExpires,
    } = createOTP();

    const now = Date.now();

    const expiryTime =
      otpExpires.getTime();

    const otpLifetimeMs =
      expiryTime - now;

    if (
      otpLifetimeMs <=
      RESEND_COOLDOWN_MS
    ) {
      throw new Error(
        "OTP lifetime must exceed resend cooldown."
      );
    }

    /* =====================================
       STEP 5: COOLDOWN THRESHOLD
    ===================================== */

    /*
     * Compatibility approach:
     *
     * Existing OTP expiry is used
     * to approximate the last
     * generation timestamp.
     *
     * Accurate cooldown requires
     * a separate otpLastSentAt field.
     */

    const cooldownThreshold =
      new Date(
        now +
          otpLifetimeMs -
          RESEND_COOLDOWN_MS
      );

    /* =====================================
       STEP 6: ATOMIC UPDATE
    ===================================== */

    const updatedUser =
      await User.findOneAndUpdate(
        {
          _id: user._id,

          isVerified: false,

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
          new: true,

          projection: {
            _id: 1,
          },
        }
      ).lean();

    /* =====================================
       STEP 7: COOLDOWN RESPONSE
    ===================================== */

    if (!updatedUser) {
      res.setHeader(
        "Retry-After",
        String(
          RESEND_COOLDOWN_SECONDS
        )
      );

      return res.status(429).json({
        success: false,

        message:
          "Please wait before requesting another verification code.",

        retryAfter:
          RESEND_COOLDOWN_SECONDS,
      });
    }

    /* =====================================
       STEP 8: SEND EMAIL
    ===================================== */

    try {
      await sendOTPEmail(
        email,
        otp
      );
    } catch (emailError: unknown) {
      console.error(
        "RESEND_OTP_EMAIL_ERROR:",
        emailError instanceof Error
          ? emailError.name
          : "UnknownError"
      );

      /*
       * Do not restore the previous
       * OTP automatically.
       *
       * The email provider may have
       * accepted the message before
       * reporting an error.
       */
      return res.status(503).json({
        success: false,

        message:
          "Unable to confirm email delivery. Please try again later.",
      });
    }

    /* =====================================
       STEP 9: SUCCESS
    ===================================== */

    return res.status(200).json({
      success: true,

      message:
        GENERIC_SUCCESS_MESSAGE,
    });
  } catch (error: unknown) {
    console.error(
      "RESEND_OTP_API_ERROR:",
      error instanceof Error
        ? error.name
        : "UnknownError"
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to process your request. Please try again.",
    });
  }
}
