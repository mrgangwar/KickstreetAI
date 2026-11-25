
import type {
  NextApiRequest,
  NextApiResponse,
} from "next";

import {
  timingSafeEqual,
} from "node:crypto";

import dbConnect from "@/lib/db";
import User from "@/models/User";

import {
  hashPassword,
} from "@/lib/auth";

/* =========================================
   TYPES
========================================= */

type ApiResponse = {
  success: boolean;
  message: string;
};

type ResetPasswordInput = {
  email: string;
  otp: string;
  newPassword: string;
};

/* =========================================
   CONSTANTS
========================================= */

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const OTP_REGEX =
  /^\d{6}$/;

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const MAX_PASSWORD_BYTES = 72;

const INVALID_RESET_MESSAGE =
  "Invalid or expired reset code.";

/* =========================================
   VALIDATION ERROR
========================================= */

class ResetValidationError extends Error {
  constructor(
    message: string,
    public statusCode = 400
  ) {
    super(message);

    this.name = "ResetValidationError";
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
): ResetPasswordInput {
  if (!isPlainObject(body)) {
    throw new ResetValidationError(
      "Invalid password reset request."
    );
  }

  const {
    email,
    otp,
    newPassword,
  } = body;

  /* EMAIL */

  if (typeof email !== "string") {
    throw new ResetValidationError(
      "Please enter a valid email address."
    );
  }

  const normalizedEmail =
    email.trim().toLowerCase();

  if (
    normalizedEmail.length === 0 ||
    normalizedEmail.length > 254 ||
    !EMAIL_REGEX.test(normalizedEmail)
  ) {
    throw new ResetValidationError(
      "Please enter a valid email address."
    );
  }

  /* OTP */

  if (
    typeof otp !== "string" ||
    !OTP_REGEX.test(otp)
  ) {
    throw new ResetValidationError(
      "OTP must contain exactly 6 digits."
    );
  }

  /* PASSWORD TYPE AND LENGTH */

  if (
    typeof newPassword !== "string" ||
    newPassword.length <
      MIN_PASSWORD_LENGTH ||
    newPassword.length >
      MAX_PASSWORD_LENGTH
  ) {
    throw new ResetValidationError(
      "Password must contain 8 to 128 characters."
    );
  }

  /* PASSWORD STRENGTH */

  if (
    !/[A-Za-z]/.test(newPassword) ||
    !/[0-9]/.test(newPassword)
  ) {
    throw new ResetValidationError(
      "Password must contain at least one letter and one number."
    );
  }

  /* BCRYPT BYTE LIMIT */

  if (
    Buffer.byteLength(
      newPassword,
      "utf8"
    ) > MAX_PASSWORD_BYTES
  ) {
    throw new ResetValidationError(
      "Password must not exceed 72 UTF-8 bytes."
    );
  }

  return {
    email: normalizedEmail,
    otp,
    newPassword,
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
    Buffer.from(
      storedOtp,
      "utf8"
    );

  const providedBuffer =
    Buffer.from(
      providedOtp,
      "utf8"
    );

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
   RESET PASSWORD API
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
       STEP 1: VALIDATE INPUT
    ===================================== */

    const {
      email,
      otp,
      newPassword,
    } = validateInput(req.body);

    /* =====================================
       STEP 2: CONNECT DATABASE
    ===================================== */

    await dbConnect();

    /* =====================================
       STEP 3: FIND VERIFIED USER
    ===================================== */

    /*
     * Password reset is allowed
     * only for verified accounts.
     *
     * Explicitly select OTP fields
     * because the User schema marks
     * them select:false.
     */

    const user =
      await User.findOne({
        email,
        isVerified: true,
      })
        .select(
          "_id +otp +otpExpires"
        )
        .lean();

    if (!user) {
      return res.status(400).json({
        success: false,
        message:
          INVALID_RESET_MESSAGE,
      });
    }

    /* =====================================
       STEP 4: VALIDATE OTP EXPIRY
    ===================================== */

    const expiresAt =
      user.otpExpires;

    if (
      !(expiresAt instanceof Date) ||
      Number.isNaN(
        expiresAt.getTime()
      ) ||
      expiresAt.getTime() <=
        Date.now()
    ) {
      return res.status(400).json({
        success: false,
        message:
          INVALID_RESET_MESSAGE,
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
        message:
          INVALID_RESET_MESSAGE,
      });
    }

    /* =====================================
       STEP 6: HASH NEW PASSWORD
    ===================================== */

    const hashedPassword =
      await hashPassword(
        newPassword
      );

    /* =====================================
       STEP 7: ATOMIC PASSWORD RESET
    ===================================== */

    /*
     * Password update succeeds only if:
     *
     * 1. Account is still verified.
     * 2. OTP has not changed.
     * 3. OTP has not expired.
     * 4. OTP has not been consumed.
     *
     * The OTP is deleted in the same
     * atomic database operation.
     */

    const result =
      await User.updateOne(
        {
          _id: user._id,

          email,

          isVerified: true,

          otp,

          otpExpires: {
            $gt: new Date(),
          },
        },
        {
          $set: {
            password:
              hashedPassword,
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
       STEP 8: CHECK UPDATE RESULT
    ===================================== */

    if (
      result.modifiedCount !== 1
    ) {
      return res.status(400).json({
        success: false,
        message:
          INVALID_RESET_MESSAGE,
      });
    }

    /* =====================================
       STEP 9: SUCCESS
    ===================================== */

    return res.status(200).json({
      success: true,

      message:
        "Password reset successful. Please log in with your new password.",
    });
  } catch (error: unknown) {
    /* VALIDATION ERRORS */

    if (
      error instanceof ResetValidationError
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
      "RESET_PASSWORD_API_ERROR:",
      error instanceof Error
        ? error.name
        : "UnknownError"
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to reset password. Please try again later.",
    });
  }
}
