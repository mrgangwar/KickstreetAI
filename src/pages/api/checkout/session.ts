
import type {
  NextApiRequest,
  NextApiResponse,
} from "next";

import { getServerSession } from "next-auth/next";
import mongoose from "mongoose";
import Stripe from "stripe";

import { authOptions } from "../auth/[...nextauth]";
import dbConnect from "@/lib/db";
import Product from "@/models/Product";

/* =========================================
   TYPES
========================================= */

type ApiResponse = {
  url?: string;
  message?: string;
};

type ValidatedCartItem = {
  productId: string;
  size: string;
  quantity: number;
};

type CheckoutProduct = {
  _id: mongoose.Types.ObjectId;
  name: string;
  price: number;
  stock: number;
  sizes: string[];
  images?: string[];
  isActive?: boolean;
};

/* =========================================
   CONSTANTS
========================================= */

const MAX_CART_LINES = 50;
const MAX_TOTAL_QUANTITY = 100;
const MAX_ITEM_QUANTITY = 20;

const MAX_METADATA_LENGTH = 500;
const MAX_PRICE_IN_PAISE = 1_000_000_000;

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

  /*
   * Demo/test payments only.
   * Live Stripe secret keys are rejected.
   */
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error(
      "Stripe test mode is required. Live payment keys are not allowed."
    );
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }

  return stripeClient;
}

/* =========================================
   APPLICATION URL
========================================= */

function getBaseUrl(): string {
  const configuredUrl =
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL;

  if (!configuredUrl) {
    throw new Error(
      "Application URL is not configured."
    );
  }

  const url = new URL(configuredUrl);

  const isHttps =
    url.protocol === "https:";

  const isDevelopmentHttp =
    process.env.NODE_ENV !== "production" &&
    url.protocol === "http:";

  if (!isHttps && !isDevelopmentHttp) {
    throw new Error(
      "Invalid application URL protocol."
    );
  }

  if (url.username || url.password) {
    throw new Error(
      "Invalid application URL."
    );
  }

  return url.origin;
}

/* =========================================
   VALIDATION ERROR
========================================= */

class CheckoutValidationError extends Error {
  constructor(
    message: string,
    public statusCode = 400
  ) {
    super(message);
    this.name = "CheckoutValidationError";
  }
}

/* =========================================
   EMAIL VALIDATION
========================================= */

function normalizeEmail(
  value: unknown
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const email = value.trim().toLowerCase();

  if (
    !email ||
    email.length > 254 ||
    !EMAIL_REGEX.test(email)
  ) {
    return null;
  }

  return email;
}

/* =========================================
   REQUEST VALIDATION
========================================= */

function validateRequestBody(
  body: unknown
): Record<string, unknown> {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    throw new CheckoutValidationError(
      "Invalid checkout request."
    );
  }

  return body as Record<string, unknown>;
}

/* =========================================
   CART VALIDATION
========================================= */

function validateCart(
  input: unknown
): ValidatedCartItem[] {
  if (
    !Array.isArray(input) ||
    input.length === 0
  ) {
    throw new CheckoutValidationError(
      "Your cart is empty."
    );
  }

  if (input.length > MAX_CART_LINES) {
    throw new CheckoutValidationError(
      "Too many items in your cart."
    );
  }

  const aggregated =
    new Map<string, ValidatedCartItem>();

  let totalQuantity = 0;

  for (const rawItem of input) {
    if (
      !rawItem ||
      typeof rawItem !== "object" ||
      Array.isArray(rawItem)
    ) {
      throw new CheckoutValidationError(
        "Invalid cart item."
      );
    }

    const item =
      rawItem as Record<string, unknown>;

    const id = item._id;
    const size = item.size;
    const quantity = item.quantity;

    if (
      typeof id !== "string" ||
      !OBJECT_ID_REGEX.test(id)
    ) {
      throw new CheckoutValidationError(
        "Invalid product ID."
      );
    }

    if (
      typeof size !== "string" ||
      !size.trim() ||
      size.trim().length > 30
    ) {
      throw new CheckoutValidationError(
        "Invalid shoe size."
      );
    }

    if (
      typeof quantity !== "number" ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_ITEM_QUANTITY
    ) {
      throw new CheckoutValidationError(
        "Invalid product quantity."
      );
    }

    totalQuantity += quantity;

    if (totalQuantity > MAX_TOTAL_QUANTITY) {
      throw new CheckoutValidationError(
        "Cart quantity exceeds the allowed limit."
      );
    }

    const productId = id.toLowerCase();
    const normalizedSize = size.trim();

    const key =
      `${productId}:${normalizedSize}`;

    const existing = aggregated.get(key);

    if (existing) {
      const updatedQuantity =
        existing.quantity + quantity;

      if (updatedQuantity > MAX_ITEM_QUANTITY) {
        throw new CheckoutValidationError(
          "Maximum quantity exceeded for a product size."
        );
      }

      existing.quantity = updatedQuantity;
    } else {
      aggregated.set(key, {
        productId,
        size: normalizedSize,
        quantity,
      });
    }
  }

  return Array.from(aggregated.values());
}

