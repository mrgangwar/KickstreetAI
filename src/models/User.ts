
import mongoose, {
  Schema,
  Document,
  Model,
  Types,
} from "mongoose";

/* =========================================
   TYPES
========================================= */

export type UserRole =
  | "user"
  | "admin";

export interface IUserShippingAddress {
  line1: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string;
}

export interface IUserPreferences {
  gender?: string;
  category?: string;
  brands?: string[];
  colors?: string[];
  useCases?: string[];
  minPrice?: number | null;
  maxPrice?: number | null;
  priorities?: Record<string, number>;
}

export interface IUser extends Document {
  _id: Types.ObjectId;

  name: string;
  email: string;
  phone: string;

  password: string;

  role: UserRole;

  isVerified: boolean;

  otp?: string;
  otpExpires?: Date;

  shippingAddress: IUserShippingAddress;
  preferences?: IUserPreferences;

  createdAt: Date;
  updatedAt: Date;
}

/* =========================================
   VALIDATION CONSTANTS
========================================= */

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PHONE_REGEX =
  /^[6-9]\d{9}$/;

const PIN_REGEX =
  /^[1-9]\d{5}$/;

const OTP_REGEX =
  /^\d{6}$/;

/* =========================================
   SHIPPING ADDRESS SCHEMA
========================================= */

const ShippingAddressSchema =
  new Schema<IUserShippingAddress>(
    {
      line1: {
        type: String,
        default: "",
        trim: true,
        maxlength: [
          300,
          "Address cannot exceed 300 characters.",
        ],
      },

      city: {
        type: String,
        default: "",
        trim: true,
        maxlength: [
          100,
          "City cannot exceed 100 characters.",
        ],
      },

      state: {
        type: String,
        default: "",
        trim: true,
        maxlength: [
          100,
          "State cannot exceed 100 characters.",
        ],
      },

      postal_code: {
        type: String,
        default: "",
        trim: true,
        validate: {
          validator(
            value: string
          ): boolean {
            return (
              !value ||
              PIN_REGEX.test(value)
            );
          },
          message:
            "Please enter a valid 6-digit PIN code.",
        },
      },

      country: {
        type: String,
        default: "IN",
        trim: true,
        uppercase: true,
        enum: {
          values: ["IN"],
          message:
            "Only Indian shipping addresses are supported.",
        },
      },

      phone: {
        type: String,
        default: "",
        trim: true,
        validate: {
          validator(
            value: string
          ): boolean {
            return (
              !value ||
              PHONE_REGEX.test(value)
            );
          },
          message:
            "Please enter a valid 10-digit mobile number.",
        },
      },
    },
    {
      _id: false,
      strict: true,
    }
  );

/* =========================================
   USER SCHEMA
========================================= */

const UserSchema = new Schema<IUser>(
  {
    /* =====================================
       NAME
    ===================================== */

    name: {
      type: String,

      required: [
        true,
        "Name is required.",
      ],

      trim: true,

      minlength: [
        2,
        "Name must contain at least 2 characters.",
      ],

      maxlength: [
        100,
        "Name cannot exceed 100 characters.",
      ],
    },

    /* =====================================
       EMAIL
    ===================================== */

    email: {
      type: String,

      required: [
        true,
        "Email is required.",
      ],

      unique: true,

      lowercase: true,

      trim: true,

      maxlength: [
        254,
        "Email cannot exceed 254 characters.",
      ],

      match: [
        EMAIL_REGEX,
        "Please enter a valid email address.",
      ],
    },

    /* =====================================
       PHONE
    ===================================== */

    phone: {
      type: String,

      required: [
        true,
        "Phone number is required.",
      ],

      unique: true,

      trim: true,

      match: [
        PHONE_REGEX,
        "Please enter a valid 10-digit mobile number.",
      ],
    },

    /* =====================================
       PASSWORD

       Authentication APIs must hash
       passwords before saving.

       select: false prevents accidental
       inclusion in normal queries.
    ===================================== */

    password: {
      type: String,

      required: [
        true,
        "Password is required.",
      ],

      select: false,

      minlength: [
        20,
        "Stored password hash is invalid.",
      ],
    },

    /* =====================================
       USER ROLE
    ===================================== */

    role: {
      type: String,

      enum: {
        values: [
          "user",
          "admin",
        ],

        message:
          "Invalid user role.",
      },

      default: "user",

      required: true,
    },

    /* =====================================
       EMAIL VERIFICATION
    ===================================== */

    isVerified: {
      type: Boolean,

      default: false,

      required: true,
    },

    /* =====================================
       OTP

       Current auth APIs expect a
       six-digit OTP.

       Do not change to hashed OTP
       without updating verification
       and resend endpoints together.
    ===================================== */

    otp: {
      type: String,

      select: false,

      default: undefined,

      validate: {
        validator(
          value: string | null | undefined
        ): boolean {
          return (
            value == null ||
            OTP_REGEX.test(value)
          );
        },

        message:
          "OTP must contain exactly 6 digits.",
      },
    },

    /* =====================================
       OTP EXPIRY
    ===================================== */

    otpExpires: {
      type: Date,

      select: false,

      default: undefined,

      validate: {
        validator(
          value: Date | null | undefined
        ): boolean {
          return (
            value == null ||
            (
              value instanceof Date &&
              !Number.isNaN(
                value.getTime()
              )
            )
          );
        },

        message:
          "Invalid OTP expiry date.",
      },
    },

    /* =====================================
       SHIPPING ADDRESS
    ===================================== */

    shippingAddress: {
      type: ShippingAddressSchema,

      default: () => ({}),
    },

    /* =====================================
       SOLEMATCH AI USER PREFERENCES
    ===================================== */

    preferences: {
      type: {
        gender: { type: String, trim: true, default: "" },
        category: { type: String, trim: true, default: "" },
        brands: { type: [String], default: [] },
        colors: { type: [String], default: [] },
        useCases: { type: [String], default: [] },
        minPrice: { type: Number, default: null },
        maxPrice: { type: Number, default: null },
        priorities: { type: Schema.Types.Mixed, default: () => ({}) },
      },
      default: () => ({}),
    },
  },
  {
    timestamps: true,

    versionKey: false,

    strict: true,

    minimize: true,
  }
);

/* =========================================
   PASSWORD HANDLING
========================================= */

/*
 * Password hashing is performed by
 * the authentication API layer.
 *
 * Existing endpoints use:
 *
 * hashPassword(password)
 *
 * before saving a user or updating
 * their password.
 *
 * Do not introduce a pre-save hashing
 * hook without updating all existing
 * authentication endpoints.
 *
 * Otherwise double hashing could
 * prevent users from logging in.
 */

/* =========================================
   DATABASE INDEXES
========================================= */

/*
 * Email and phone already declare
 * unique indexes in their schema
 * definitions.
 *
 * Do not add duplicate indexes here.
 */

/* ADMIN USERS */

UserSchema.index({
  role: 1,
  createdAt: -1,
});

/* EMAIL VERIFICATION */

UserSchema.index({
  isVerified: 1,
  createdAt: -1,
});

/* =========================================
   MODEL EXPORT
========================================= */

/*
 * Reuse the compiled model during
 * Next.js development hot reload.
 */

const User: Model<IUser> =
  (mongoose.models.User as Model<IUser>) ||
  mongoose.model<IUser>(
    "User",
    UserSchema
  );

export default User;
