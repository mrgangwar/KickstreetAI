
import type {
  NextApiRequest,
  NextApiResponse,
} from "next";

import Stripe from "stripe";
import mongoose from "mongoose";

import dbConnect from "@/lib/db";
import Order from "@/models/Order";
import Product from "@/models/Product";

/* =========================================
   DISABLE BODY PARSER
========================================= */

export const config = {
  api: {
    bodyParser: false,
  },
};

/* =========================================
   TYPES
========================================= */

type ApiResponse = {
  received?: boolean;
  message?: string;
};

type MetadataItem = {
  id: string;
  size: string;
  qty: number;
};

type VerifiedProduct = {
  _id: mongoose.Types.ObjectId;
  name: string;
  stock: number;
  sizes: string[];
  images?: string[];
  isActive?: boolean;
};

type VerifiedOrderItem = MetadataItem & {
  unitAmount: number;
};

type OrderItem = {
  productId: mongoose.Types.ObjectId;
  name: string;
  qty: number;
  price: number;
  size: string;
  image: string;
};

/* =========================================
   CONSTANTS
========================================= */

const MAX_WEBHOOK_BODY_BYTES =
  1024 * 1024;

const MAX_METADATA_ITEMS = 50;
const MAX_ITEM_QUANTITY = 20;
const MAX_TOTAL_QUANTITY = 100;

const MAX_PRICE_IN_PAISE =
  1_000_000_000;

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const OBJECT_ID_REGEX =
  /^[a-fA-F0-9]{24}$/;

/* =========================================
   STRIPE CLIENT
========================================= */

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured."
    );
  }

  /*
   * Demo/test payments only.
   * Live Stripe secret keys are rejected.
   */
  if (!key.startsWith("sk_test_")) {
    throw new Error(
      "Stripe test mode is required. Live payment keys are not allowed."
    );
  }

  if (!stripeClient) {
    stripeClient = new Stripe(key);
  }

  return stripeClient;
}

/* =========================================
   RAW WEBHOOK BODY
========================================= */

async function getRawBody(
  req: NextApiRequest
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk);

    totalBytes += buffer.length;

    if (
      totalBytes > MAX_WEBHOOK_BODY_BYTES
    ) {
      throw new Error(
        "Webhook payload exceeds size limit."
      );
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

/* =========================================
   PARSE ORDER METADATA
========================================= */

function parseOrderData(
  value: string | undefined
): MetadataItem[] {
  if (!value) {
    throw new Error(
      "Missing checkout order metadata."
    );
  }

  const parsed: unknown = JSON.parse(value);

  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    parsed.length > MAX_METADATA_ITEMS
  ) {
    throw new Error(
      "Invalid checkout order metadata."
    );
  }

  const result: MetadataItem[] = [];
  const seen = new Set<string>();

  let totalQuantity = 0;

  for (const rawItem of parsed) {
    if (
      !rawItem ||
      typeof rawItem !== "object" ||
      Array.isArray(rawItem)
    ) {
      throw new Error(
        "Invalid checkout metadata item."
      );
    }

    const item =
      rawItem as Record<string, unknown>;

    if (
      typeof item.id !== "string" ||
      !OBJECT_ID_REGEX.test(item.id) ||
      typeof item.size !== "string" ||
      !item.size.trim() ||
      item.size.trim().length > 30 ||
      typeof item.qty !== "number" ||
      !Number.isSafeInteger(item.qty) ||
      item.qty < 1 ||
      item.qty > MAX_ITEM_QUANTITY
    ) {
      throw new Error(
        "Invalid checkout metadata item."
      );
    }

    const id = item.id.toLowerCase();
    const size = item.size.trim();
    const qty = item.qty;

    const key = `${id}:${size}`;

    if (seen.has(key)) {
      throw new Error(
        "Duplicate checkout metadata item."
      );
    }

    seen.add(key);
    totalQuantity += qty;

    if (
      totalQuantity > MAX_TOTAL_QUANTITY
    ) {
      throw new Error(
        "Checkout quantity exceeds allowed limit."
      );
    }

    result.push({
      id,
      size,
      qty,
    });
  }

  return result;
}

/* =========================================
   PRODUCT IMAGE
========================================= */

