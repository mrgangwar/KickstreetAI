
import type {
  NextApiRequest,
  NextApiResponse,
} from "next";

import { getServerSession } from "next-auth/next";
import Stripe from "stripe";

import { authOptions } from "../auth/[...nextauth]";
import dbConnect from "@/lib/db";
import Order from "@/models/Order";

/* =========================================
   TYPES
========================================= */

type SafeOrder = {
  _id: string;
  status: "Pending" | "Paid" | "Failed";
  paymentMethod: "stripe";
  orderStatus: string;
  amountTotal: number;
  currency: "INR";
  createdAt: string;
};

type ApiResponse = {
  success: boolean;
  pending?: boolean;
  message?: string;
  order?: SafeOrder;
};

type StoredOrder = {
  _id: unknown;
  email?: string;
  status: string;
  paymentMethod: string;
  orderStatus: string;
  amountTotal: number;
  currency?: string;
  createdAt?: Date | string;
};

/* =========================================
   CONSTANTS
========================================= */

const SESSION_ID_REGEX =
  /^cs_test_[A-Za-z0-9]+$/;

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const OBJECT_ID_REGEX =
  /^[a-fA-F0-9]{24}$/;

/* =========================================
   STRIPE CLIENT
========================================= */

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  const secretKey =
    process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured."
    );
  }

  if (!secretKey.startsWith("sk_test_")) {
    throw new Error(
      "Only Stripe test-mode keys are allowed."
    );
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }

  return stripeClient;
}

/* =========================================
   VALIDATION HELPERS
========================================= */

function isValidSessionId(
  value: unknown
): value is string {
  return (
    typeof value === "string" &&
    value.length <= 255 &&
    SESSION_ID_REGEX.test(value)
  );
}

function normalizeEmail(
  value: unknown
): string {
  if (typeof value !== "string") {
    return "";
  }

  const email = value.trim().toLowerCase();

  if (
    !email ||
    email.length > 254 ||
    !EMAIL_REGEX.test(email)
  ) {
    return "";
  }

  return email;
}

