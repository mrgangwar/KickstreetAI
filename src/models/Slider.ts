
import mongoose, {
  Schema,
  model,
  models,
  type Model,
  type HydratedDocument,
} from "mongoose";

/* =========================================
   TYPES
========================================= */

export interface ISlider {
  image: string;

  productId:
    | mongoose.Types.ObjectId
    | null;

  title: string;

  subtitle: string;

  order: number;

  isActive: boolean;

  createdAt: Date;

  updatedAt: Date;
}

export type SliderDocument =
  HydratedDocument<ISlider>;

/* =========================================
   CONSTANTS
========================================= */

const MAX_IMAGE_URL_LENGTH = 2048;

const MAX_TITLE_LENGTH = 150;

const MAX_SUBTITLE_LENGTH = 300;

const MAX_ORDER = 1000;

/* =========================================
   VALIDATION HELPERS
========================================= */

function isValidCloudinaryUrl(
  value: string
): boolean {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_IMAGE_URL_LENGTH
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
   SLIDER SCHEMA
========================================= */

const SliderSchema =
  new Schema<ISlider>(
    {
      /* ===================================
         SLIDER IMAGE
      =================================== */

      image: {
        type: String,

        required: [
          true,
          "Slider image is required.",
        ],

        trim: true,

        maxlength: [
          MAX_IMAGE_URL_LENGTH,
          "Image URL is too long.",
        ],

        validate: {
          validator:
            isValidCloudinaryUrl,

          message:
            "A valid Cloudinary HTTPS image URL is required.",
        },
      },

      /* ===================================
         LINKED PRODUCT
      =================================== */

      productId: {
        type: Schema.Types.ObjectId,

        ref: "Product",

        default: null,
      },

      /* ===================================
         SLIDER TITLE
      =================================== */

      title: {
        type: String,

        default: "",

        trim: true,

        maxlength: [
          MAX_TITLE_LENGTH,
          "Slider title must not exceed 150 characters.",
        ],
      },

      /* ===================================
         SLIDER SUBTITLE
      =================================== */

      subtitle: {
        type: String,

        default: "",

        trim: true,

        maxlength: [
          MAX_SUBTITLE_LENGTH,
          "Slider subtitle must not exceed 300 characters.",
        ],
      },

      /* ===================================
         DISPLAY ORDER
      =================================== */

      order: {
        type: Number,

        default: 0,

        min: [
          0,
          "Slider order cannot be negative.",
        ],

        max: [
          MAX_ORDER,
          "Slider order cannot exceed 1000.",
        ],

        validate: {
          validator: (
            value: number
          ) =>
            Number.isInteger(value),

          message:
            "Slider order must be a whole number.",
        },
      },

      /* ===================================
         ACTIVE STATUS
      =================================== */

      isActive: {
        type: Boolean,

        default: true,

        required: true,
      },
    },
    {
      timestamps: true,

      strict: true,

      versionKey: false,
    }
  );

/* =========================================
   DATABASE INDEXES
========================================= */

/*
 * Supports ordered slider queries.
 */

SliderSchema.index({
  order: 1,
  _id: 1,
});

/*
 * Supports active homepage
 * slider queries.
 */

SliderSchema.index({
  isActive: 1,
  order: 1,
});

/*
 * Supports product-linked
 * slider lookups.
 */

SliderSchema.index({
  productId: 1,
});

/* =========================================
   MODEL EXPORT
========================================= */

const Slider: Model<ISlider> =
  (models.Slider as Model<ISlider>) ||
  model<ISlider>(
    "Slider",
    SliderSchema
  );

export default Slider;
