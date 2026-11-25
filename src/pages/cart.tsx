
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";

import Navbar from "@/components/Navbar";
import Toast from "@/components/Toast";
import { useCart } from "@/context/CartContext";

type PaymentMethod = "stripe" | "cod";
type ToastType = "success" | "error";

interface ShippingAddress {
  line1: string;
  city: string;
  state: string;
  postal_code: string;
  phone: string;
}

interface CheckoutResponse {
  success?: boolean;
  url?: string;
  orderId?: string;
  message?: string;
}

interface ProfileResponse {
  user?: {
    shippingAddress?: Partial<ShippingAddress>;
  };
}

interface CodCheckoutAttempt {
  key: string;
  fingerprint: string;
}

const MAX_CART_LINES = 50;
const MAX_ITEM_QUANTITY = 20;
const MAX_TOTAL_QUANTITY = 100;

const SHIPPING_FEE = 0;

const FALLBACK_IMAGE = "/placeholder.png";

const COD_ATTEMPT_STORAGE_KEY =
  "kickstreet_cod_checkout_attempt";

const IDEMPOTENCY_KEY_REGEX =
  /^[A-Za-z0-9_-]{16,128}$/;

const EMPTY_ADDRESS: ShippingAddress = {
  line1: "",
  city: "",
  state: "",
  postal_code: "",
  phone: "",
};

const OBJECT_ID_REGEX = /^[a-fA-F0-9]{24}$/;

function formatPrice(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(Number.isFinite(value) ? value : 0);
}

function isValidEmail(value: string): boolean {
  const email = value.trim();

  return (
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

function isValidPhone(value: string): boolean {
  return /^[6-9]\d{9}$/.test(value);
}

function isValidPincode(value: string): boolean {
  return /^[1-9]\d{5}$/.test(value);
}

function isValidOrderId(
  value: unknown
): value is string {
  return (
    typeof value === "string" &&
    OBJECT_ID_REGEX.test(value)
  );
}

function safeImageSrc(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return FALLBACK_IMAGE;
  }

  const image = value.trim();

  if (
    image.startsWith("/") &&
    !image.startsWith("//")
  ) {
    return image;
  }

  try {
    const url = new URL(image);

    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password
    ) {
      return url.toString();
    }
  } catch {
    return FALLBACK_IMAGE;
  }

  return FALLBACK_IMAGE;
}

function validateAddress(
  address: ShippingAddress
): string | null {
  if (
    address.line1.length < 5 ||
    address.line1.length > 300
  ) {
    return "Please enter a complete shipping address.";
  }

  if (
    address.city.length < 2 ||
    address.city.length > 100 ||
    address.state.length < 2 ||
    address.state.length > 100
  ) {
    return "Please enter a valid city and state.";
  }

  if (!isValidPincode(address.postal_code)) {
    return "Please enter a valid 6-digit PIN code.";
  }

  if (!isValidPhone(address.phone)) {
    return "Please enter a valid 10-digit mobile number.";
  }

  return null;
}

function normalizeAddress(
  address: ShippingAddress
): ShippingAddress {
  return {
    line1: address.line1.trim(),
    city: address.city.trim(),
    state: address.state.trim(),
    postal_code: address.postal_code.trim(),
    phone: address.phone.trim(),
  };
}

function validateCheckoutUrl(
  value: unknown
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:" ||
      url.hostname !== "checkout.stripe.com" ||
      url.username ||
      url.password
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

async function readCheckoutResponse(
  response: Response
): Promise<CheckoutResponse> {
  const contentType =
    response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    throw new Error(
      "Unexpected checkout response. Please try again."
    );
  }

  const data: unknown = await response.json();

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new Error(
      "Invalid checkout response."
    );
  }

  return data as CheckoutResponse;
}