function getProductImage(
  images: unknown
): string {
  if (!Array.isArray(images)) {
    return "";
  }

  for (const image of images) {
    if (
      typeof image === "string" &&
      image.trim()
    ) {
      return image.trim();
    }
  }

  return "";
}

/* =========================================
   SHIPPING ADDRESS
========================================= */

function getShippingAddress(
  session: Stripe.Checkout.Session
) {
  const shipping =
    session.collected_information
      ?.shipping_details;

  const address = shipping?.address;

  return {
    line1: address?.line1 || "",
    city: address?.city || "",
    state: address?.state || "",
    postal_code: address?.postal_code || "",
    country: address?.country || "IN",
    phone:
      session.customer_details?.phone || "",
  };
}

/* =========================================
   VERIFY STRIPE LINE ITEMS
========================================= */

async function verifyStripeLineItems(
  stripe: Stripe,
  stripeSessionId: string,
  metadataItems: MetadataItem[],
  expectedAmount: number
): Promise<VerifiedOrderItem[]> {
  const lineItems =
    await stripe.checkout.sessions.listLineItems(
      stripeSessionId,
      {
        limit: 100,
        expand: [
          "data.price.product",
        ],
      }
    );

  if (lineItems.has_more) {
    throw new Error(
      "Checkout contains too many line items."
    );
  }

  if (
    lineItems.data.length !==
    metadataItems.length
  ) {
    throw new Error(
      "Stripe line items do not match checkout metadata."
    );
  }

  const metadataMap =
    new Map<string, MetadataItem>();

  for (const item of metadataItems) {
    metadataMap.set(
      `${item.id}:${item.size}`,
      item
    );
  }

  const verifiedItems:
    VerifiedOrderItem[] = [];

  const matchedKeys = new Set<string>();

  let stripeTotal = 0;

  for (const stripeItem of lineItems.data) {
    const price = stripeItem.price;

    if (!price) {
      throw new Error(
        "Stripe line item price is missing."
      );
    }

    const stripeProduct = price.product;

    if (
      !stripeProduct ||
      typeof stripeProduct === "string" ||
      stripeProduct.deleted
    ) {
      throw new Error(
        "Stripe product metadata is unavailable."
      );
    }

    const productId =
      stripeProduct.metadata?.productId;

    const size =
      stripeProduct.metadata?.size;

    if (
      typeof productId !== "string" ||
      !OBJECT_ID_REGEX.test(productId) ||
      typeof size !== "string" ||
      !size.trim()
    ) {
      throw new Error(
        "Invalid Stripe product metadata."
      );
    }

    const key =
      `${productId.toLowerCase()}:${size.trim()}`;

    const expected = metadataMap.get(key);

    if (
      !expected ||
      matchedKeys.has(key)
    ) {
      throw new Error(
        "Stripe product does not match checkout metadata."
      );
    }

    matchedKeys.add(key);

    if (
      stripeItem.quantity !== expected.qty
    ) {
      throw new Error(
        "Stripe checkout quantity mismatch."
      );
    }

    if (
      price.currency?.toLowerCase() !==
      "inr"
    ) {
      throw new Error(
        "Unexpected Stripe payment currency."
      );
    }

    const unitAmount = price.unit_amount;

    if (
      typeof unitAmount !== "number" ||
      !Number.isSafeInteger(unitAmount) ||
      unitAmount <= 0 ||
      unitAmount > MAX_PRICE_IN_PAISE
    ) {
      throw new Error(
        "Invalid Stripe unit price."
      );
    }

    const lineTotal =
      unitAmount * expected.qty;

    if (
      !Number.isSafeInteger(lineTotal) ||
      stripeItem.amount_subtotal !==
        lineTotal ||
      stripeItem.amount_total !==
        lineTotal
    ) {
      throw new Error(
        "Stripe line item amount mismatch."
      );
    }

    stripeTotal += lineTotal;

    if (
      !Number.isSafeInteger(stripeTotal)
    ) {
      throw new Error(
        "Invalid Stripe checkout total."
      );
    }

    verifiedItems.push({
      ...expected,
      unitAmount,
    });
  }

  if (
    matchedKeys.size !==
      metadataItems.length ||
    stripeTotal !== expectedAmount
  ) {
    throw new Error(
      "Stripe checkout amount mismatch."
    );
  }

  return verifiedItems;
}

