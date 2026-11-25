
import type {
  NextApiRequest,
  NextApiResponse,
} from "next";

import { getServerSession } from "next-auth/next";
import mongoose from "mongoose";

import dbConnect from "@/lib/db";
import Order from "@/models/Order";
import Product from "@/models/Product";
import User from "@/models/User";

import { authOptions } from "../auth/[...nextauth]";

/* =========================================
   TYPES
========================================= */

type DeliveryStatus =
  | "Processing"
  | "Shipped"
  | "Delivered"
  | "Cancelled"
  | "Returned";

type PaymentStatus =
  | "Pending"
  | "Paid"
  | "Failed";

type PaymentMethod =
  | "stripe"
  | "cod";

type OrderItemData = {
  productId?: unknown;
  qty?: number;
  quantity?: number;
};

type StoredOrder = {
  _id: mongoose.Types.ObjectId;
  status: PaymentStatus;
  orderStatus: DeliveryStatus;
  paymentMethod: PaymentMethod;
  items: OrderItemData[];
};

type ApiResponse = {
  success: boolean;
  message?: string;
  orders?: unknown[];
  order?: unknown;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

/* =========================================
   CONSTANTS
========================================= */

const DELIVERY_STATUSES: DeliveryStatus[] = [
  "Processing",
  "Shipped",
  "Delivered",
  "Cancelled",
  "Returned",
];

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_PAGE = 100000;

const OBJECT_ID_REGEX =
  /^[a-fA-F0-9]{24}$/;

const ORDER_LIST_FIELDS = [
  "_id",
  "email",
  "items",
  "amountTotal",
  "status",
  "orderStatus",
  "paymentMethod",
  "trackingId",
  "createdAt",
  "currency",
].join(" ");

/* =========================================
   HELPERS
========================================= */

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function parsePositiveInteger(
  value: unknown,
  fallback: number,
  maximum: number
): number | null {
  if (value === undefined) {
    return fallback;
  }

  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value)
  ) {
    return null;
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed > maximum
  ) {
    return null;
  }

  return parsed;
}

function isDeliveryStatus(
  value: unknown
): value is DeliveryStatus {
  return (
    typeof value === "string" &&
    DELIVERY_STATUSES.includes(
      value as DeliveryStatus
    )
  );
}

function isValidObjectId(
  value: unknown
): value is string {
  return (
    typeof value === "string" &&
    OBJECT_ID_REGEX.test(value)
  );
}

function getItemQuantity(
  item: OrderItemData
): number {
  const value =
    item.qty ?? item.quantity;

  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 20
  ) {
    throw new Error(
      "Order contains an invalid item quantity."
    );
  }

  return value;
}

/* =========================================
   ORDER STATUS TRANSITIONS
========================================= */

function canTransition(
  current: DeliveryStatus,
  next: DeliveryStatus
): boolean {
  if (current === next) {
    return true;
  }

  const allowed: Record<
    DeliveryStatus,
    DeliveryStatus[]
  > = {
    Processing: [
      "Shipped",
      "Cancelled",
    ],

    Shipped: [
      "Delivered",
    ],

    Delivered: [
      "Returned",
    ],

    Cancelled: [],

    Returned: [],
  };

  return allowed[current].includes(next);
}

/* =========================================
   STOCK RESTORATION DATA
========================================= */

function buildRestockMap(
  items: OrderItemData[]
): Map<string, number> {
  if (
    !Array.isArray(items) ||
    items.length === 0 ||
    items.length > 50
  ) {
    throw new Error(
      "Order items are invalid for cancellation."
    );
  }

  const restockMap =
    new Map<string, number>();

  let totalQuantity = 0;

  for (const item of items) {
    if (!item || !isRecord(item)) {
      throw new Error(
        "Invalid order item."
      );
    }

    const productId =
      String(item.productId || "");

    if (!isValidObjectId(productId)) {
      throw new Error(
        "Order product reference is invalid."
      );
    }

    const quantity =
      getItemQuantity(item);

    totalQuantity += quantity;

    if (totalQuantity > 100) {
      throw new Error(
        "Order quantity exceeds allowed limit."
      );
    }

    restockMap.set(
      productId,
      (restockMap.get(productId) || 0) +
        quantity
    );
  }

  return restockMap;
}