function createIdempotencyKey(): string {
  const cryptoObject = window.crypto;

  if (!cryptoObject?.getRandomValues) {
    throw new Error(
      "Secure checkout is unavailable in this browser. Please use an updated browser."
    );
  }

  const bytes = new Uint8Array(32);

  cryptoObject.getRandomValues(bytes);

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isValidCodAttempt(
  value: unknown
): value is CodCheckoutAttempt {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const attempt =
    value as Record<string, unknown>;

  return (
    typeof attempt.key === "string" &&
    IDEMPOTENCY_KEY_REGEX.test(attempt.key) &&
    typeof attempt.fingerprint === "string"
  );
}

export default function Cart() {
  const {
    cart,
    removeFromCart,
    updateQuantity,
    cartTotal,
    clearCart,
    isInitialized,
  } = useCart();

  const { data: session, status } = useSession();

  const [loading, setLoading] = useState(false);

  const checkoutInProgress = useRef(false);
  const mountedRef = useRef(true);

  const codIdempotencyAttempt =
    useRef<CodCheckoutAttempt | null>(null);

  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("stripe");

  const [guestEmail, setGuestEmail] = useState("");

  const [shippingAddress, setShippingAddress] =
    useState<ShippingAddress>(EMPTY_ADDRESS);

  const [addressLoading, setAddressLoading] =
    useState(false);

  const [placedOrderId, setPlacedOrderId] =
    useState<string | null>(null);

  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: ToastType;
  }>({
    show: false,
    message: "",
    type: "success",
  });

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const showToast = useCallback(
    (
      message: string,
      type: ToastType = "success"
    ) => {
      if (!mountedRef.current) {
        return;
      }

      setToast({
        show: true,
        message,
        type,
      });
    },
    []
  );

  const updateAddress = (
    field: keyof ShippingAddress,
    value: string
  ) => {
    setShippingAddress((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const itemCount = cart.reduce(
    (total, item) =>
      total +
      (Number.isSafeInteger(item.quantity) &&
      item.quantity > 0
        ? item.quantity
        : 0),
    0
  );

  const subtotal =
    Number.isFinite(cartTotal) && cartTotal >= 0
      ? cartTotal
      : 0;

  const displayTotal = subtotal + SHIPPING_FEE;

  const isBusy =
    loading ||
    !isInitialized ||
    status === "loading";

  /* =====================================
     LOAD SAVED SHIPPING ADDRESS
  ===================================== */

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    const controller = new AbortController();

    const loadSavedAddress = async () => {
      setAddressLoading(true);

      try {
        const response = await fetch(
          "/api/auth/profile",
          {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          return;
        }

        const data: ProfileResponse =
          await response.json();

        if (
          controller.signal.aborted ||
          !data.user?.shippingAddress
        ) {
          return;
        }

        const saved = data.user.shippingAddress;

        setShippingAddress((previous) => ({
          line1:
            previous.line1 ||
            (typeof saved.line1 === "string"
              ? saved.line1
              : ""),
          city:
            previous.city ||
            (typeof saved.city === "string"
              ? saved.city
              : ""),
          state:
            previous.state ||
            (typeof saved.state === "string"
              ? saved.state
              : ""),
          postal_code:
            previous.postal_code ||
            (typeof saved.postal_code === "string"
              ? saved.postal_code
              : ""),
          phone:
            previous.phone ||
            (typeof saved.phone === "string"
              ? saved.phone
              : ""),
        }));
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          console.warn(
            "Saved shipping address unavailable:",
            error instanceof Error
              ? error.name
              : "UnknownError"
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setAddressLoading(false);
        }
      }
    };

    void loadSavedAddress();

    return () => {
      controller.abort();
    };
  }, [status]);

  /* =====================================
     QUANTITY CONTROLS
  ===================================== */

  const handleDecrease = (
    productId: string,
    size: string,
    quantity: number
  ) => {
    if (isBusy || checkoutInProgress.current) {
      return;
    }

    if (quantity <= 1) {
      removeFromCart(productId, size);
      return;
    }

    updateQuantity(
      productId,
      size,
      quantity - 1
    );
  };

  const handleIncrease = (
    productId: string,
    size: string,
    quantity: number
  ) => {
    if (isBusy || checkoutInProgress.current) {
      return;
    }

    if (quantity >= MAX_ITEM_QUANTITY) {
      showToast(
        "Maximum 20 units per shoe size.",
        "error"
      );
      return;
    }

    if (itemCount >= MAX_TOTAL_QUANTITY) {
      showToast(
        "Maximum 100 units per order.",
        "error"
      );
      return;
    }

    updateQuantity(
      productId,
      size,
      quantity + 1
    );
  };

  const handleRemove = (
    productId: string,
    size: string
  ) => {
    if (isBusy || checkoutInProgress.current) {
      return;
    }

    removeFromCart(productId, size);
  };

  /* =====================================
     CART VALIDATION
  ===================================== */

  const validateCart = (): string | null => {
    if (!isInitialized) {
      return "Your shopping bag is still loading.";
    }

    if (cart.length === 0) {
      return "Your shopping bag is empty.";
    }

    if (cart.length > MAX_CART_LINES) {
      return "Too many items in your shopping bag.";
    }

    if (itemCount > MAX_TOTAL_QUANTITY) {
      return "Maximum 100 units per order.";
    }

    const grouped = new Map<string, number>();

    for (const item of cart) {
      if (
        !OBJECT_ID_REGEX.test(item._id) ||
        typeof item.name !== "string" ||
        !item.name.trim() ||
        typeof item.size !== "string" ||
        !item.size.trim() ||
        item.size.length > 30 ||
        !Number.isFinite(item.price) ||
        item.price <= 0 ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > MAX_ITEM_QUANTITY
      ) {
        return "Your bag contains an invalid item or quantity.";
      }

      const key =
        `${item._id.toLowerCase()}:${item.size.trim()}`;

      const quantity =
        (grouped.get(key) || 0) +
        item.quantity;

      if (quantity > MAX_ITEM_QUANTITY) {
        return "Maximum 20 units per shoe size.";
      }

      grouped.set(key, quantity);
    }

    return null;
  };

  /* =====================================
     CHECKOUT HANDLER
  ===================================== */

  const handleCheckout = async () => {
    if (
      checkoutInProgress.current ||
      loading ||
      !isInitialized ||
      status === "loading" ||
      placedOrderId
    ) {
      return;
    }

    const cartError = validateCart();

    if (cartError) {
      showToast(cartError, "error");
      return;
    }

    const email = (
      session?.user?.email || guestEmail
    )
      .trim()
      .toLowerCase();

    if (!isValidEmail(email)) {
      showToast(
        "Please enter a valid email address.",
        "error"
      );
      return;
    }

    const cleanedAddress =
      normalizeAddress(shippingAddress);

    if (paymentMethod === "cod") {
      const addressError =
        validateAddress(cleanedAddress);

      if (addressError) {
        showToast(addressError, "error");
        return;
      }
    }

    checkoutInProgress.current = true;
    setLoading(true);

    const selectedMethod = paymentMethod;

    try {
      const endpoint =
        selectedMethod === "stripe"
          ? "/api/checkout/session"
          : "/api/checkout/cod";

      /*
       * Preserve existing backend payload contracts.
       *
       * Stripe:
       * { items, email }
       *
       * COD:
       * { items, email, shippingAddress, idempotencyKey }
       */

      let payload:
        | {
            items: typeof cart;
            email: string;
          }
        | {
            items: typeof cart;
            email: string;
            shippingAddress: ShippingAddress;
            idempotencyKey: string;
          };

      if (selectedMethod === "stripe") {
        payload = {
          items: cart,
          email,
        };
      } else {
        const fingerprint = JSON.stringify({
          email,
          items: cart.map((item) => ({
            _id: item._id.toLowerCase(),
            size: item.size.trim(),
            quantity: item.quantity,
          })),
          shippingAddress: cleanedAddress,
        });

        let attempt: CodCheckoutAttempt | null = null;

        /*
         * Reuse the stored key only when the
         * checkout details match the previous attempt.
         */

        try {
          const storedValue =
            window.sessionStorage.getItem(
              COD_ATTEMPT_STORAGE_KEY
            );

          if (storedValue) {
            const parsed: unknown =
              JSON.parse(storedValue);

            if (
              isValidCodAttempt(parsed) &&
              parsed.fingerprint === fingerprint
            ) {
              attempt = parsed;
            }
          }
        } catch {
          // Fall back to the in-memory attempt.
        }

        if (
          !attempt &&
          codIdempotencyAttempt.current?.fingerprint ===
            fingerprint
        ) {
          attempt = codIdempotencyAttempt.current;
        }

        if (!attempt) {
          attempt = {
            key: createIdempotencyKey(),
            fingerprint,
          };
        }

        codIdempotencyAttempt.current = attempt;

        try {
          window.sessionStorage.setItem(
            COD_ATTEMPT_STORAGE_KEY,
            JSON.stringify(attempt)
          );
        } catch {
          // The in-memory attempt remains available.
        }

        payload = {
          items: cart,
          email,
          shippingAddress: cleanedAddress,
          idempotencyKey: attempt.key,
        };
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify(payload),
      });

      const data =
        await readCheckoutResponse(response);

      if (!response.ok) {
        throw new Error(
          typeof data.message === "string"
            ? data.message
            : "Checkout failed."
        );
      }

      /* STRIPE CHECKOUT */

      if (selectedMethod === "stripe") {
        const checkoutUrl =
          validateCheckoutUrl(data.url);

        if (!checkoutUrl) {
          throw new Error(
            "Payment session could not be created."
          );
        }

        /*
         * Do not clear the cart before payment
         * verification on the server.
         */
        window.location.assign(checkoutUrl);
        return;
      }

      /* COD CHECKOUT */

      if (
        data.success !== true ||
        !isValidOrderId(data.orderId)
      ) {
        throw new Error(
          "Order confirmation was not received. Please check your order history before retrying."
        );
      }

      /*
       * Clear the stored retry key only after
       * the backend confirms successful order creation.
       */

      codIdempotencyAttempt.current = null;

      try {
        window.sessionStorage.removeItem(
          COD_ATTEMPT_STORAGE_KEY
        );
      } catch {
        // Successful order confirmation is unaffected.
      }

      /*
       * Only clear the cart after the backend
       * confirms successful COD order creation.
       */

      clearCart();
      setPlacedOrderId(data.orderId);

      showToast(
        "COD order placed successfully!",
        "success"
      );
    } catch (error: unknown) {
      showToast(
        error instanceof Error
          ? error.message
          : "Checkout could not be confirmed. Please check your orders before retrying.",
        "error"
      );
    } finally {
      checkoutInProgress.current = false;

      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  /* =====================================
     PAGE UI
  ===================================== */

  return (
    <div className="bg-white min-h-screen selection:bg-orange-600 selection:text-white flex flex-col">
      <Head>
        <title>Your Bag | KickStreet</title>

        <meta
          name="description"
          content="Review your KickStreet shopping bag and checkout securely."
        />

        <meta
          name="robots"
          content="noindex, nofollow"
        />
      </Head>

      <Navbar />

      <section className="flex-grow w-full px-4 sm:px-6 py-8 sm:py-12 lg:py-16">
        <div className="max-w-7xl mx-auto">
          {/* HEADER */}

          <div className="flex items-baseline gap-3 mb-8 sm:mb-12">
            <h1 className="text-[10vw] sm:text-6xl lg:text-7xl font-black italic uppercase tracking-tighter leading-none">
              Your Bag
            </h1>

            <span className="text-orange-600 font-black text-lg sm:text-2xl">
              ({isInitialized ? itemCount : 0})
            </span>
          </div>

          {/* ORDER CONFIRMATION */}

          {placedOrderId ? (
            <div className="max-w-2xl mx-auto text-center bg-green-50 border border-green-200 rounded-2xl p-8 sm:p-12">
              <h2 className="text-2xl font-black uppercase italic text-green-800">
                Order Placed!
              </h2>

              <p className="mt-4 text-sm text-gray-700">
                Your Cash on Delivery order has
                been created.
              </p>

              <p className="mt-4 text-xs text-gray-500 uppercase font-bold">
                Your Order ID
              </p>

              <p className="font-mono text-sm sm:text-base font-bold break-all mt-1">
                {placedOrderId}
              </p>

              <p className="mt-3 text-xs text-gray-500">
                Save this ID for reference.
                Payment is due on delivery.
              </p>

              <div className="mt-7 flex flex-wrap justify-center gap-3">
                {status === "authenticated" && (
                  <Link
                    href="/orders"
                    className="bg-black text-white rounded-full px-6 py-3 text-xs font-black uppercase"
                  >
                    My Orders
                  </Link>
                )}

                <Link
                  href="/shop"
                  className="bg-orange-600 text-white rounded-full px-6 py-3 text-xs font-black uppercase"
                >
                  Continue Shopping
                </Link>
              </div>
            </div>
          ) : !isInitialized ? (
            /* INITIAL LOADING */

            <div
              className="text-center py-20 bg-gray-50 rounded-2xl"
              role="status"
              aria-live="polite"
            >
              <p className="text-gray-500 text-sm font-bold uppercase">
                Loading your bag...
              </p>
            </div>
          ) : cart.length === 0 ? (
            /* EMPTY CART */

            <div className="text-center py-16 sm:py-24 lg:py-32 bg-gray-50 rounded-2xl sm:rounded-[3rem] border-2 border-dashed border-gray-100 px-4">
              <p className="text-gray-400 text-xl sm:text-2xl lg:text-3xl mb-6 sm:mb-8 font-black uppercase italic tracking-tighter">
                Your bag is empty
              </p>

              <Link
                href="/shop"
                className="inline-block bg-black text-white px-8 py-4 rounded-full font-black text-sm uppercase tracking-widest hover:bg-orange-600 transition-all"
              >
                Start Shopping
              </Link>
            </div>
          ) : (
            /* CART CONTENT */

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
              {/* CART ITEMS */}

              <div className="lg:col-span-2 space-y-4">
                {cart.map((item) => (
                  <div
                    key={`${item._id}-${item.size}`}
                    className="flex gap-3 sm:gap-6 p-3 sm:p-4 bg-gray-50 rounded-xl sm:rounded-2xl"
                  >
                    {/* IMAGE */}

                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 lg:w-32 lg:h-32 flex-shrink-0 bg-white rounded-xl overflow-hidden">
                      <Image
                        src={safeImageSrc(item.image)}
                        alt={item.name || "Shoe"}
                        fill
                        unoptimized
                        sizes="(max-width: 640px) 80px, 128px"
                        className="object-cover"
                      />
                    </div>

                    {/* DETAILS */}

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <h2 className="text-sm sm:text-base font-bold uppercase italic truncate pr-2">
                          {item.name}
                        </h2>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            handleRemove(
                              item._id,
                              item.size
                            )
                          }
                          aria-label={`Remove ${item.name}, UK size ${item.size}`}
                          className="text-gray-400 hover:text-red-500 p-1 disabled:opacity-40 text-xl leading-none"
                        >
                          ×
                        </button>
                      </div>

                      <p className="text-xs sm:text-sm text-gray-500 font-medium mt-1">
                        Size: UK {item.size}
                      </p>

                      <div className="flex items-center justify-between mt-3 gap-2">
                        {/* QUANTITY */}

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              handleDecrease(
                                item._id,
                                item.size,
                                item.quantity
                              )
                            }
                            aria-label={`Decrease quantity of ${item.name}`}
                            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center font-bold text-sm hover:border-black disabled:opacity-40"
                          >
                            −
                          </button>

                          <span
                            className="w-6 sm:w-8 text-center font-bold text-sm"
                            aria-label={`Quantity ${item.quantity}`}
                          >
                            {item.quantity}
                          </span>

                          <button
                            type="button"
                            disabled={
                              isBusy ||
                              item.quantity >=
                                MAX_ITEM_QUANTITY ||
                              itemCount >=
                                MAX_TOTAL_QUANTITY
                            }
                            onClick={() =>
                              handleIncrease(
                                item._id,
                                item.size,
                                item.quantity
                              )
                            }
                            aria-label={`Increase quantity of ${item.name}`}
                            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center font-bold text-sm hover:border-black disabled:opacity-40"
                          >
                            +
                          </button>
                        </div>

                        {/* ITEM TOTAL */}

                        <p className="font-bold text-sm sm:text-base whitespace-nowrap">
                          {formatPrice(
                            item.price * item.quantity
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* ORDER SUMMARY */}

              <div className="lg:sticky lg:top-24 h-fit">
                <div className="bg-gray-50 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                  <h2 className="text-lg sm:text-xl font-black uppercase italic mb-4">
                    Order Summary
                  </h2>

                  {/* GUEST EMAIL */}

                  {status !== "authenticated" && (
                    <div className="mb-4">
                      <label
                        htmlFor="checkout-email"
                        className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2"
                      >
                        Your Email
                      </label>

                      <input
                        id="checkout-email"
                        type="email"
                        autoComplete="email"
                        maxLength={254}
                        placeholder="your@email.com"
                        value={guestEmail}
                        onChange={(event) =>
                          setGuestEmail(
                            event.target.value
                          )
                        }
                        disabled={isBusy}
                        className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  )}

                  {/* TOTALS */}

                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">
                        Subtotal
                      </span>

                      <span className="font-bold">
                        {formatPrice(subtotal)}
                      </span>
                    </div>

                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">
                        Shipping
                      </span>

                      <span className="font-bold text-green-600">
                        FREE
                      </span>
                    </div>

                    <div className="border-t border-gray-200 pt-3 flex justify-between">
                      <span className="font-black uppercase text-sm">
                        Total
                      </span>

                      <span className="font-black text-lg">
                        {formatPrice(displayTotal)}
                      </span>
                    </div>
                  </div>

                  {/* PAYMENT METHOD */}

                  <div className="mb-6">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                      Payment Method
                    </p>

                    <div
                      className="flex gap-2"
                      role="group"
                      aria-label="Choose payment method"
                    >
                      <button
                        type="button"
                        disabled={isBusy}
                        aria-pressed={
                          paymentMethod === "stripe"
                        }
                        onClick={() =>
                          setPaymentMethod("stripe")
                        }
                        className={`flex-1 py-3 rounded-xl text-sm font-bold uppercase transition-all ${
                          paymentMethod === "stripe"
                            ? "bg-black text-white shadow-lg"
                            : "bg-white border border-gray-200 text-gray-600"
                        }`}
                      >
                        Card
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        aria-pressed={
                          paymentMethod === "cod"
                        }
                        onClick={() =>
                          setPaymentMethod("cod")
                        }
                        className={`flex-1 py-3 rounded-xl text-sm font-bold uppercase transition-all ${
                          paymentMethod === "cod"
                            ? "bg-black text-white shadow-lg"
                            : "bg-white border border-gray-200 text-gray-600"
                        }`}
                      >
                        COD
                      </button>
                    </div>
                  </div>

                  {/* COD SHIPPING ADDRESS */}

                  {paymentMethod === "cod" && (
                    <div className="mb-6 space-y-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                        Shipping Address
                      </p>

                      {addressLoading && (
                        <p
                          className="text-xs text-gray-400"
                          role="status"
                        >
                          Loading saved address...
                        </p>
                      )}

                      {/* FULL ADDRESS */}

                      <div>
                        <label
                          htmlFor="checkout-address"
                          className="sr-only"
                        >
                          Full shipping address
                        </label>

                        <input
                          id="checkout-address"
                          type="text"
                          autoComplete="street-address"
                          maxLength={300}
                          placeholder="Full Address"
                          value={shippingAddress.line1}
                          disabled={isBusy}
                          onChange={(event) =>
                            updateAddress(
                              "line1",
                              event.target.value
                            )
                          }
                          className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>

                      {/* CITY AND STATE */}

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label
                            htmlFor="checkout-city"
                            className="sr-only"
                          >
                            City
                          </label>

                          <input
                            id="checkout-city"
                            type="text"
                            autoComplete="address-level2"
                            maxLength={100}
                            placeholder="City"
                            value={shippingAddress.city}
                            disabled={isBusy}
                            onChange={(event) =>
                              updateAddress(
                                "city",
                                event.target.value
                              )
                            }
                            className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="checkout-state"
                            className="sr-only"
                          >
                            State
                          </label>

                          <input
                            id="checkout-state"
                            type="text"
                            autoComplete="address-level1"
                            maxLength={100}
                            placeholder="State"
                            value={shippingAddress.state}
                            disabled={isBusy}
                            onChange={(event) =>
                              updateAddress(
                                "state",
                                event.target.value
                              )
                            }
                            className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                          />
                        </div>
                      </div>

                      {/* PINCODE AND PHONE */}

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label
                            htmlFor="checkout-pincode"
                            className="sr-only"
                          >
                            Pincode
                          </label>

                          <input
                            id="checkout-pincode"
                            type="text"
                            inputMode="numeric"
                            autoComplete="postal-code"
                            maxLength={6}
                            placeholder="Pincode"
                            value={
                              shippingAddress.postal_code
                            }
                            disabled={isBusy}
                            onChange={(event) =>
                              updateAddress(
                                "postal_code",
                                event.target.value
                                  .replace(/\D/g, "")
                                  .slice(0, 6)
                              )
                            }
                            className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="checkout-phone"
                            className="sr-only"
                          >
                            Delivery phone number
                          </label>

                          <input
                            id="checkout-phone"
                            type="tel"
                            inputMode="numeric"
                            autoComplete="tel"
                            maxLength={10}
                            placeholder="Phone"
                            value={shippingAddress.phone}
                            disabled={isBusy}
                            onChange={(event) =>
                              updateAddress(
                                "phone",
                                event.target.value
                                  .replace(/\D/g, "")
                                  .slice(0, 10)
                              )
                            }
                            className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CHECKOUT BUTTON */}

                  <button
                    type="button"
                    onClick={() =>
                      void handleCheckout()
                    }
                    disabled={
                      isBusy ||
                      checkoutInProgress.current ||
                      cart.length === 0
                    }
                    className="w-full py-4 rounded-full bg-orange-600 text-white font-black uppercase text-sm tracking-wider hover:bg-orange-700 transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading
                      ? "Processing..."
                      : paymentMethod === "stripe"
                      ? "Checkout with Card"
                      : "Place COD Order"}
                  </button>

                  <p className="text-[10px] text-center text-gray-400 mt-4 leading-relaxed">
                    Prices and availability are
                    confirmed during checkout.
                  </p>

                  <p className="text-[10px] text-center text-green-700 font-bold uppercase tracking-wider mt-2">
                    Free delivery on all orders
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.show}
        onClose={() =>
          setToast((previous) => ({
            ...previous,
            show: false,
          }))
        }
      />
    </div>
  );
}