/* =========================================
   CHECK EXISTING PAID ORDER
========================================= */

async function hasMatchingPaidOrder(
  stripeSessionId: string,
  email: string,
  amountTotal: number
): Promise<boolean> {
  const order = await Order.findOne({
    stripeSessionId,
    paymentMethod: "stripe",
  })
    .select(
      "email status amountTotal"
    )
    .lean();

  if (!order) {
    return false;
  }

  if (
    order.status !== "Paid" ||
    order.email !== email ||
    Math.round(
      order.amountTotal * 100
    ) !== amountTotal
  ) {
    throw new Error(
      "Existing Stripe order does not match the paid session."
    );
  }

  return true;
}

/* =========================================
   PROCESS PAID CHECKOUT
========================================= */

async function processPaidCheckout(
  checkoutSession: Stripe.Checkout.Session
): Promise<void> {
  if (
    checkoutSession.mode !== "payment" ||
    checkoutSession.payment_status !== "paid"
  ) {
    return;
  }

  const stripeSessionId =
    checkoutSession.id;

  const stripe = getStripe();

  /* RETRIEVE VERIFIED SESSION */

  const session =
    await stripe.checkout.sessions.retrieve(
      stripeSessionId
    );

  if (
    session.mode !== "payment" ||
    session.payment_status !== "paid" ||
    session.currency?.toLowerCase() !==
      "inr"
  ) {
    throw new Error(
      "Stripe payment verification failed."
    );
  }

  /* CUSTOMER EMAIL */

  const emailValue =
    session.customer_details?.email ||
    session.customer_email ||
    session.metadata?.email;

  if (
    typeof emailValue !== "string" ||
    emailValue.trim().length > 254 ||
    !EMAIL_REGEX.test(emailValue.trim())
  ) {
    throw new Error(
      "Paid checkout has no valid customer email."
    );
  }

  const email =
    emailValue.trim().toLowerCase();

  /* AMOUNT */

  if (
    typeof session.amount_total !== "number" ||
    !Number.isSafeInteger(
      session.amount_total
    ) ||
    session.amount_total <= 0
  ) {
    throw new Error(
      "Invalid Stripe payment amount."
    );
  }

  /* METADATA */

  const metadataItems = parseOrderData(
    session.metadata?.orderData
  );

  /* VERIFY STRIPE LINE ITEMS */

  const orderItemData =
    await verifyStripeLineItems(
      stripe,
      stripeSessionId,
      metadataItems,
      session.amount_total
    );

  /* DATABASE */

  await dbConnect();

  /*
   * Fast idempotency check.
   * Unique Stripe session index provides
   * final duplicate-insert protection.
   */

  if (
    await hasMatchingPaidOrder(
      stripeSessionId,
      email,
      session.amount_total
    )
  ) {
    return;
  }

  const mongoSession =
    await mongoose.startSession();

  try {
    await mongoSession.withTransaction(
      async () => {
        /* IDEMPOTENCY */

        const existingOrder =
          await Order.findOne({
            stripeSessionId,
          }).session(mongoSession);

        if (existingOrder) {
          if (
            existingOrder.status === "Paid" &&
            existingOrder.email === email &&
            Math.round(
              existingOrder.amountTotal * 100
            ) === session.amount_total
          ) {
            return;
          }

          throw new Error(
            "Checkout session has an inconsistent order."
          );
        }

        /* FETCH PRODUCTS */

        const uniqueProductIds = [
          ...new Set(
            orderItemData.map(
              (item) => item.id
            )
          ),
        ];

        const products =
          (await Product.find({
            _id: {
              $in: uniqueProductIds,
            },
            isActive: {
              $ne: false,
            },
          })
            .select(
              "_id name stock sizes images isActive"
            )
            .session(mongoSession)
            .lean()) as unknown as VerifiedProduct[];

        const productMap =
          new Map<string, VerifiedProduct>();

        for (const product of products) {
          productMap.set(
            String(product._id),
            product
          );
        }

        /* BUILD ORDER ITEMS */

        const requestedByProduct =
          new Map<string, number>();

        const orderItems: OrderItem[] = [];

        for (const item of orderItemData) {
          const product = productMap.get(
            item.id
          );

          if (
            !product ||
            product.isActive === false
          ) {
            throw new Error(
              "A purchased product is no longer available."
            );
          }

          const sizes =
            Array.isArray(product.sizes)
              ? product.sizes
                  .filter(
                    (size): size is string =>
                      typeof size === "string"
                  )
                  .map((size) => size.trim())
              : [];

          if (!sizes.includes(item.size)) {
            throw new Error(
              "A purchased shoe size is no longer available."
            );
          }

          requestedByProduct.set(
            item.id,
            (requestedByProduct.get(
              item.id
            ) || 0) + item.qty
          );

          orderItems.push({
            productId: product._id,
            name: product.name,
            qty: item.qty,
            price: item.unitAmount / 100,
            size: item.size,
            image: getProductImage(
              product.images
            ),
          });
        }

        /* ATOMIC STOCK DECREMENT */

        for (const [
          productId,
          quantity,
        ] of requestedByProduct) {
          const result =
            await Product.updateOne(
              {
                _id: productId,
                isActive: {
                  $ne: false,
                },
                stock: {
                  $gte: quantity,
                },
              },
              {
                $inc: {
                  stock: -quantity,
                },
              },
              {
                session: mongoSession,
              }
            );

          if (result.modifiedCount !== 1) {
            throw new Error(
              "Insufficient stock for a purchased product."
            );
          }
        }

        /* CREATE PAID ORDER */

        await Order.create(
          [
            {
              email,
              items: orderItems,
              amountTotal:
                (session.amount_total ?? 0) / 100,
              currency: "INR",
              paymentMethod: "stripe",
              status: "Paid",
              orderStatus: "Processing",
              stripeSessionId,
              shippingAddress:
                getShippingAddress(session),
            },
          ],
          {
            session: mongoSession,
          }
        );
      }
    );
  } catch (error: unknown) {
    /*
     * Concurrent deliveries can race.
     * Treat duplicate key as success only
     * when the matching paid order exists.
     */

    if (
      error instanceof Error &&
      "code" in error &&
      error.code === 11000
    ) {
      if (
        await hasMatchingPaidOrder(
          stripeSessionId,
          email,
          session.amount_total
        )
      ) {
        return;
      }
    }

    throw error;
  } finally {
    await mongoSession.endSession();
  }
}

