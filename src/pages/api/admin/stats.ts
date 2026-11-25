
import type {
  NextApiRequest,
  NextApiResponse,
} from "next";

import mongoose from "mongoose";

import { getServerSession } from "next-auth/next";

import dbConnect from "@/lib/db";

import Order from "@/models/Order";
import Product from "@/models/Product";
import User from "@/models/User";

import { authOptions } from "@/pages/api/auth/[...nextauth]";

/* =========================================
   TYPES
========================================= */

type DateFilter =
  | "all"
  | "today"
  | "week"
  | "month";

type PaymentStatus =
  | "Pending"
  | "Paid"
  | "Failed";

type OrderStatus =
  | "Processing"
  | "Shipped"
  | "Delivered"
  | "Cancelled"
  | "Returned";

interface DashboardOrder {
  _id: string;
  email: string;
  amountTotal: number;
  status: string;
  orderStatus: string;
  createdAt: string;
}

interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  productsCount: number;
  pendingOrders: number;
  paidOrders: number;
  failedOrders: number;
  processingOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  recentOrders: DashboardOrder[];
  allOrders: DashboardOrder[];
  filter: DateFilter;
}

type ApiResponse =
  | {
      success: true;
      stats: DashboardStats;
    }
  | {
      success: false;
      message: string;
    };

/* =========================================
   CONSTANTS
========================================= */

const RECENT_ORDERS_LIMIT = 10;

const REPORT_ORDERS_LIMIT = 500;

const IST_OFFSET_MS =
  5.5 * 60 * 60 * 1000;

/* =========================================
   HELPERS
========================================= */

function isValidObjectId(
  value: unknown
): value is string {
  return (
    typeof value === "string" &&
    /^[a-fA-F0-9]{24}$/.test(value) &&
    mongoose.Types.ObjectId.isValid(value)
  );
}

function isDateFilter(
  value: unknown
): value is DateFilter {
  return (
    value === "all" ||
    value === "today" ||
    value === "week" ||
    value === "month"
  );
}

/**
 * Calculate date boundaries using
 * India Standard Time (UTC+05:30).
 *
 * Week starts on Monday.
 * Month starts on calendar day 1.
 */
function getDateRange(
  filter: DateFilter
): Record<string, unknown> {
  if (filter === "all") {
    return {};
  }

  const now = new Date();

  const istNow = new Date(
    now.getTime() + IST_OFFSET_MS
  );

  const year =
    istNow.getUTCFullYear();

  const month =
    istNow.getUTCMonth();

  const day =
    istNow.getUTCDate();

  let startInIST: number;

  if (filter === "today") {
    startInIST = Date.UTC(
      year,
      month,
      day
    );
  } else if (filter === "week") {
    const weekday =
      istNow.getUTCDay();

    const daysSinceMonday =
      (weekday + 6) % 7;

    startInIST = Date.UTC(
      year,
      month,
      day - daysSinceMonday
    );
  } else {
    startInIST = Date.UTC(
      year,
      month,
      1
    );
  }

  const startUTC = new Date(
    startInIST - IST_OFFSET_MS
  );

  return {
    createdAt: {
      $gte: startUTC,
      $lte: now,
    },
  };
}

function safeNumber(
  value: unknown
): number {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  )
    ? value
    : 0;
}

function serializeOrder(
  order: {
    _id: unknown;
    email?: string;
    amountTotal?: number;
    status?: string;
    orderStatus?: string;
    createdAt?: Date;
  }
): DashboardOrder {
  return {
    _id: String(order._id),

    email:
      typeof order.email === "string"
        ? order.email
        : "",

    amountTotal:
      safeNumber(order.amountTotal),

    status:
      typeof order.status === "string"
        ? order.status
        : "Unknown",

    orderStatus:
      typeof order.orderStatus === "string"
        ? order.orderStatus
        : "Unknown",

    createdAt:
      order.createdAt instanceof Date
        ? order.createdAt.toISOString()
        : "",
  };
}

/* =========================================
   ADMIN AUTHORIZATION
========================================= */

