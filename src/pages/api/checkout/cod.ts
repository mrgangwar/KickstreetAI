
import type {
  NextApiRequest,
  NextApiResponse,
} from "next";

import { getSession } from "next-auth/react";
import mongoose from "mongoose";

import dbConnect from "@/lib/db";
import Product from "@/models/Product";
import Order from "@/models/Order";

/* =========================================
   TYPES
========================================= */

type ApiResponse = {
  success: boolean;
  message: string;
  orderId?: string;
};

type CartItem = {
  _id: string;
  size: string;
  quantity: number;
};

type ShippingAddress = {
  line1: string;
  city: string;
  state: string;
  postal_code: string;
  country: "IN";
  phone: string;
};

type CheckoutProduct = {
  _id: mongoose.Types.ObjectId;
  name: string;
  price: number;
  stock: number;
  sizes?: string[];
  images?: string[];
  isActive?: boolean;
};

type OrderItem = {
  productId: mongoose.Types.ObjectId;
  name: string;
  qty: number;
  price: number;
  size: string;
  image: string;
};

type ExistingOrder = {
  _id: mongoose.Types.ObjectId | string;
  email?: string;
  items?: Array<{
    productId?: unknown;
    qty?: unknown;
    quantity?: unknown;
    size?: unknown;
  }>;
  shippingAddress?: {
    line1?: unknown;
    city?: unknown;
    state?: unknown;
    postal_code?: unknown;
    country?: unknown;
    phone?: unknown;
  };
};

/* =========================================
   CONSTANTS
========================================= */

const MAX_CART_ITEMS = 50;
const MAX_TOTAL_QUANTITY = 100;
const MAX_QUANTITY_PER_SIZE = 20;

const MAX_PRICE_IN_PAISE = 1_000_000_000;

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const OBJECT_ID_REGEX =
  /^[a-fA-F0-9]{24}$/;

const IDEMPOTENCY_KEY_REGEX =
  /^[A-Za-z0-9_-]{16,128}$/;

/* =========================================
   ERROR CLASS
========================================= */

class CheckoutError extends Error {
  constructor(
    message: string,
    public statusCode = 400
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

/* =========================================
   EMAIL VALIDATION
========================================= */

function validateEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw new CheckoutError(
      "A valid email address is required."
    );
  }

  const email = value.trim().toLowerCase();

  if (
    !email ||
    email.length > 254 ||
    !EMAIL_REGEX.test(email)
  ) {
    throw new CheckoutError(
      "A valid email address is required."
    );
  }

  return email;
}

/* =========================================
   IDEMPOTENCY KEY VALIDATION
========================================= */

function validateIdempotencyKey(
  value: unknown
): string {
  if (
    typeof value !== "string" ||
    !IDEMPOTENCY_KEY_REGEX.test(value)
  ) {
    throw new CheckoutError(
      "Invalid checkout request. Please try again."
    );
  }

  return value;
}

/* =========================================
   ADDRESS VALIDATION
========================================= */

function validateAddress(
  input: unknown
): ShippingAddress {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw new CheckoutError(
      "Shipping address is required."
    );
  }

  const data =
    input as Record<string, unknown>;

  const readString = (key: string): string =>
    typeof data[key] === "string"
      ? (data[key] as string).trim()
      : "";

  const line1 = readString("line1");
  const city = readString("city");
  const state = readString("state");
  const postal_code = readString("postal_code");
  const phone = readString("phone");

  if (
    line1.length < 5 ||
    line1.length > 300
  ) {
    throw new CheckoutError(
      "Please enter a complete shipping address."
    );
  }

  if (
    city.length < 2 ||
    city.length > 100 ||
    state.length < 2 ||
    state.length > 100
  ) {
    throw new CheckoutError(
      "Please enter a valid city and state."
    );
  }

  if (!/^[1-9]\d{5}$/.test(postal_code)) {
    throw new CheckoutError(
      "Please enter a valid 6-digit PIN code."
    );
  }

  if (!/^[6-9]\d{9}$/.test(phone)) {
    throw new CheckoutError(
      "Please enter a valid 10-digit mobile number."
    );
  }

  return {
    line1,
    city,
    state,
    postal_code,
    country: "IN",
    phone,
  };
}

/* =========================================
   CART VALIDATION
========================================= */