/* =========================================
   MAIN WEBHOOK HANDLER
========================================= */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      message: "Method not allowed.",
    });
  }

  const webhookSecret =
    process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error(
      "STRIPE_WEBHOOK_SECRET is missing."
    );

    return res.status(500).json({
      message: "Webhook is not configured.",
    });
  }

  const signature =
    req.headers["stripe-signature"];

  if (typeof signature !== "string") {
    return res.status(400).json({
      message: "Missing Stripe signature.",
    });
  }

  let event: Stripe.Event;

  /* VERIFY SIGNATURE */

  try {
    const rawBody =
      await getRawBody(req);

    const stripe = getStripe();

    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret
    );
  } catch (error: unknown) {
    console.error(
      "STRIPE_WEBHOOK_SIGNATURE_ERROR:",
      error instanceof Error
        ? error.name
        : "UnknownError"
    );

    return res.status(400).json({
      message: "Invalid webhook signature.",
    });
  }

  /* PROCESS EVENTS */

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const checkoutSession =
          event.data.object as
            Stripe.Checkout.Session;

        if (
          checkoutSession.payment_status ===
          "paid"
        ) {
          await processPaidCheckout(
            checkoutSession
          );
        }

        break;
      }

      case "checkout.session.async_payment_succeeded": {
        const checkoutSession =
          event.data.object as
            Stripe.Checkout.Session;

        await processPaidCheckout(
          checkoutSession
        );

        break;
      }

      default:
        break;
    }

    return res.status(200).json({
      received: true,
    });
  } catch (error: unknown) {
    console.error(
      "STRIPE_WEBHOOK_PROCESSING_ERROR:",
      error instanceof Error
        ? error.name
        : "UnknownError"
    );

    return res.status(500).json({
      message: "Webhook processing failed.",
    });
  }
}