/* =========================================
   PRICE VALIDATION
========================================= */

function getPriceInPaise(
  price: unknown
): number | null {
  if (
    typeof price !== "number" ||
    !Number.isFinite(price) ||
    price <= 0
  ) {
    return null;
  }

  const rawPaise = price * 100;
  const paise = Math.round(rawPaise);

  if (
    !Number.isSafeInteger(paise) ||
    paise <= 0 ||
    paise > MAX_PRICE_IN_PAISE ||
    Math.abs(rawPaise - paise) > 1e-6
  ) {
    return null;
  }

  return paise;
}

/* =========================================
   SAFE STRIPE IMAGE
========================================= */

function getSafeStripeImage(
  images: unknown
): string[] {
  if (!Array.isArray(images)) {
    return [];
  }

  for (const image of images) {
    if (
      typeof image !== "string" ||
      !image.trim()
    ) {
      continue;
    }

    try {
      const url = new URL(image);

      if (
        url.protocol === "https:" &&
        !url.username &&
        !url.password
      ) {
        return [url.toString()];
      }
    } catch {
      // Ignore invalid image URLs.
    }
  }

  return [];
}

/* =========================================
   MAIN API HANDLER
========================================= */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      message: "Method not allowed.",
    });
  }

  try {
    /* STEP 1: VALIDATE REQUEST */

    const body = validateRequestBody(req.body);

    const cartItems = validateCart(body.items);

    /* STEP 2: CUSTOMER EMAIL */

    const session = await getServerSession(
      req,
      res,
      authOptions
    );

    const email = normalizeEmail(
      session?.user?.email || body.email
    );

    if (!email) {
      throw new CheckoutValidationError(
        "A valid email address is required."
      );
    }

    /* STEP 3: CONNECT DATABASE */

    await dbConnect();

    /* STEP 4: FETCH ACTIVE PRODUCTS */

    const uniqueProductIds = [
      ...new Set(
        cartItems.map(
          (item) => item.productId
        )
      ),
    ];

    const dbProducts =
      (await Product.find({
        _id: {
          $in: uniqueProductIds,
        },
        isActive: {
          $ne: false,
        },
      })
        .select(
          "_id name price stock sizes images isActive"
        )
        .lean()) as unknown as CheckoutProduct[];

    const productMap =
      new Map<string, CheckoutProduct>();

    for (const product of dbProducts) {
      productMap.set(
        String(product._id),
        product
      );
    }

    /* STEP 5: TOTAL QUANTITY BY PRODUCT */

    const quantitiesByProduct =
      new Map<string, number>();

    for (const item of cartItems) {
      quantitiesByProduct.set(
        item.productId,
        (quantitiesByProduct.get(
          item.productId
        ) || 0) + item.quantity
      );
    }

    /* STEP 6: VERIFY PRODUCTS */

    for (const productId of uniqueProductIds) {
      const product =
        productMap.get(productId);

      if (
        !product ||
        product.isActive === false
      ) {
        throw new CheckoutValidationError(
          "A product in your cart is no longer available.",
          409
        );
      }

      if (
        !Number.isSafeInteger(product.stock) ||
        product.stock <
          (quantitiesByProduct.get(
            productId
          ) || 0)
      ) {
        throw new CheckoutValidationError(
          `${product.name} does not have enough stock.`,
          409
        );
      }

      if (
        getPriceInPaise(product.price) === null
      ) {
        throw new CheckoutValidationError(
          "A product in your cart has an invalid price."
        );
      }
    }

    /* STEP 7: STRIPE LINE ITEMS */

    const lineItems:
      Stripe.Checkout.SessionCreateParams.LineItem[] =
      [];

    /*
     * Preserve the existing metadata format
     * expected by the Stripe webhook.
     */
    const verifiedOrderData: Array<{
      id: string;
      size: string;
      qty: number;
    }> = [];

    let totalAmountInPaise = 0;

    for (const item of cartItems) {
      const product = productMap.get(
        item.productId
      );

      if (!product) {
        throw new CheckoutValidationError(
          "Product unavailable.",
          409
        );
      }

      const availableSizes =
        Array.isArray(product.sizes)
          ? product.sizes
              .filter(
                (size): size is string =>
                  typeof size === "string"
              )
              .map((size) => size.trim())
          : [];

      if (!availableSizes.includes(item.size)) {
        throw new CheckoutValidationError(
          `Selected size is unavailable for ${product.name}.`,
          409
        );
      }

      const unitAmount =
        getPriceInPaise(product.price);

      if (unitAmount === null) {
        throw new CheckoutValidationError(
          "Invalid product price."
        );
      }

      const lineTotal =
        unitAmount * item.quantity;

      if (
        !Number.isSafeInteger(lineTotal) ||
        lineTotal <= 0
      ) {
        throw new CheckoutValidationError(
          "Invalid checkout total."
        );
      }

      totalAmountInPaise += lineTotal;

      if (
        !Number.isSafeInteger(
          totalAmountInPaise
        )
      ) {
        throw new CheckoutValidationError(
          "Invalid checkout total."
        );
      }

      lineItems.push({
        price_data: {
          currency: "inr",

          product_data: {
            name:
              `${product.name} (Size: UK ${item.size})`,

            images: getSafeStripeImage(
              product.images
            ),

            metadata: {
              productId: item.productId,
              size: item.size,
            },
          },

          unit_amount: unitAmount,
        },

        quantity: item.quantity,
      });

      verifiedOrderData.push({
        id: item.productId,
        size: item.size,
        qty: item.quantity,
      });
    }

    /* STEP 8: METADATA LENGTH */

    const serializedOrderData =
      JSON.stringify(verifiedOrderData);

    if (
      serializedOrderData.length >
      MAX_METADATA_LENGTH
    ) {
      throw new CheckoutValidationError(
        "Your cart is too large for checkout. Please reduce the number of different items."
      );
    }

    /* STEP 9: STRIPE CLIENT */

    const baseUrl = getBaseUrl();
    const stripe = getStripe();

    /* STEP 10: CREATE CHECKOUT SESSION */

    const checkoutSession =
      await stripe.checkout.sessions.create({
        mode: "payment",

        /*
         * Payment methods are managed through
         * Stripe Dashboard dynamic payment settings.
         *
         * Enable Card and UPI in TEST mode.
         * Stripe filters payment methods according
         * to currency, country and eligibility.
         */

        line_items: lineItems,

        customer_email: email,

        shipping_address_collection: {
          allowed_countries: ["IN"],
        },

        success_url:
          `${baseUrl}/success` +
          "?session_id={CHECKOUT_SESSION_ID}",

        cancel_url:
          `${baseUrl}/cart`,

        metadata: {
          email,
          orderData: serializedOrderData,
        },
      });

    /* STEP 11: VERIFY CHECKOUT URL */

    if (!checkoutSession.url) {
      console.error(
        "Stripe session missing URL:",
        checkoutSession.id
      );

      return res.status(502).json({
        message:
          "Unable to start payment. Please try again.",
      });
    }

    const checkoutUrl = new URL(
      checkoutSession.url
    );

    if (
      checkoutUrl.protocol !== "https:" ||
      checkoutUrl.hostname !==
        "checkout.stripe.com" ||
      checkoutUrl.username ||
      checkoutUrl.password
    ) {
      return res.status(502).json({
        message:
          "Invalid Stripe Checkout URL.",
      });
    }

    /* STEP 12: RESPONSE */

    return res.status(200).json({
      url: checkoutUrl.toString(),
    });
  } catch (error: unknown) {
    if (
      error instanceof CheckoutValidationError
    ) {
      return res.status(
        error.statusCode
      ).json({
        message: error.message,
      });
    }

    console.error(
      "STRIPE_CHECKOUT_ERROR:",
      error instanceof Error
        ? error.name
        : "UnknownError"
    );

    return res.status(500).json({
      message:
        "Unable to initialize checkout. Please try again later.",
    });
  }
}
