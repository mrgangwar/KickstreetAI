
import type {
  NextApiRequest,
  NextApiResponse,
} from "next";

import { getServerSession } from "next-auth/next";
import mongoose from "mongoose";

import dbConnect from "@/lib/db";
import Order from "@/models/Order";

import { authOptions } from "../auth/[...nextauth]";

/* =========================================
   TYPES
========================================= */

type PaymentStatus =
  | "Pending"
  | "Paid"
  | "Failed";

type DeliveryStatus =
  | "Processing"
  | "Shipped"
  | "Delivered"
  | "Cancelled"
  | "Returned";

type PaymentMethod =
  | "stripe"
  | "cod";

type OrderItemResponse = {
  productId: string | null;
  name: string;
  qty: number;
  quantity: number;
  price: number;
  size: string;
  image: string;
};

type OrderResponse = {
  _id: string;
  items: OrderItemResponse[];
  amountTotal: number;
  currency: string;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  orderStatus: DeliveryStatus;
  trackingId: string;
  createdAt: string;
  updatedAt: string;
};

type ApiResponse = {
  success: boolean;
  orders?: OrderResponse[];
  message?: string;
  hasMore?: boolean;
  nextCursor?: string | null;
};

type StoredOrderItem = {
  productId?: unknown;
  name?: unknown;
  qty?: unknown;
  quantity?: unknown;
  price?: unknown;
  size?: unknown;
  image?: unknown;
};

type StoredOrder = {
  _id: mongoose.Types.ObjectId;
  items?: StoredOrderItem[];
  amountTotal?: unknown;
  currency?: unknown;
  paymentMethod?: unknown;
  status?: unknown;
  orderStatus?: unknown;
  trackingId?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

/* =========================================
   CONSTANTS
========================================= */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const OBJECT_ID_REGEX =
  /^[a-fA-F0-9]{24}$/;

const ORDER_FIELDS = [
  "_id",
  "items",
  "amountTotal",
  "currency",
  "paymentMethod",
  "status",
  "orderStatus",
  "trackingId",
  "createdAt",
  "updatedAt",
].join(" ");

/* =========================================
   HELPERS
========================================= */

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
    !email ||
    email.length > 254 ||
    !EMAIL_REGEX.test(email)
  ) {
    return null;
  }

  return email;
}

function parseLimit(
  value: string | string[] | undefined
): number | null {
  if (value === undefined) {
    return DEFAULT_LIMIT;
  }

  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value)
  ) {
    return null;
  }

  const limit = Number(value);

  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_LIMIT
  ) {
    return null;
  }

  return limit;
}

function parseCursor(
  value: string | string[] | undefined
): mongoose.Types.ObjectId | null | false {
  if (value === undefined) {
    return null;
  }

  if (
    typeof value !== "string" ||
    !OBJECT_ID_REGEX.test(value)
  ) {
    return false;
  }

  return new mongoose.Types.ObjectId(
    value
  );
}

function safeString(
  value: unknown,
  fallback = ""
): string {
  return typeof value === "string"
    ? value
    : fallback;
}

function safeMoney(
  value: unknown
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return 0;
  }

  return value;
}

function normalizeQuantity(
  item: StoredOrderItem
): number {
  const value =
    item.qty ?? item.quantity;

  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  ) {
    return value;
  }

  return 0;
}

function toDateString(
  value: unknown
): string {
  if (value instanceof Date) {
    return Number.isNaN(
      value.getTime()
    )
      ? ""
      : value.toISOString();
  }

  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    return "";
  }

  const date = new Date(value);

  return Number.isNaN(
    date.getTime()
  )
    ? ""
    : date.toISOString();
}

function normalizePaymentMethod(
  value: unknown
): PaymentMethod {
  return value === "stripe"
    ? "stripe"
    : "cod";
}

function normalizePaymentStatus(
  value: unknown
): PaymentStatus {
  if (
    value === "Paid" ||
    value === "Failed"
  ) {
    return value;
  }

  return "Pending";
}

function normalizeDeliveryStatus(
  value: unknown
): DeliveryStatus {
  switch (value) {
    case "Shipped":
    case "Delivered":
    case "Cancelled":
    case "Returned":
      return value;

    default:
      return "Processing";
  }
}

/* =========================================
   FORMAT ORDER ITEM
========================================= */