function isValidAmount(
  value: unknown
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

/* =========================================
   RESPONSE HELPERS
========================================= */

function pendingResponse(
  res: NextApiResponse<ApiResponse>,
  message: string
) {
  return res.status(200).json({
    success: false,
    pending: true,
    message,
  });
}

function errorResponse(
  res: NextApiResponse<ApiResponse>,
  statusCode: number,
  message: string
) {
  return res.status(statusCode).json({
    success: false,
    pending: false,
    message,
  });
}

/* =========================================
   MAIN API HANDLER
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

  /* ALLOW GET ONLY */

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return errorResponse(
      res,
      405,
      "Method not allowed."
    );
  }

  /* =====================================
     STEP 1: VALIDATE SESSION ID
  ===================================== */

  const sessionId =
    req.query.session_id;

  if (!isValidSessionId(sessionId)) {
    return errorResponse(
      res,
      400,
      "A valid test-mode checkout session ID is required."
    );
  }

  try {
    /* =====================================
       STEP 2: RETRIEVE STRIPE SESSION
    ===================================== */

    const stripe = getStripe();

    const checkoutSession =
      await stripe.checkout.sessions.retrieve(
        sessionId
      );

    /* =====================================
       STEP 3: VALIDATE SESSION
    ===================================== */

    if (
      checkoutSession.id !== sessionId ||
      checkoutSession.mode !== "payment" ||
      checkoutSession.currency?.toLowerCase() !==
        "inr"
    ) {
      return errorResponse(
        res,
        400,
        "Invalid checkout session."
      );
    }

    /* =====================================
       STEP 4: CUSTOMER IDENTITY
    ===================================== */

    const authSession =
      await getServerSession(
        req,
        res,
        authOptions
      );

    const authenticatedEmail =
      normalizeEmail(
        authSession?.user?.email
      );

    const metadataEmail =
      normalizeEmail(
        checkoutSession.metadata?.email
      );

    const checkoutEmail =
      normalizeEmail(
        checkoutSession.customer_details?.email ||
        checkoutSession.customer_email ||
        checkoutSession.metadata?.email
      );

    if (!checkoutEmail) {
      return errorResponse(
        res,
        409,
        "Checkout customer verification failed."
      );
    }

    if (
      metadataEmail &&
      metadataEmail !== checkoutEmail
    ) {
      return errorResponse(
        res,
        409,
        "Checkout customer information does not match."
      );
    }

    if (
      authenticatedEmail &&
      authenticatedEmail !== checkoutEmail
    ) {
      return errorResponse(
        res,
        403,
        "You are not authorized to access this order."
      );
    }

    /* =====================================
       STEP 5: PAYMENT STATUS
    ===================================== */

    if (
      checkoutSession.payment_status !== "paid"
    ) {
      return pendingResponse(
        res,
        "Payment has not been confirmed yet."
      );
    }

    /* =====================================
       STEP 6: PAYMENT AMOUNT
    ===================================== */

    const stripeAmount =
      checkoutSession.amount_total;

    if (!isValidAmount(stripeAmount)) {
      return errorResponse(
        res,
        409,
        "Invalid payment amount received."
      );
    }

    /* =====================================
       STEP 7: DATABASE
    ===================================== */

    await dbConnect();

    /* =====================================
       STEP 8: FIND ORDER
    ===================================== */

    const order =
      (await Order.findOne({
        stripeSessionId: sessionId,
        paymentMethod: "stripe",
      })
        .select(
          "_id email status paymentMethod orderStatus amountTotal currency createdAt"
        )
        .lean()) as StoredOrder | null;

    /* =====================================
       STEP 9: WEBHOOK DELAY
    ===================================== */

    if (!order) {
      return pendingResponse(
        res,
        "Payment received. Your order is being confirmed."
      );
    }

    /* =====================================
       STEP 10: VERIFY ORDER ID
    ===================================== */

    const orderId = String(order._id);

    if (!OBJECT_ID_REGEX.test(orderId)) {
      return errorResponse(
        res,
        409,
        "Order information could not be verified."
      );
    }

    /* =====================================
       STEP 11: VERIFY ORDER EMAIL
    ===================================== */

    const orderEmail =
      normalizeEmail(order.email);

    if (
      !orderEmail ||
      orderEmail !== checkoutEmail
    ) {
      console.error(
        "STRIPE_ORDER_EMAIL_MISMATCH"
      );

      return errorResponse(
        res,
        409,
        "Order verification could not be completed."
      );
    }

    /* =====================================
       STEP 12: VERIFY PAYMENT METHOD
    ===================================== */

    if (
      order.paymentMethod !== "stripe"
    ) {
      return errorResponse(
        res,
        409,
        "Order payment method mismatch."
      );
    }

    /* =====================================
       STEP 13: VERIFY PAYMENT STATUS
    ===================================== */

    if (order.status === "Failed") {
      return errorResponse(
        res,
        409,
        "Order payment verification failed. Please contact support."
      );
    }

    if (order.status !== "Paid") {
      return pendingResponse(
        res,
        "Payment received. Order confirmation is pending."
      );
    }

    /* =====================================
       STEP 14: VERIFY AMOUNT
    ===================================== */

    const rawOrderPaise =
      Number(order.amountTotal) * 100;

    const orderAmountInPaise =
      Math.round(rawOrderPaise);

    if (
      !Number.isSafeInteger(
        orderAmountInPaise
      ) ||
      Math.abs(
        rawOrderPaise - orderAmountInPaise
      ) > 1e-6 ||
      orderAmountInPaise !== stripeAmount
    ) {
      console.error(
        "STRIPE_ORDER_AMOUNT_MISMATCH"
      );

      return errorResponse(
        res,
        409,
        "Order payment verification failed."
      );
    }

    /* =====================================
       STEP 15: VERIFY CURRENCY
    ===================================== */

    const orderCurrency =
      (order.currency || "INR").toUpperCase();

    if (orderCurrency !== "INR") {
      return errorResponse(
        res,
        409,
        "Order currency verification failed."
      );
    }

    /* =====================================
       STEP 16: VERIFY CREATED DATE
    ===================================== */

    if (!order.createdAt) {
      return errorResponse(
        res,
        409,
        "Order creation date is missing."
      );
    }

    const createdAt =
      new Date(order.createdAt);

    if (
      Number.isNaN(createdAt.getTime())
    ) {
      return errorResponse(
        res,
        409,
        "Order creation date is invalid."
      );
    }

    /* =====================================
       STEP 17: SAFE ORDER RESPONSE
    ===================================== */

    const safeOrder: SafeOrder = {
      _id: orderId,
      status: "Paid",
      paymentMethod: "stripe",
      orderStatus:
        order.orderStatus || "Processing",
      amountTotal: order.amountTotal,
      currency: "INR",
      createdAt: createdAt.toISOString(),
    };

    /* =====================================
       STEP 18: SUCCESS RESPONSE
    ===================================== */

    return res.status(200).json({
      success: true,
      pending: false,
      message:
        "Payment and order verified successfully.",
      order: safeOrder,
    });
  } catch (error: unknown) {
    /* STRIPE SESSION NOT FOUND */

    if (
      error instanceof
      Stripe.errors.StripeInvalidRequestError
    ) {
      return errorResponse(
        res,
        404,
        "Checkout session not found."
      );
    }

    /* INTERNAL ERROR */

    console.error(
      "STRIPE_SESSION_VERIFICATION_ERROR:",
      error instanceof Error
        ? error.name
        : "UnknownError"
    );

    return errorResponse(
      res,
      500,
      "Unable to verify your order right now. Please try again."
    );
  }
}
