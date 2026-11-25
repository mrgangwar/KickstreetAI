import type {
  NextApiRequest,
  NextApiResponse,
} from "next";

import {
  timingSafeEqual,
} from "node:crypto";

import dbConnect from "@/lib/db";
import User from "@/models/User";

/* =========================================
   TYPES
========================================= */

type VerifyOtpResponse = {
  success: boolean;
  message: string;
};

type VerifyOtpInput = {
  email: string;
  otp: string;
};

/* =========================================
   CONSTANTS
========================================= */

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const OTP_REGEX =
  /^\d{6}$/;

const INVALID_OTP_MESSAGE =
  "Invalid or expired verification code.";

/* =========================================
   VALIDATION ERROR
========================================= */

class OtpValidationError extends Error {
  constructor(
    message: string,
    public statusCode = 400
  ) {
    super(message);

    this.name = "OtpValidationError";
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

/* =========================================
   INPUT VALIDATION
========================================= */

function validateInput(
  body: unknown
): VerifyOtpInput {
  if (!isPlainObject(body)) {
    throw new OtpValidationError(
      "Invalid verification request."
    );
  }

  const {
    email,
    otp,
  } = body;

  if (
    typeof email !== "string" ||
    typeof otp !== "string"
  ) {
    throw new OtpValidationError(
      "Email and OTP are required."
    );
  }

  const normalizedEmail =
    email.trim().toLowerCase();

  const normalizedOtp =
    otp.trim();

  if (
    normalizedEmail.length === 0 ||
    normalizedEmail.length > 254 ||
    !EMAIL_REGEX.test(normalizedEmail)
  ) {
    throw new OtpValidationError(
      "Please enter a valid email address."
    );
  }

  if (
    !OTP_REGEX.test(normalizedOtp)
  ) {
    throw new OtpValidationError(
      "OTP must contain exactly 6 digits."
    );
  }

  return {
    email: normalizedEmail,
    otp: normalizedOtp,
  };
}

/* =========================================
   TIMING-SAFE OTP COMPARISON
========================================= */

function secureOtpCompare(
  storedOtp: unknown,
  providedOtp: string
): boolean {
  if (
    typeof storedOtp !== "string" ||
    !OTP_REGEX.test(storedOtp) ||
    !OTP_REGEX.test(providedOtp)
  ) {
    return false;
  }

  const storedBuffer =
    Buffer.from(storedOtp, "utf8");

  const providedBuffer =
    Buffer.from(providedOtp, "utf8");

  if (
    storedBuffer.length !==
    providedBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    storedBuffer,
    providedBuffer
  );
}

/* =========================================
   VERIFY REGISTRATION EMAIL OTP
========================================= */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VerifyOtpResponse>
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
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      success: false,
      message: "Method not allowed.",
    });
  }

  try {
    /* =====================================
       STEP 1: VALIDATE INPUT
    ===================================== */

    const {
      email,
      otp,
    } = validateInput(req.body);

    /* =====================================
       STEP 2: CONNECT DATABASE
    ===================================== */

    await dbConnect();

    /* =====================================
       STEP 3: FIND UNVERIFIED ACCOUNT
    ===================================== */

    /*
     * Email verification is allowed
     * only for accounts that have
     * not yet been verified.
     *
     * OTP fields are explicitly
     * selected because the User
     * schema marks them select:false.
     */

    const user =
      await User.findOne({
        email,
        isVerified: false,
      })
        .select(
          "_id +otp +otpExpires"
        )
        .lean();

    /*
     * Unknown, already-verified,
     * and invalid requests all
     * receive the same response.
     */

    if (!user) {
      return res.status(400).json({
        success: false,
        message: INVALID_OTP_MESSAGE,
      });
    }

    /* =====================================
       STEP 4: CHECK OTP EXPIRY
    ===================================== */

    const expiresAt =
      user.otpExpires;

    if (
      !(expiresAt instanceof Date) ||
      Number.isNaN(
        expiresAt.getTime()
      ) ||
      expiresAt.getTime() <= Date.now()
    ) {
      return res.status(400).json({
        success: false,
        message: INVALID_OTP_MESSAGE,
      });
    }

    /* =====================================
       STEP 5: VERIFY OTP
    ===================================== */

    const isOtpValid =
      secureOtpCompare(
        user.otp,
        otp
      );

    if (!isOtpValid) {
      return res.status(400).json({
        success: false,
        message: INVALID_OTP_MESSAGE,
      });
    }

    /* =====================================
       STEP 6: ATOMIC VERIFICATION
    ===================================== */

    /*
     * The account is activated only if:
     *
     * 1. It is still unverified.
     * 2. The OTP has not changed.
     * 3. The OTP has not expired.
     *
     * The OTP is consumed in the same
     * atomic database operation so it
     * cannot be replayed.
     */

    const result =
      await User.updateOne(
        {
          _id: user._id,

          email,

          isVerified: false,

          otp,

          otpExpires: {
            $gt: new Date(),
          },
        },
        {
          $set: {
            isVerified: true,
          },

          $unset: {
            otp: "",
            otpExpires: "",
          },
        },
        {
          runValidators: true,
        }
      );

    /* =====================================
       STEP 7: CHECK UPDATE RESULT
    ===================================== */

    if (
      result.modifiedCount !== 1
    ) {
      return res.status(400).json({
        success: false,
        message: INVALID_OTP_MESSAGE,
      });
    }

    /* =====================================
       STEP 8: SUCCESS
    ===================================== */

    return res.status(200).json({
      success: true,

      message:
        "Email verified successfully. You can now log in.",
    });
  } catch (error: unknown) {
    /* VALIDATION ERRORS */

    if (
      error instanceof OtpValidationError
    ) {
      return res
        .status(error.statusCode)
        .json({
          success: false,
          message: error.message,
        });
    }

    /* SERVER ERROR */

    console.error(
      "VERIFY_OTP_API_ERROR:",
      error instanceof Error
        ? error.name
        : "UnknownError"
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to verify the code. Please try again.",
    });
  }
}