
import type {
  NextApiRequest,
  NextApiResponse,
} from "next";

import { getSession } from "next-auth/react";

import dbConnect from "@/lib/db";
import User from "@/models/User";

/* =========================================
   TYPES
========================================= */

type ShippingAddress = {
  line1: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string;
};

type ProfileUser = {
  _id: string;
  name: string;
  email: string;
  phone: string;
  shippingAddress: ShippingAddress;
};

type ApiResponse = {
  success: boolean;
  message?: string;
  user?: ProfileUser;
};

type ProfileUpdate = {
  name?: string;
  phone?: string;
  shippingAddress?: ShippingAddress;
};

/* =========================================
   CONSTANTS
========================================= */

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PHONE_REGEX =
  /^[6-9]\d{9}$/;

const PIN_REGEX =
  /^[1-9]\d{5}$/;

const ALLOWED_FIELDS = new Set([
  "name",
  "phone",
  "shippingAddress",
]);

const ADDRESS_FIELDS = new Set([
  "line1",
  "city",
  "state",
  "postal_code",
  "country",
  "phone",
]);

/* =========================================
   CUSTOM ERROR
========================================= */

class ProfileValidationError extends Error {
  constructor(
    message: string,
    public statusCode = 400
  ) {
    super(message);
    this.name = "ProfileValidationError";
  }
}

/* =========================================
   HELPER FUNCTIONS
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

function readString(
  value: unknown
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeEmail(
  value: unknown
): string | null {
  const email = readString(
    value
  ).toLowerCase();

  if (
    !email ||
    email.length > 254 ||
    !EMAIL_REGEX.test(email)
  ) {
    return null;
  }

  return email;
}

function validateName(
  value: unknown
): string {
  if (typeof value !== "string") {
    throw new ProfileValidationError(
      "Name must be a string."
    );
  }

  const name = value.trim();

  if (
    name.length < 2 ||
    name.length > 100
  ) {
    throw new ProfileValidationError(
      "Name must contain 2 to 100 characters."
    );
  }

  return name;
}

function validatePhone(
  value: unknown,
  fieldName = "Mobile number"
): string {
  if (typeof value !== "string") {
    throw new ProfileValidationError(
      `${fieldName} must be a string.`
    );
  }

  const phone = value.trim();

  if (!PHONE_REGEX.test(phone)) {
    throw new ProfileValidationError(
      `${fieldName} must be a valid 10-digit Indian mobile number.`
    );
  }

  return phone;
}

/* =========================================
   SHIPPING ADDRESS VALIDATION
========================================= */

function validateShippingAddress(
  value: unknown
): ShippingAddress {
  if (!isPlainObject(value)) {
    throw new ProfileValidationError(
      "Shipping address must be a valid object."
    );
  }

  for (const key of Object.keys(value)) {
    if (!ADDRESS_FIELDS.has(key)) {
      throw new ProfileValidationError(
        `Invalid shipping address field: ${key}.`
      );
    }
  }

  const line1 = readString(
    value.line1
  );

  const city = readString(
    value.city
  );

  const state = readString(
    value.state
  );

  const postal_code = readString(
    value.postal_code
  );

  const country =
    value.country === undefined
      ? "IN"
      : readString(
          value.country
        ).toUpperCase();

  const phone = validatePhone(
    value.phone,
    "Shipping phone number"
  );

  if (
    line1.length < 5 ||
    line1.length > 300
  ) {
    throw new ProfileValidationError(
      "Address line must contain 5 to 300 characters."
    );
  }

  if (
    city.length < 2 ||
    city.length > 100
  ) {
    throw new ProfileValidationError(
      "City must contain 2 to 100 characters."
    );
  }

  if (
    state.length < 2 ||
    state.length > 100
  ) {
    throw new ProfileValidationError(
      "State must contain 2 to 100 characters."
    );
  }

  if (!PIN_REGEX.test(postal_code)) {
    throw new ProfileValidationError(
      "Please enter a valid 6-digit Indian PIN code."
    );
  }

  if (country !== "IN") {
    throw new ProfileValidationError(
      "Only Indian shipping addresses are supported."
    );
  }

  return {
    line1,
    city,
    state,
    postal_code,
    country,
    phone,
  };
}

/* =========================================
   RESPONSE NORMALIZATION
========================================= */

function normalizeShippingAddress(
  value: unknown
): ShippingAddress {
  const address =
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    line1: readString(
      address.line1
    ),

    city: readString(
      address.city
    ),

    state: readString(
      address.state
    ),

    postal_code: readString(
      address.postal_code
    ),

    country:
      readString(
        address.country
      ).toUpperCase() || "IN",

    phone: readString(
      address.phone
    ),
  };
}