/* =========================================
   SAFE ORDER RESPONSE
========================================= */

function toSafeOrder(
  order: Record<string, unknown>
) {
  return {
    _id: String(order._id || ""),
    email: order.email || "",
    items: Array.isArray(order.items)
      ? order.items.map((rawItem) => {
          const item = isRecord(rawItem)
            ? rawItem
            : {};

          return {
            name:
              typeof item.name === "string"
                ? item.name
                : "",
            qty:
              typeof item.qty === "number"
                ? item.qty
                : item.quantity,
            price:
              typeof item.price === "number"
                ? item.price
                : 0,
            size:
              typeof item.size === "string"
                ? item.size
                : "",
          };
        })
      : [],
    amountTotal: order.amountTotal,
    status: order.status,
    orderStatus: order.orderStatus,
    paymentMethod: order.paymentMethod,
    trackingId:
      typeof order.trackingId === "string"
        ? order.trackingId
        : "",
    currency: order.currency || "INR",
    createdAt: order.createdAt,
  };
}

/* =========================================
   MAIN HANDLER
========================================= */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  res.setHeader(
    "Cache-Control",
    "private, no-store, max-age=0"
  );

  res.setHeader(
    "X-Robots-Tag",
    "noindex, nofollow"
  );

  /* ALLOWED METHODS */

  if (
    req.method !== "GET" &&
    req.method !== "PUT"
  ) {
    res.setHeader("Allow", "GET, PUT");

    return res.status(405).json({
      success: false,
      message: "Method not allowed.",
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

    if (!session?.user?.email) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required.",
      });
    }

    const email =
      session.user.email
        .trim()
        .toLowerCase();

    /* =====================================
       STEP 2: DATABASE
    ===================================== */

    await dbConnect();

    /* =====================================
       STEP 3: ADMIN AUTHORIZATION
    ===================================== */

    const admin = await User.findOne({
      email,
      role: "admin",
    })
      .select("_id")
      .lean();

    if (!admin) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. Admin only.",
      });
    }

    /* =====================================
       STEP 4: GET ORDERS
    ===================================== */

    if (req.method === "GET") {
      const hasPagination =
        req.query.page !== undefined ||
        req.query.limit !== undefined;

      /*
       * Compatibility with existing
       * dashboard requests.
       */
      if (!hasPagination) {
        const orders =
          await Order.find({})
            .select(ORDER_LIST_FIELDS)
            .sort({
              createdAt: -1,
              _id: -1,
            })
            .limit(MAX_LIMIT)
            .lean();

        return res.status(200).json({
          success: true,
          orders: orders.map((order) =>
            toSafeOrder(
              order as unknown as Record<string, unknown>
            )
          ),
        });
      }

      /* PAGINATION */

      const page =
        parsePositiveInteger(
          req.query.page,
          1,
          MAX_PAGE
        );

      const limit =
        parsePositiveInteger(
          req.query.limit,
          DEFAULT_LIMIT,
          MAX_LIMIT
        );

      if (
        page === null ||
        limit === null
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid pagination parameters.",
        });
      }

      const skip =
        (page - 1) * limit;

      if (
        !Number.isSafeInteger(skip)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid pagination range.",
        });
      }

      const [orders, total] =
        await Promise.all([
          Order.find({})
            .select(ORDER_LIST_FIELDS)
            .sort({
              createdAt: -1,
              _id: -1,
            })
            .skip(skip)
            .limit(limit)
            .lean(),

          Order.countDocuments({}),
        ]);

      return res.status(200).json({
        success: true,
        orders: orders.map((order) =>
          toSafeOrder(
            order as unknown as Record<string, unknown>
          )
        ),
        pagination: {
          page,
          limit,
          total,
          totalPages:
            Math.ceil(total / limit),
        },
      });
    }

    /* =====================================
       STEP 5: VALIDATE PUT BODY
    ===================================== */

    if (!isRecord(req.body)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid request body.",
      });
    }

    const {
      orderId,
      orderStatus,
      status,
    } = req.body;

    if (!isValidObjectId(orderId)) {
      return res.status(400).json({
        success: false,
        message:
          "A valid order ID is required.",
      });
    }

    if (
      orderStatus === undefined &&
      status === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Provide an order status to update.",
      });
    }

    if (
      orderStatus !== undefined &&
      !isDeliveryStatus(orderStatus)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid delivery status.",
      });
    }

    /*
     * Only Pending -> Paid is supported
     * for COD payment collection.
     */
    if (
      status !== undefined &&
      status !== "Paid"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Only marking a COD payment as Paid is supported.",
      });
    }

    /*
     * Do not mix payment collection and
     * delivery transitions in one request.
     */
    if (
      status !== undefined &&
      orderStatus !== undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Update payment and delivery statuses separately.",
      });
    }

    /* =====================================
       STEP 6: LOAD ORDER
    ===================================== */

    const existingOrder =
      await Order.findById(orderId)
        .select(
          "_id status orderStatus paymentMethod items"
        )
        .lean() as StoredOrder | null;

    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        message:
          "Order not found.",
      });
    }

    /* =====================================
       STEP 7: COD PAYMENT UPDATE
    ===================================== */

    if (status !== undefined) {
      if (
        existingOrder.paymentMethod !==
        "cod"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Stripe payment status cannot be changed manually.",
        });
      }

      if (
        existingOrder.orderStatus ===
          "Cancelled" ||
        existingOrder.orderStatus ===
          "Returned"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Cannot collect payment for a cancelled or returned order.",
        });
      }

      if (
        existingOrder.status === "Paid"
      ) {
        return res.status(200).json({
          success: true,
          message:
            "COD payment is already marked as paid.",
        });
      }

      if (
        existingOrder.status !== "Pending"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Only pending COD payments can be marked as paid.",
        });
      }

      const updatedOrder =
        await Order.findOneAndUpdate(
          {
            _id: orderId,
            paymentMethod: "cod",
            status: "Pending",
            orderStatus: {
              $nin: [
                "Cancelled",
                "Returned",
              ],
            },
          },
          {
            $set: {
              status: "Paid",
            },
          },
          {
            new: true,
            runValidators: true,
          }
        );

      if (!updatedOrder) {
        return res.status(409).json({
          success: false,
          message:
            "Order changed. Refresh and try again.",
        });
      }

      return res.status(200).json({
        success: true,
        message:
          "COD payment marked as paid.",
        order: toSafeOrder(
          updatedOrder.toObject() as unknown as Record<
            string,
            unknown
          >
        ),
      });
    }

    /* =====================================
       STEP 8: DELIVERY TRANSITION
    ===================================== */

    const nextStatus =
      orderStatus as DeliveryStatus;

    const currentStatus =
      existingOrder.orderStatus;

    if (
      currentStatus === nextStatus
    ) {
      return res.status(200).json({
        success: true,
        message:
          "Order already has this status.",
      });
    }

    if (
      !canTransition(
        currentStatus,
        nextStatus
      )
    ) {
      return res.status(409).json({
        success: false,
        message:
          `Cannot change order from ${currentStatus} to ${nextStatus}.`,
      });
    }

    /*
     * Stripe payments must be paid
     * before shipping.
     */
    if (
      nextStatus === "Shipped" &&
      existingOrder.paymentMethod ===
        "stripe" &&
      existingOrder.status !== "Paid"
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Stripe payment must be confirmed before shipping.",
      });
    }

    /* =====================================
       STEP 9: NORMAL STATUS UPDATE
    ===================================== */

    if (
      nextStatus !== "Cancelled"
    ) {
      const updatedOrder =
        await Order.findOneAndUpdate(
          {
            _id: orderId,
            status:
              existingOrder.status,
            orderStatus:
              currentStatus,
          },
          {
            $set: {
              orderStatus:
                nextStatus,
            },
          },
          {
            new: true,
            runValidators: true,
          }
        );

      if (!updatedOrder) {
        return res.status(409).json({
          success: false,
          message:
            "Order changed. Refresh and try again.",
        });
      }

      return res.status(200).json({
        success: true,
        message:
          "Order status updated successfully.",
        order: toSafeOrder(
          updatedOrder.toObject() as unknown as Record<
            string,
            unknown
          >
        ),
      });
    }

    /* =====================================
       STEP 10: CANCEL + RESTORE STOCK
    ===================================== */

    /*
     * Cancellation and inventory
     * restoration must commit together.
     *
     * Requires MongoDB transactions,
     * supported by MongoDB Atlas.
     */

    const mongoSession =
      await mongoose.startSession();

    let cancelledOrder:
      Record<string, unknown> | null = null;

    try {
      await mongoSession.withTransaction(
        async () => {
          /*
           * Re-read inside transaction.
           * Prevent stale status updates.
           */
          const order =
            await Order.findById(orderId)
              .session(mongoSession);

          if (!order) {
            throw new Error(
              "ORDER_NOT_FOUND"
            );
          }

          if (
            order.orderStatus !==
              "Processing" ||
            order.status !==
              existingOrder.status
          ) {
            throw new Error(
              "ORDER_CHANGED"
            );
          }

          /*
           * Build restock quantities
           * before modifying the order.
           */
          const restockMap =
            buildRestockMap(
              order.items.map(
                (item) => ({
                  productId:
                    item.productId,
                  qty: item.qty,
                  quantity:
                    item.quantity,
                })
              )
            );

          /*
           * Update order first.
           * The transaction rolls back
           * if inventory update fails.
           */
          const updatedOrder =
            await Order.findOneAndUpdate(
              {
                _id: orderId,
                orderStatus:
                  "Processing",
                status:
                  existingOrder.status,
              },
              {
                $set: {
                  orderStatus:
                    "Cancelled",
                },
              },
              {
                new: true,
                runValidators: true,
                session: mongoSession,
              }
            );

          if (!updatedOrder) {
            throw new Error(
              "ORDER_CHANGED"
            );
          }

          /*
           * Restore stock once for
           * each product.
           */
          for (const [
            productId,
            quantity,
          ] of restockMap) {
            const result =
              await Product.updateOne(
                {
                  _id: productId,
                },
                {
                  $inc: {
                    stock: quantity,
                  },
                },
                {
                  session:
                    mongoSession,
                }
              );

            if (
              result.matchedCount !== 1
            ) {
              throw new Error(
                "PRODUCT_NOT_FOUND"
              );
            }
          }

          cancelledOrder =
            updatedOrder.toObject() as unknown as Record<
              string,
              unknown
            >;
        }
      );

      if (!cancelledOrder) {
        throw new Error(
          "ORDER_CANCELLATION_FAILED"
        );
      }

      return res.status(200).json({
        success: true,
        message:
          "Order cancelled and stock restored successfully.",
        order: toSafeOrder(
          cancelledOrder
        ),
      });
    } catch (error: unknown) {
      const errorCode =
        error instanceof Error
          ? error.message
          : "";

      if (
        errorCode === "ORDER_CHANGED"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Order changed. Refresh and try again.",
        });
      }

      if (
        errorCode === "PRODUCT_NOT_FOUND"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "A product linked to this order no longer exists. Cancellation requires manual review.",
        });
      }

      if (
        errorCode === "ORDER_NOT_FOUND"
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Order not found.",
        });
      }

      throw error;
    } finally {
      await mongoSession.endSession();
    }
  } catch (error: unknown) {
    console.error(
      "ADMIN_ORDERS_API_ERROR:",
      error instanceof Error
        ? error.name
        : "UnknownError"
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to process the order request.",
    });
  }
}