function validateCart(input: unknown): CartItem[] {
  if (
    !Array.isArray(input) ||
    input.length === 0
  ) {
    throw new CheckoutError(
      "Your shopping bag is empty."
    );
  }

  if (input.length > MAX_CART_ITEMS) {
    throw new CheckoutError(
      "Too many items in your shopping bag."
    );
  }

  const grouped = new Map<string, CartItem>();

  let totalQuantity = 0;

  for (const rawItem of input) {
    if (
      !rawItem ||
      typeof rawItem !== "object" ||
      Array.isArray(rawItem)
    ) {
      throw new CheckoutError(
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
      throw new CheckoutError(
        "Invalid product ID."
      );
    }

    if (
      typeof size !== "string" ||
      !size.trim() ||
      size.trim().length > 30
    ) {
      throw new CheckoutError(
        "Invalid selected shoe size."
      );
    }

    if (
      typeof quantity !== "number" ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_QUANTITY_PER_SIZE
    ) {
      throw new CheckoutError(
        "Invalid product quantity."
      );
    }

    totalQuantity += quantity;

    if (totalQuantity > MAX_TOTAL_QUANTITY) {
      throw new CheckoutError(
        "Cart quantity limit exceeded."
      );
    }

    const productId = id.toLowerCase();
    const normalizedSize = size.trim();

    const key =
      `${productId}:${normalizedSize}`;

    const existing = grouped.get(key);

    if (existing) {
      const combinedQuantity =
        existing.quantity + quantity;

      if (
        combinedQuantity >
        MAX_QUANTITY_PER_SIZE
      ) {
        throw new CheckoutError(
          "Maximum quantity exceeded for a shoe size."
        );
      }

      existing.quantity = combinedQuantity;
    } else {
      grouped.set(key, {
        _id: productId,
        size: normalizedSize,
        quantity,
      });
    }
  }

  return Array.from(grouped.values());
}

/* =========================================
   PRICE VALIDATION
========================================= */

function getPriceInPaise(price: unknown): number {
  if (
    typeof price !== "number" ||
    !Number.isFinite(price) ||
    price <= 0
  ) {
    throw new CheckoutError(
      "Invalid product price."
    );
  }

  const rawPaise = price * 100;
  const paise = Math.round(rawPaise);

  if (
    !Number.isSafeInteger(paise) ||
    paise <= 0 ||
    paise > MAX_PRICE_IN_PAISE ||
    Math.abs(rawPaise - paise) > 1e-6
  ) {
    throw new CheckoutError(
      "Invalid product price precision."
    );
  }

  return paise;
}

/* =========================================
   PRODUCT IMAGE
========================================= */

function getProductImage(images: unknown): string {
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
   EXISTING ORDER MATCH
========================================= */

function matchesExistingOrder(
  order: ExistingOrder,
  email: string,
  cartItems: CartItem[],
  shippingAddress: ShippingAddress
): boolean {
  if (
    typeof order.email !== "string" ||
    order.email.trim().toLowerCase() !== email
  ) {
    return false;
  }

  const address = order.shippingAddress;

  if (
    !address ||
    address.line1 !== shippingAddress.line1 ||
    address.city !== shippingAddress.city ||
    address.state !== shippingAddress.state ||
    address.postal_code !== shippingAddress.postal_code ||
    address.country !== shippingAddress.country ||
    address.phone !== shippingAddress.phone
  ) {
    return false;
  }

  if (
    !Array.isArray(order.items) ||
    order.items.length !== cartItems.length
  ) {
    return false;
  }

  const existingItems = new Map<string, number>();

  for (const item of order.items) {
    const productId =
      item.productId
        ? String(item.productId).toLowerCase()
        : "";

    const quantity =
      item.qty ?? item.quantity;

    if (
      !OBJECT_ID_REGEX.test(productId) ||
      typeof item.size !== "string" ||
      typeof quantity !== "number" ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1
    ) {
      return false;
    }

    const key = `${productId}:${item.size}`;

    if (existingItems.has(key)) {
      return false;
    }

    existingItems.set(key, quantity);
  }

  for (const item of cartItems) {
    const key = `${item._id}:${item.size}`;

    if (
      existingItems.get(key) !== item.quantity
    ) {
      return false;
    }
  }

  return true;
}

/* =========================================
   DUPLICATE KEY ERROR CHECK
========================================= */

function isIdempotencyDuplicateError(
  error: unknown
): boolean {
  if (
    !error ||
    typeof error !== "object"
  ) {
    return false;
  }

  const mongoError =
    error as {
      code?: unknown;
      keyPattern?: Record<string, unknown>;
      message?: unknown;
    };

  return (
    mongoError.code === 11000 &&
    (
      mongoError.keyPattern?.idempotencyKey === 1 ||
      (
        typeof mongoError.message === "string" &&
        mongoError.message.includes(
          "unique_order_idempotency_key"
        )
      )
    )
  );
}

/* =========================================
   MAIN COD HANDLER
========================================= */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      success: false,
      message: "Method not allowed.",
    });
  }

  let transaction:
    mongoose.ClientSession | undefined;

  let idempotencyKey: string | null = null;

  /*
   * Preserve validated checkout data so that
   * duplicate-key handling can reuse it safely.
   */

  let checkoutEmail: string | null = null;
  let checkoutCartItems: CartItem[] | null = null;
  let checkoutShippingAddress: ShippingAddress | null = null;

  try {
    /* STEP 1: REQUEST VALIDATION */

    if (
      !req.body ||
      typeof req.body !== "object" ||
      Array.isArray(req.body)
    ) {
      throw new CheckoutError(
        "Invalid checkout request."
      );
    }

    /* STEP 2: SESSION AND EMAIL */

    const session = await getSession({ req });

    const email = validateEmail(
      session?.user?.email || req.body.email
    );

    checkoutEmail = email;

    /* STEP 3: OPTIONAL IDEMPOTENCY KEY */

    if (
      typeof req.body.idempotencyKey !== "undefined"
    ) {
      idempotencyKey =
        validateIdempotencyKey(
          req.body.idempotencyKey
        );
    }

    /* STEP 4: CART AND ADDRESS */

    const cartItems = validateCart(
      req.body.items
    );

    const shippingAddress = validateAddress(
      req.body.shippingAddress
    );

    checkoutCartItems = cartItems;
    checkoutShippingAddress = shippingAddress;

    /* STEP 5: DATABASE */

    await dbConnect();

    /* STEP 6: CHECK EXISTING ORDER */

    if (idempotencyKey) {
      const existingOrder =
        (await Order.findOne({
          idempotencyKey,
          paymentMethod: "cod",
        })
          .select(
            "_id email items.productId items.qty items.quantity items.size shippingAddress"
          )
          .lean()) as ExistingOrder | null;

      if (existingOrder) {
        if (
          !matchesExistingOrder(
            existingOrder,
            email,
            cartItems,
            shippingAddress
          )
        ) {
          throw new CheckoutError(
            "This checkout request has already been used. Please refresh your shopping bag and try again.",
            409
          );
        }

        return res.status(201).json({
          success: true,
          message: "COD order placed successfully!",
          orderId: String(existingOrder._id),
        });
      }
    }

    /* STEP 7: PRODUCT QUANTITIES */

    const productIds = [
      ...new Set(
        cartItems.map((item) => item._id)
      ),
    ];

    const requestedByProduct =
      new Map<string, number>();

    for (const item of cartItems) {
      requestedByProduct.set(
        item._id,
        (requestedByProduct.get(item._id) || 0) +
          item.quantity
      );
    }

    /* STEP 8: START TRANSACTION */

    transaction = await mongoose.startSession();

    const orderId =
      new mongoose.Types.ObjectId();

    await transaction.withTransaction(
      async () => {
        /* FETCH ACTIVE PRODUCTS */

        const products =
          (await Product.find({
            _id: {
              $in: productIds,
            },
            isActive: {
              $ne: false,
            },
          })
            .select(
              "_id name price stock sizes images isActive"
            )
            .session(transaction!)
            .lean()) as unknown as CheckoutProduct[];

        const productMap =
          new Map<string, CheckoutProduct>();

        for (const product of products) {
          productMap.set(
            String(product._id),
            product
          );
        }

        const orderItems: OrderItem[] = [];

        let totalAmountInPaise = 0;

        /* VALIDATE EACH CART ITEM */

        for (const item of cartItems) {
          const product = productMap.get(
            item._id
          );

          if (
            !product ||
            product.isActive === false
          ) {
            throw new CheckoutError(
              "A product in your bag is no longer available.",
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

          if (
            !availableSizes.includes(item.size)
          ) {
            throw new CheckoutError(
              `Size UK ${item.size} is unavailable for ${product.name}.`,
              409
            );
          }

          const priceInPaise =
            getPriceInPaise(product.price);

          const stock = product.stock;

          const requested =
            requestedByProduct.get(
              item._id
            ) || 0;

          if (
            !Number.isSafeInteger(stock) ||
            stock < requested
          ) {
            throw new CheckoutError(
              `Insufficient stock for ${product.name}.`,
              409
            );
          }

          const lineTotal =
            priceInPaise * item.quantity;

          if (
            !Number.isSafeInteger(lineTotal) ||
            lineTotal <= 0
          ) {
            throw new CheckoutError(
              "Invalid order total."
            );
          }

          totalAmountInPaise += lineTotal;

          if (
            !Number.isSafeInteger(
              totalAmountInPaise
            )
          ) {
            throw new CheckoutError(
              "Invalid order total."
            );
          }

          orderItems.push({
            productId: product._id,
            name: product.name,
            qty: item.quantity,
            price: priceInPaise / 100,
            size: item.size,
            image: getProductImage(
              product.images
            ),
          });
        }

        if (totalAmountInPaise <= 0) {
          throw new CheckoutError(
            "Invalid order total."
          );
        }

        /* CONDITIONAL STOCK DECREMENT */

        for (const productId of productIds) {
          const requested =
            requestedByProduct.get(
              productId
            ) || 0;

          const result =
            await Product.updateOne(
              {
                _id: productId,
                isActive: {
                  $ne: false,
                },
                stock: {
                  $gte: requested,
                },
              },
              {
                $inc: {
                  stock: -requested,
                },
              },
              {
                session: transaction,
              }
            );

          if (result.modifiedCount !== 1) {
            throw new CheckoutError(
              "Some items are no longer available in the requested quantity.",
              409
            );
          }
        }

        /* CREATE COD ORDER */

        await Order.create(
          [
            {
              _id: orderId,
              email,
              items: orderItems,
              amountTotal:
                totalAmountInPaise / 100,
              currency: "INR",
              paymentMethod: "cod",
              status: "Pending",
              orderStatus: "Processing",
              shippingAddress,
              stripeSessionId: null,
              ...(idempotencyKey
                ? { idempotencyKey }
                : {}),
            },
          ],
          {
            session: transaction,
          }
        );
      }
    );

    return res.status(201).json({
      success: true,
      message: "COD order placed successfully!",
      orderId: String(orderId),
    });
  } catch (error: unknown) {
    /* HANDLE CONCURRENT DUPLICATE REQUEST */

    if (
      idempotencyKey &&
      isIdempotencyDuplicateError(error) &&
      checkoutEmail &&
      checkoutCartItems &&
      checkoutShippingAddress
    ) {
      try {
        const existingOrder =
          (await Order.findOne({
            idempotencyKey,
            paymentMethod: "cod",
          })
            .select(
              "_id email items.productId items.qty items.quantity items.size shippingAddress"
            )
            .lean()) as ExistingOrder | null;

        if (
          existingOrder &&
          matchesExistingOrder(
            existingOrder,
            checkoutEmail,
            checkoutCartItems,
            checkoutShippingAddress
          )
        ) {
          return res.status(201).json({
            success: true,
            message: "COD order placed successfully!",
            orderId: String(existingOrder._id),
          });
        }

        if (existingOrder) {
          return res.status(409).json({
            success: false,
            message:
              "This checkout request has already been used. Please refresh your shopping bag and try again.",
          });
        }
      } catch {
        // Continue with the generic error response.
      }
    }

    if (error instanceof CheckoutError) {
      return res.status(
        error.statusCode
      ).json({
        success: false,
        message: error.message,
      });
    }

    console.error(
      "COD_CHECKOUT_ERROR:",
      error instanceof Error
        ? error.name
        : "UnknownError"
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to confirm your order. Please check your order history before retrying.",
    });
  } finally {
    if (transaction) {
      try {
        await transaction.endSession();
      } catch {
        console.error(
          "COD transaction cleanup failed."
        );
      }
    }
  }
}
