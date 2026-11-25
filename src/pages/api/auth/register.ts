
import type {
  NextApiRequest,
  NextApiResponse,
} from "next";

import mongoose from "mongoose";

import dbConnect from "@/lib/db";
import User from "@/models/User";

import {
  hashPassword,
} from "@/lib/auth";

import {
  sendOTPEmail,
  generateOTP,
  getOTPExpiry,
} from "@/lib/email";

/* =========================================
   TYPES
========================================= */

type RegisterResponse = {
  success: boolean;
  message: string;
  verificationRequired?: boolean;
  email?: string;
  emailDeliveryPending?: boolean;
};

type RegisterInput = {
  name: string;
  email: string;
  phone: string;
  password: string;
};

/* =========================================
   CONSTANTS
========================================= */

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PHONE_REGEX =
  /^[6-9]\d{9}$/;

const OTP_REGEX =
  /^\d{6}$/;

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const MAX_PASSWORD_BYTES = 72;

/* =========================================
   VALIDATION ERROR
========================================= */

class RegistrationError extends Error {
  constructor(
    message: string,
    public statusCode = 400
  ) {
    super(message);
    this.name = "RegistrationError";
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

function isDuplicateKeyError(
  error: unknown
): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

/* =========================================
   VALIDATE REGISTRATION INPUT
========================================= */

function validateInput(
  body: unknown
): RegisterInput {
  if (!isPlainObject(body)) {
    throw new RegistrationError(
      "Invalid registration request."
    );
  }

  const {
    name,
    email,
    phone,
    password,
  } = body;

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof phone !== "string" ||
    typeof password !== "string"
  ) {
    throw new RegistrationError(
      "Name, email, phone and password are required."
    );
  }

  const normalizedName =
    name.trim().replace(/\s+/g, " ");

  const normalizedEmail =
    email.trim().toLowerCase();

  const normalizedPhone =
    phone.trim();

  /* NAME */

  if (
    normalizedName.length < 2 ||
    normalizedName.length > 100
  ) {
    throw new RegistrationError(
      "Name must contain 2 to 100 characters."
    );
  }

  /* EMAIL */

  if (
    normalizedEmail.length === 0 ||
    normalizedEmail.length > 254 ||
    !EMAIL_REGEX.test(normalizedEmail)
  ) {
    throw new RegistrationError(
      "Please enter a valid email address."
    );
  }

  /* PHONE */

  if (
    !PHONE_REGEX.test(normalizedPhone)
  ) {
    throw new RegistrationError(
      "Please enter a valid 10-digit Indian mobile number."
    );
  }

  /* PASSWORD LENGTH */

  if (
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    throw new RegistrationError(
      "Password must contain 8 to 128 characters."
    );
  }

  /* PASSWORD STRENGTH */

  if (
    !/[A-Za-z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    throw new RegistrationError(
      "Password must contain at least one letter and one number."
    );
  }

  /* BCRYPT BYTE LIMIT */

  if (
    Buffer.byteLength(
      password,
      "utf8"
    ) > MAX_PASSWORD_BYTES
  ) {
    throw new RegistrationError(
      "Password must not exceed 72 UTF-8 bytes."
    );
  }

  return {
    name: normalizedName,
    email: normalizedEmail,
    phone: normalizedPhone,
    password,
  };
}

/* =========================================
   OTP GENERATION
========================================= */

function createVerificationOTP(): {
  otp: string;
  otpExpires: Date;
} {
  const generatedOtp =
    generateOTP();

  if (
    typeof generatedOtp !== "string" &&
    typeof generatedOtp !== "number"
  ) {
    throw new Error(
      "OTP generator returned an invalid value."
    );
  }

  const otp =
    String(generatedOtp);

  if (!OTP_REGEX.test(otp)) {
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
    otpExpires.getTime() <= Date.now()
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
   REGISTER API
========================================= */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RegisterResponse>
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
      name,
      email,
      phone,
      password,
    } = validateInput(req.body);

    /* =====================================
       STEP 2: CONNECT DATABASE
    ===================================== */

    await dbConnect();

    /* =====================================
       STEP 3: CHECK EXISTING USER
    ===================================== */

    const existingUser =
      await User.findOne({
        $or: [
          { email },
          { phone },
        ],
      })
        .select(
          "_id email phone isVerified"
        )
        .lean();

    if (existingUser) {
      /* EXISTING EMAIL */

      if (
        existingUser.email === email
      ) {
        if (
          existingUser.isVerified === false
        ) {
          return res.status(409).json({
            success: false,

            message:
              "This email is already registered but not verified. Please use the OTP verification page.",

            verificationRequired: true,

            email,
          });
        }

        return res.status(409).json({
          success: false,

          message:
            "This email is already registered. Please log in.",
        });
      }

      /* EXISTING PHONE */

      return res.status(409).json({
        success: false,

        message:
          "This mobile number is already registered.",
      });
    }

    /* =====================================
       STEP 4: GENERATE OTP
    ===================================== */

    const {
      otp,
      otpExpires,
    } = createVerificationOTP();

    /* =====================================
       STEP 5: HASH PASSWORD
    ===================================== */

    const hashedPassword =
      await hashPassword(
        password
      );

    /* =====================================
       STEP 6: CREATE USER
    ===================================== */

    await User.create({
      name,
      email,
      phone,

      password:
        hashedPassword,

      role: "user",

      isVerified: false,

      otp,

      otpExpires,
    });

    /* =====================================
       STEP 7: SEND OTP EMAIL
    ===================================== */

    try {
      await sendOTPEmail(
        email,
        otp
      );
    } catch (emailError: unknown) {
      console.error(
        "REGISTER_EMAIL_ERROR:",
        emailError instanceof Error
          ? emailError.name
          : "UnknownError"
      );

      /*
       * Account has already been
       * created in MongoDB.
       *
       * Preserve it so the user can
       * recover through the existing
       * OTP resend workflow.
       */
      return res.status(201).json({
        success: true,

        message:
          "Account created, but email delivery could not be confirmed. Please check your inbox or request a new OTP.",

        verificationRequired: true,

        emailDeliveryPending: true,

        email,
      });
    }

    /* =====================================
       STEP 8: SUCCESS
    ===================================== */

    return res.status(201).json({
      success: true,

      message:
        "Registration successful. Please verify your email address.",

      verificationRequired: true,

      email,
    });
  } catch (error: unknown) {
    /* VALIDATION ERROR */

    if (
      error instanceof RegistrationError
    ) {
      return res
        .status(error.statusCode)
        .json({
          success: false,
          message: error.message,
        });
    }

    /* DUPLICATE KEY ERROR */

    if (
      isDuplicateKeyError(error)
    ) {
      return res.status(409).json({
        success: false,

        message:
          "An account with this email or mobile number already exists.",
      });
    }

    /* MONGOOSE VALIDATION ERROR */

    if (
      error instanceof
      mongoose.Error.ValidationError
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Please check your registration details.",
      });
    }

    /* SERVER ERROR */

    console.error(
      "REGISTER_API_ERROR:",
      error instanceof Error
        ? error.name
        : "UnknownError"
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to complete registration. Please try again.",
    });
  }
}