function formatUser(
  user: {
    _id: unknown;
    name?: unknown;
    email?: unknown;
    phone?: unknown;
    shippingAddress?: unknown;
  }
): ProfileUser {
  return {
    _id: String(user._id),

    name: readString(
      user.name
    ),

    email: readString(
      user.email
    ),

    phone: readString(
      user.phone
    ),

    shippingAddress:
      normalizeShippingAddress(
        user.shippingAddress
      ),
  };
}

/* =========================================
   API HANDLER
========================================= */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  /* =====================================
     METHOD VALIDATION
  ===================================== */

  if (
    req.method !== "GET" &&
    req.method !== "PUT"
  ) {
    res.setHeader(
      "Allow",
      "GET, PUT"
    );

    return res.status(405).json({
      success: false,
      message: "Method not allowed.",
    });
  }

  res.setHeader(
    "Cache-Control",
    "private, no-store, max-age=0"
  );

  try {
    /* =====================================
       AUTHENTICATION
    ===================================== */

    const session = await getSession({
      req,
    });

    const email = normalizeEmail(
      session?.user?.email
    );

    if (!email) {
      return res.status(401).json({
        success: false,
        message:
          "Please log in to access your profile.",
      });
    }

    /* =====================================
       DATABASE CONNECTION
    ===================================== */

    await dbConnect();

    /* =====================================
       GET PROFILE
    ===================================== */

    if (req.method === "GET") {
      const user = await User.findOne({
        email,
      })
        .select(
          "_id name email phone shippingAddress"
        )
        .lean();

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      return res.status(200).json({
        success: true,
        user: formatUser(user),
      });
    }

    /* =====================================
       VALIDATE UPDATE BODY
    ===================================== */

    if (!isPlainObject(req.body)) {
      throw new ProfileValidationError(
        "Invalid profile update request."
      );
    }

    const body = req.body;

    for (const key of Object.keys(body)) {
      if (!ALLOWED_FIELDS.has(key)) {
        throw new ProfileValidationError(
          `Field "${key}" cannot be updated.`
        );
      }
    }

    const updateData: ProfileUpdate = {};

    /* =====================================
       NAME
    ===================================== */

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "name"
      )
    ) {
      updateData.name = validateName(
        body.name
      );
    }

    /* =====================================
       PHONE
    ===================================== */

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "phone"
      )
    ) {
      updateData.phone = validatePhone(
        body.phone
      );
    }

    /* =====================================
       SHIPPING ADDRESS
    ===================================== */

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "shippingAddress"
      )
    ) {
      updateData.shippingAddress =
        validateShippingAddress(
          body.shippingAddress
        );
    }

    if (
      Object.keys(updateData).length === 0
    ) {
      throw new ProfileValidationError(
        "No profile changes provided."
      );
    }

    /* =====================================
       PHONE UNIQUENESS
    ===================================== */

    if (updateData.phone) {
      const existingUser =
        await User.findOne({
          phone: updateData.phone,
          email: {
            $ne: email,
          },
        })
          .select("_id")
          .lean();

      if (existingUser) {
        throw new ProfileValidationError(
          "Phone number is already in use.",
          409
        );
      }
    }

    /* =====================================
       UPDATE PROFILE
    ===================================== */

    const updatedUser =
      await User.findOneAndUpdate(
        {
          email,
        },
        {
          $set: updateData,
        },
        {
          new: true,
          runValidators: true,
          context: "query",
        }
      )
        .select(
          "_id name email phone shippingAddress"
        )
        .lean();

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    /* =====================================
       SUCCESS RESPONSE
    ===================================== */

    return res.status(200).json({
      success: true,
      message:
        "Profile updated successfully.",
      user: formatUser(
        updatedUser
      ),
    });
  } catch (error: unknown) {
    /* =====================================
       VALIDATION ERRORS
    ===================================== */

    if (
      error instanceof
      ProfileValidationError
    ) {
      return res.status(
        error.statusCode
      ).json({
        success: false,
        message: error.message,
      });
    }

    /* =====================================
       DUPLICATE KEY ERRORS
    ===================================== */

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      return res.status(409).json({
        success: false,
        message:
          "This phone number is already registered.",
      });
    }

    /* =====================================
       MONGOOSE VALIDATION ERRORS
    ===================================== */

    if (
      error instanceof Error &&
      error.name === "ValidationError"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please check your profile information.",
      });
    }

    console.error(
      "PROFILE_API_ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to process your profile request.",
    });
  }
}
