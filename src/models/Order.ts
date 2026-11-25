
import mongoose, {
  Schema,
  Document,
  Model,
  Types,
} from "mongoose";

/* =========================================
   TYPES
========================================= */

export type PaymentMethod =
  | "stripe"
  | "cod";

export type PaymentStatus =
  | "Pending"
  | "Paid"
  | "Failed";

export type OrderStatus =
  | "Processing"
  | "Shipped"
  | "Delivered"
  | "Cancelled"
  | "Returned";

export interface IOrderItem {
  productId: Types.ObjectId | null;
  name: string;

  // Canonical quantity field
  qty: number;

  // Legacy compatibility
  quantity?: number;

  price: number;
  size: string;
  image: string;
}

export interface IShippingAddress {
  line1: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string;
}

export interface IOrder extends Document {
  user: Types.ObjectId | null;

  email: string;
  items: IOrderItem[];

  amountTotal: number;
  currency: string;

  paymentMethod: PaymentMethod;
  status: PaymentStatus;

  stripeSessionId: string | null;

  // Optional COD retry protection
  idempotencyKey?: string | null;

  orderStatus: OrderStatus;
  shippingAddress: IShippingAddress;

  trackingId: string;

  createdAt: Date;
  updatedAt: Date;
}

/* =========================================
   CONSTANTS
========================================= */

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STRIPE_SESSION_REGEX =
  /^cs_(test|live)_[A-Za-z0-9]+$/;

const IDEMPOTENCY_KEY_REGEX =
  /^[A-Za-z0-9_-]{16,128}$/;

const MAX_PRICE_IN_PAISE =
  1_000_000_000;

const MAX_ORDER_QUANTITY = 100;
const MAX_ORDER_LINES = 50;

/* =========================================
   VALIDATION HELPERS
========================================= */

function isPositiveInteger(
  value: unknown
): boolean {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

function isValidMoney(
  value: unknown,
  allowZero = true
): boolean {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return false;
  }

  if (
    allowZero
      ? value < 0
      : value <= 0
  ) {
    return false;
  }

  const rawPaise = value * 100;
  const paise = Math.round(rawPaise);

  return (
    Number.isSafeInteger(paise) &&
    paise <= MAX_PRICE_IN_PAISE &&
    Math.abs(rawPaise - paise) < 1e-6
  );
}

/* =========================================
   ORDER ITEM SCHEMA
========================================= */

const OrderItemSchema =
  new Schema<IOrderItem>(
    {
      productId: {
        type: Schema.Types.ObjectId,
        ref: "Product",
        default: null,
      },

      name: {
        type: String,
        required: [
          true,
          "Product name is required.",
        ],
        trim: true,
        minlength: 1,
        maxlength: 200,
      },

      qty: {
        type: Number,
        required: [
          true,
          "Product quantity is required.",
        ],
        validate: {
          validator: (
            value: unknown
          ) =>
            isPositiveInteger(value) &&
            (value as number) <= 20,
          message:
            "Product quantity must be between 1 and 20.",
        },
      },

      /*
       * Legacy quantity field.
       * Existing documents remain readable.
       */

      quantity: {
        type: Number,
        required: false,
        validate: {
          validator: (
            value: unknown
          ) =>
            value == null ||
            isPositiveInteger(value),
          message:
            "Legacy quantity must be a positive integer.",
        },
      },

      price: {
        type: Number,
        required: [
          true,
          "Product price is required.",
        ],
        validate: {
          validator: (
            value: unknown
          ) =>
            isValidMoney(
              value,
              true
            ),
          message:
            "Product price must be a valid non-negative INR amount.",
        },
      },

      size: {
        type: String,
        required: [
          true,
          "Shoe size is required.",
        ],
        trim: true,
        minlength: 1,
        maxlength: 30,
      },

      image: {
        type: String,
        default: "",
        trim: true,
        maxlength: 2048,
      },
    },
    {
      _id: false,
    }
  );

/* =========================================
   LEGACY QUANTITY COMPATIBILITY
========================================= */

OrderItemSchema.pre(
  "validate",
  function () {
    const item =
      this as unknown as IOrderItem;

    if (
      (item.qty === undefined ||
        item.qty === null) &&
      isPositiveInteger(
        item.quantity
      )
    ) {
      item.qty =
        item.quantity as number;
    }
  }
);

/* =========================================
   SHIPPING ADDRESS SCHEMA
========================================= */

const ShippingAddressSchema =
  new Schema<IShippingAddress>(
    {
      line1: {
        type: String,
        default: "",
        trim: true,
        maxlength: 300,
      },

      city: {
        type: String,
        default: "",
        trim: true,
        maxlength: 100,
      },

      state: {
        type: String,
        default: "",
        trim: true,
        maxlength: 100,
      },

      postal_code: {
        type: String,
        default: "",
        trim: true,
        maxlength: 20,
      },

      country: {
        type: String,
        default: "IN",
        trim: true,
        uppercase: true,
        maxlength: 2,
      },

      phone: {
        type: String,
        default: "",
        trim: true,
        maxlength: 20,
      },
    },
    {
      _id: false,
    }
  );

/* =========================================
   MAIN ORDER SCHEMA
========================================= */