function formatOrderItem(
  item: StoredOrderItem
): OrderItemResponse {
  const quantity =
    normalizeQuantity(item);

  const productId =
    item.productId
      ? String(item.productId)
      : null;

  return {
    productId:
      productId &&
      OBJECT_ID_REGEX.test(productId)
        ? productId
        : null,

    name:
      safeString(item.name) ||
      "Product",

    qty: quantity,

    /*
     * Legacy frontend compatibility.
     */
    quantity,

    price:
      safeMoney(item.price),

    size:
      safeString(item.size),

    image:
      safeString(item.image),
  };
}

/* =========================================
   FORMAT ORDER
========================================= */

function formatOrder(
  order: StoredOrder
): OrderResponse {
  return {
    _id: String(order._id),

    items: Array.isArray(order.items)
      ? order.items.map(
          formatOrderItem
        )
      : [],

    amountTotal:
      safeMoney(
        order.amountTotal
      ),

    currency:
      safeString(
        order.currency,
        "INR"
      ),

    paymentMethod:
      normalizePaymentMethod(
        order.paymentMethod
      ),

    status:
      normalizePaymentStatus(
        order.status
      ),

    orderStatus:
      normalizeDeliveryStatus(
        order.orderStatus
      ),

    trackingId:
      safeString(
        order.trackingId
      ),

    createdAt:
      toDateString(
        order.createdAt
      ),

    updatedAt:
      toDateString(
        order.updatedAt
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
  /* SECURITY HEADERS */

  res.setHeader(
    "Cache-Control",
    "private, no-store, max-age=0"
  );

  res.setHeader(
    "X-Robots-Tag",
    "noindex, nofollow"
  );

  /* GET ONLY */

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      success: false,
      message:
        "Method not allowed.",
    });
  }

  try {
    /* =====================================
       STEP 1: AUTHENTICATION
    ===================================== */

    const session =
      await getServerSession(
        req,
        res,
        authOptions
      );

    if (!session?.user) {
      return res.status(401).json({
        success: false,
        message:
          "Please log in to view your orders.",
      });
    }

    const email =
      normalizeEmail(
        session.user.email
      );

    if (!email) {
      return res.status(401).json({
        success: false,
        message:
          "Your session is invalid. Please log in again.",
      });
    }

    /* =====================================
       STEP 2: VALIDATE QUERY
    ===================================== */

    const limit =
      parseLimit(
        req.query.limit
      );

    if (limit === null) {
      return res.status(400).json({
        success: false,
        message:
          "Limit must be between 1 and 50.",
      });
    }

    const cursor =
      parseCursor(
        req.query.cursor
      );

    if (cursor === false) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid pagination cursor.",
      });
    }

    /* =====================================
       STEP 3: DATABASE
    ===================================== */

    await dbConnect();

    /* =====================================
       STEP 4: BUILD QUERY
    ===================================== */

    /*
     * Existing ownership model:
     * orders are linked by email.
     *
     * This includes guest orders
     * using the same email.
     */
    const query: {
      email: string;
      _id?: {
        $lt: mongoose.Types.ObjectId;
      };
    } = {
      email,
    };

    if (cursor) {
      query._id = {
        $lt: cursor,
      };
    }

    /* =====================================
       STEP 5: FETCH ORDERS
    ===================================== */

    const records =
      (await Order.find(query)
        .select(ORDER_FIELDS)
        .sort({
          _id: -1,
        })
        .limit(limit + 1)
        .lean()) as unknown as StoredOrder[];

    /* =====================================
       STEP 6: PAGINATION
    ===================================== */

    const hasMore =
      records.length > limit;

    const pageRecords =
      hasMore
        ? records.slice(
            0,
            limit
          )
        : records;

    /* =====================================
       STEP 7: FORMAT
    ===================================== */

    const orders =
      pageRecords.map(
        formatOrder
      );

    const lastOrder =
      pageRecords[
        pageRecords.length - 1
      ];

    /* =====================================
       STEP 8: RESPONSE
    ===================================== */

    return res.status(200).json({
      success: true,
      orders,
      hasMore,
      nextCursor:
        hasMore && lastOrder
          ? String(
              lastOrder._id
            )
          : null,
    });
  } catch (error: unknown) {
    console.error(
      "MY_ORDERS_API_ERROR:",
      error instanceof Error
        ? error.name
        : "UnknownError"
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load your orders. Please try again.",
    });
  }
}