async function verifyAdmin(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<boolean> {
  const session =
    await getServerSession(
      req,
      res,
      authOptions
    );

  const userId =
    session?.user?.id;

  if (
    !session ||
    !isValidObjectId(userId)
  ) {
    res.status(401).json({
      success: false,
      message:
        "Authentication required.",
    });

    return false;
  }

  const adminExists =
    await User.exists({
      _id: userId,
      role: "admin",
      isVerified: true,
    });

  if (!adminExists) {
    res.status(403).json({
      success: false,
      message:
        "Admin access required.",
    });

    return false;
  }

  return true;
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
    "X-Content-Type-Options",
    "nosniff"
  );

  /* =====================================
     METHOD VALIDATION
  ===================================== */

  if (req.method !== "GET") {
    res.setHeader(
      "Allow",
      "GET"
    );

    return res.status(405).json({
      success: false,
      message:
        "Method not allowed.",
    });
  }

  /* =====================================
     FILTER VALIDATION
  ===================================== */

  const rawFilter =
    req.query.filter;

  const filter =
    rawFilter === undefined
      ? "all"
      : rawFilter;

  if (!isDateFilter(filter)) {
    return res.status(400).json({
      success: false,
      message:
        "Invalid filter. Use all, today, week or month.",
    });
  }

  try {
    /* ===================================
       DATABASE CONNECTION
    =================================== */

    await dbConnect();

    /* ===================================
       ADMIN AUTHORIZATION
    =================================== */

    const authorized =
      await verifyAdmin(req, res);

    if (!authorized) {
      return;
    }

    /* ===================================
       DATE FILTER
    =================================== */

    const dateFilter =
      getDateRange(filter);

    /* ===================================
       AGGREGATE ORDER METRICS
    =================================== */

    const [
      orderSummary,
      productsCount,
      recentOrdersRaw,
      reportOrdersRaw,
    ] = await Promise.all([
      Order.aggregate([
        {
          $match: dateFilter,
        },
        {
          $group: {
            _id: null,

            totalOrders: {
              $sum: 1,
            },

            totalRevenue: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {
                        $eq: [
                          "$status",
                          "Paid",
                        ],
                      },
                      {
                        $ne: [
                          "$orderStatus",
                          "Cancelled",
                        ],
                      },
                      {
                        $ne: [
                          "$orderStatus",
                          "Returned",
                        ],
                      },
                    ],
                  },
                  "$amountTotal",
                  0,
                ],
              },
            },

            pendingOrders: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "Pending",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            paidOrders: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "Paid",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            failedOrders: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "Failed",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            processingOrders: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$orderStatus",
                      "Processing",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            shippedOrders: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$orderStatus",
                      "Shipped",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            deliveredOrders: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$orderStatus",
                      "Delivered",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            cancelledOrders: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$orderStatus",
                      "Cancelled",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),

      /* =================================
         PRODUCT COUNT
      ================================= */

      Product.countDocuments({
        isActive: {
          $ne: false,
        },
      }),

      /* =================================
         RECENT ORDERS
      ================================= */

      Order.find(dateFilter)
        .sort({
          createdAt: -1,
          _id: -1,
        })
        .limit(RECENT_ORDERS_LIMIT)
        .select(
          "_id email amountTotal status orderStatus createdAt"
        )
        .lean(),

      /* =================================
         REPORT ORDER RECORDS
      ================================= */

      Order.find(dateFilter)
        .sort({
          createdAt: -1,
          _id: -1,
        })
        .limit(REPORT_ORDERS_LIMIT)
        .select(
          "_id email amountTotal status orderStatus createdAt"
        )
        .lean(),
    ]);

    /* ===================================
       SUMMARY
    =================================== */

    const summary =
      orderSummary[0] || {};

    const stats: DashboardStats = {
      totalRevenue:
        safeNumber(
          summary.totalRevenue
        ),

      totalOrders:
        safeNumber(
          summary.totalOrders
        ),

      productsCount,

      pendingOrders:
        safeNumber(
          summary.pendingOrders
        ),

      paidOrders:
        safeNumber(
          summary.paidOrders
        ),

      failedOrders:
        safeNumber(
          summary.failedOrders
        ),

      processingOrders:
        safeNumber(
          summary.processingOrders
        ),

      shippedOrders:
        safeNumber(
          summary.shippedOrders
        ),

      deliveredOrders:
        safeNumber(
          summary.deliveredOrders
        ),

      cancelledOrders:
        safeNumber(
          summary.cancelledOrders
        ),

      recentOrders:
        recentOrdersRaw.map(
          serializeOrder
        ),

      allOrders:
        reportOrdersRaw.map(
          serializeOrder
        ),

      filter,
    };

    /* ===================================
       SUCCESS RESPONSE
    =================================== */

    return res.status(200).json({
      success: true,
      stats,
    });
  } catch (error: unknown) {
    console.error(
      "[ADMIN_STATS_ERROR]",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to fetch dashboard statistics.",
    });
  }
}