const OrderSchema =
  new Schema<IOrder>(
    {
      /* CUSTOMER */

      user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },

      email: {
        type: String,
        required: [
          true,
          "Customer email is required.",
        ],
        trim: true,
        lowercase: true,
        maxlength: 254,
        match: [
          EMAIL_REGEX,
          "Please provide a valid email address.",
        ],
      },

      /* ORDER ITEMS */

      items: {
        type: [OrderItemSchema],
        required: true,
        validate: {
          validator: (
            items: IOrderItem[]
          ) =>
            Array.isArray(items) &&
            items.length > 0 &&
            items.length <=
              MAX_ORDER_LINES,
          message:
            "An order must contain between 1 and 50 items.",
        },
      },

      /* ORDER TOTAL */

      amountTotal: {
        type: Number,
        required: [
          true,
          "Order total is required.",
        ],
        validate: {
          validator: (
            value: unknown
          ) =>
            isValidMoney(
              value,
              false
            ),
          message:
            "Order total must be a valid positive INR amount.",
        },
      },

      currency: {
        type: String,
        enum: ["INR"],
        default: "INR",
        uppercase: true,
      },

      /* PAYMENT METHOD */

      paymentMethod: {
        type: String,
        enum: [
          "stripe",
          "cod",
        ],
        required: true,
        default: "stripe",
      },

      /* PAYMENT STATUS */

      status: {
        type: String,
        enum: [
          "Pending",
          "Paid",
          "Failed",
        ],
        default: "Pending",
      },

      /* STRIPE SESSION */

      stripeSessionId: {
        type: String,
        default: null,
        trim: true,
        maxlength: 255,
      },

      /*
       * Optional idempotency key.
       *
       * Must be generated and reused by
       * the checkout flow on retries.
       */

      idempotencyKey: {
        type: String,
        default: null,
        trim: true,
        maxlength: 128,
        validate: {
          validator: (
            value: unknown
          ) =>
            value == null ||
            (
              typeof value ===
                "string" &&
              IDEMPOTENCY_KEY_REGEX.test(
                value
              )
            ),
          message:
            "Invalid idempotency key.",
        },
      },

      /* DELIVERY STATUS */

      orderStatus: {
        type: String,
        enum: [
          "Processing",
          "Shipped",
          "Delivered",
          "Cancelled",
          "Returned",
        ],
        default: "Processing",
      },

      /* SHIPPING ADDRESS */

      shippingAddress: {
        type: ShippingAddressSchema,
        default: () => ({}),
      },

      /* TRACKING */

      trackingId: {
        type: String,
        default: "",
        trim: true,
        maxlength: 150,
      },
    },
    {
      timestamps: true,
      versionKey: false,
    }
  );

/* =========================================
   CROSS-FIELD VALIDATION
========================================= */

OrderSchema.pre(
  "validate",
  function () {
    const order =
      this as IOrder;

    /* STRIPE VALIDATION */

    if (
      order.paymentMethod ===
      "stripe"
    ) {
      if (
        !order.stripeSessionId ||
        !STRIPE_SESSION_REGEX.test(
          order.stripeSessionId
        )
      ) {
        throw new Error(
          "Stripe orders require a valid Checkout Session ID."
        );
      }
    }

    /* COD VALIDATION */

    if (
      order.paymentMethod ===
      "cod"
    ) {
      if (
        order.stripeSessionId
      ) {
        throw new Error(
          "COD orders cannot have a Stripe session ID."
        );
      }

      const address =
        order.shippingAddress;

      if (
        !address ||
        address.line1.trim().length <
          5 ||
        address.city.trim().length <
          2 ||
        address.state.trim().length <
          2 ||
        !/^[1-9]\d{5}$/.test(
          address.postal_code
        ) ||
        !/^[6-9]\d{9}$/.test(
          address.phone
        ) ||
        address.country !== "IN"
      ) {
        throw new Error(
          "COD orders require a valid Indian shipping address."
        );
      }
    }

    /* ORDER QUANTITY VALIDATION */

    let totalQuantity = 0;

    for (
      const item of order.items
    ) {
      totalQuantity +=
        item.qty;

      if (
        !Number.isSafeInteger(
          totalQuantity
        ) ||
        totalQuantity >
          MAX_ORDER_QUANTITY
      ) {
        throw new Error(
          "Order quantity limit exceeded."
        );
      }
    }
  }
);

/* =========================================
   DATABASE INDEXES
========================================= */

/*
 * Prevent duplicate Stripe orders
 * with the same Checkout Session ID.
 */

OrderSchema.index(
  {
    stripeSessionId: 1,
  },
  {
    unique: true,
    name:
      "unique_stripe_session_id",
    partialFilterExpression: {
      stripeSessionId: {
        $type: "string",
      },
    },
  }
);

/*
 * Optional COD idempotency index.
 *
 * Only documents with a string key
 * are included.
 */

OrderSchema.index(
  {
    idempotencyKey: 1,
  },
  {
    unique: true,
    name:
      "unique_order_idempotency_key",
    partialFilterExpression: {
      idempotencyKey: {
        $type: "string",
      },
    },
  }
);

/* CUSTOMER ORDER HISTORY */

OrderSchema.index({
  email: 1,
  _id: -1,
});

/* USER ORDER HISTORY */

OrderSchema.index({
  user: 1,
  _id: -1,
});

/* ADMIN ORDER MANAGEMENT */

OrderSchema.index({
  orderStatus: 1,
  createdAt: -1,
});

/* PAYMENT REPORTING */

OrderSchema.index({
  paymentMethod: 1,
  status: 1,
  createdAt: -1,
});

/* RECENT ORDERS */

OrderSchema.index({
  createdAt: -1,
});

/* =========================================
   MODEL EXPORT
========================================= */

const Order: Model<IOrder> =
  (mongoose.models.Order as Model<IOrder>) ||
  mongoose.model<IOrder>(
    "Order",
    OrderSchema
  );

export default Order;
