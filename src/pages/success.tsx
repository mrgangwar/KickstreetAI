
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Head from "next/head";

import Navbar from "@/components/Navbar";
import { useCart } from "@/context/CartContext";

/* =========================================
   TYPES
========================================= */

type VerificationStatus =
  | "loading"
  | "success"
  | "pending"
  | "error";

interface VerifiedOrder {
  _id: string;
  amountTotal: number;
  paymentMethod: "stripe" | "cod";
  status: "Pending" | "Paid" | "Failed";
  orderStatus?: string;
  currency?: string;
  createdAt?: string;
}

interface VerifyResponse {
  success?: boolean;
  pending?: boolean;
  order?: VerifiedOrder;
  message?: string;
}

interface VerificationState {
  status: VerificationStatus;
  order: VerifiedOrder | null;
  message: string;
}

/* =========================================
   CONSTANTS
========================================= */

const MAX_AUTO_RETRIES = 6;
const RETRY_INTERVAL_MS = 5000;

const OBJECT_ID_REGEX =
  /^[a-fA-F0-9]{24}$/;

const STRIPE_SESSION_REGEX =
  /^cs_test_[A-Za-z0-9]+$/;

const INITIAL_STATE: VerificationState = {
  status: "loading",
  order: null,
  message: "",
};

/* =========================================
   HELPERS
========================================= */

function formatPrice(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function isValidVerifiedOrder(
  value: unknown
): value is VerifiedOrder {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const order =
    value as Record<string, unknown>;

  return (
    typeof order._id === "string" &&
    OBJECT_ID_REGEX.test(order._id) &&
    typeof order.amountTotal === "number" &&
    Number.isFinite(order.amountTotal) &&
    order.amountTotal > 0 &&
    (order.currency === undefined ||
      order.currency === "INR") &&
    (order.paymentMethod === "stripe" ||
      order.paymentMethod === "cod") &&
    (order.status === "Pending" ||
      order.status === "Paid" ||
      order.status === "Failed")
  );
}

async function readVerifyResponse(
  response: Response
): Promise<VerifyResponse> {
  const contentType =
    response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    throw new Error(
      "The verification service returned an unexpected response."
    );
  }

  const data: unknown = await response.json();

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new Error(
      "Invalid payment verification response."
    );
  }

  return data as VerifyResponse;
}

/* =========================================
   COMPONENT
========================================= */

export default function Success() {
  const router = useRouter();

  const { status: authStatus } = useSession();

  const {
    clearCart,
    isInitialized,
  } = useCart();

  const [verification, setVerification] =
    useState<VerificationState>(INITIAL_STATE);

  const [retryCount, setRetryCount] =
    useState(0);

  const [autoRetryCount, setAutoRetryCount] =
    useState(0);

  const clearedSessionRef =
    useRef<string | null>(null);

  const activeRequestRef = useRef(0);

  /*
   * Track the current verified session.
   * This prevents showing a previous
   * session's result during route changes.
   */
  const [verifiedSessionId, setVerifiedSessionId] =
    useState("");

  /* =========================================
     SESSION ID
  ========================================= */

  const rawSessionId =
    router.query.session_id;

  const sessionId =
    typeof rawSessionId === "string"
      ? rawSessionId.trim()
      : "";

  const sessionIsValid =
    STRIPE_SESSION_REGEX.test(sessionId);

  const isCurrentSession =
    router.isReady &&
    verifiedSessionId === sessionId;

  const visibleStatus: VerificationStatus =
    !isCurrentSession
      ? "loading"
      : verification.status;

  const order =
    isCurrentSession
      ? verification.order
      : null;

  const message =
    isCurrentSession
      ? verification.message
      : "";

  /* =========================================
     VERIFY PAYMENT
  ========================================= */

  const verifyPayment = useCallback(
    async (
      signal: AbortSignal,
      requestId: number
    ) => {
      const isCurrentRequest = () =>
        !signal.aborted &&
        activeRequestRef.current === requestId;

      const updateVerification = (
        nextState: VerificationState
      ) => {
        if (!isCurrentRequest()) {
          return;
        }

        setVerification(nextState);
        setVerifiedSessionId(sessionId);
      };

      if (!sessionIsValid) {
        updateVerification({
          status: "error",
          order: null,
          message:
            "Invalid or missing payment session. Please check your order history or contact support.",
        });

        return;
      }

      updateVerification({
        status: "loading",
        order: null,
        message: "",
      });

      try {
        const response = await fetch(
          `/api/orders/verify-session?session_id=${encodeURIComponent(
            sessionId
          )}`,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
            },
            credentials: "same-origin",
            cache: "no-store",
            signal,
          }
        );

        const data =
          await readVerifyResponse(response);

        if (!isCurrentRequest()) {
          return;
        }

        /* API ERROR */

        if (!response.ok) {
          updateVerification({
            status:
              response.status >= 500 ||
              response.status === 429
                ? "pending"
                : "error",
            order: null,
            message:
              typeof data.message === "string"
                ? data.message
                : "We could not verify your payment right now.",
          });

          return;
        }

        /* WEBHOOK STILL PROCESSING */

        if (data.pending === true) {
          updateVerification({
            status: "pending",
            order: null,
            message:
              typeof data.message === "string"
                ? data.message
                : "Your payment confirmation is being processed.",
          });

          return;
        }

        /* VALIDATE SERVER ORDER */

        if (
          data.success !== true ||
          !isValidVerifiedOrder(data.order)
        ) {
          updateVerification({
            status: "error",
            order: null,
            message:
              typeof data.message === "string"
                ? data.message
                : "We could not confirm your order.",
          });

          return;
        }

        const verifiedOrder = data.order;

        /* PAID STRIPE ORDER */

        if (
          verifiedOrder.paymentMethod ===
            "stripe" &&
          verifiedOrder.status === "Paid"
        ) {
          updateVerification({
            status: "success",
            order: verifiedOrder,
            message:
              "Your payment is confirmed.",
          });

          return;
        }

        /* PENDING ORDER */

        if (
          verifiedOrder.paymentMethod ===
            "stripe" &&
          verifiedOrder.status === "Pending"
        ) {
          updateVerification({
            status: "pending",
            order: verifiedOrder,
            message:
              "Your order is waiting for payment confirmation.",
          });

          return;
        }

        /* FAILED / INVALID ORDER */

        updateVerification({
          status: "error",
          order: null,
          message:
            verifiedOrder.status === "Failed"
              ? "Payment was not confirmed. Please check your payment status before trying again."
              : "This session has not been confirmed as a paid Stripe order.",
        });
      } catch (error: unknown) {
        if (!isCurrentRequest()) {
          return;
        }

        /*
         * A network error does not prove
         * that payment has failed.
         */
        updateVerification({
          status: "pending",
          order: null,
          message:
            "We could not reach the verification service. Your payment status is not yet confirmed.",
        });
      }
    },
    [sessionId, sessionIsValid]
  );

  /* =========================================
     INITIAL VERIFICATION AND RETRIES
  ========================================= */

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const controller = new AbortController();

    const requestId =
      ++activeRequestRef.current;

    void verifyPayment(
      controller.signal,
      requestId
    );

    return () => {
      controller.abort();
    };
  }, [
    router.isReady,
    verifyPayment,
    retryCount,
    autoRetryCount,
  ]);

  /* =========================================
     AUTOMATIC RETRY
  ========================================= */

  useEffect(() => {
    if (
      !isCurrentSession ||
      visibleStatus !== "pending" ||
      autoRetryCount >= MAX_AUTO_RETRIES
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      setAutoRetryCount(
        (previous) => previous + 1
      );
    }, RETRY_INTERVAL_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    isCurrentSession,
    visibleStatus,
    autoRetryCount,
  ]);

  /* =========================================
     RESET RETRIES ON SESSION CHANGE
  ========================================= */

  useEffect(() => {
    setAutoRetryCount(0);
    setRetryCount(0);
  }, [sessionId]);

  /* =========================================
     CLEAR CART AFTER VERIFIED PAYMENT
  ========================================= */

  useEffect(() => {
    if (
      !isInitialized ||
      !isCurrentSession ||
      visibleStatus !== "success" ||
      !order ||
      order.paymentMethod !== "stripe" ||
      order.status !== "Paid" ||
      clearedSessionRef.current === sessionId
    ) {
      return;
    }

    clearedSessionRef.current = sessionId;

    clearCart();
  }, [
    isInitialized,
    isCurrentSession,
    visibleStatus,
    order,
    sessionId,
    clearCart,
  ]);

  /* =========================================
     MANUAL RETRY
  ========================================= */

  const retryVerification = () => {
    setAutoRetryCount(0);

    setRetryCount(
      (previous) => previous + 1
    );
  };

  /* =========================================
     LOADING SCREEN
  ========================================= */

  if (
    !router.isReady ||
    visibleStatus === "loading"
  ) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
        <Head>
          <title>
            Verifying Payment | KickStreet
          </title>

          <meta
            name="robots"
            content="noindex, nofollow"
          />
        </Head>

        <div
          className="w-16 h-16 border-4 border-gray-100 border-t-orange-600 rounded-full animate-spin"
          role="status"
          aria-label="Verifying payment"
        />

        <h1 className="mt-8 text-2xl sm:text-3xl font-black italic uppercase tracking-tighter text-center">
          Verifying Your Order
        </h1>

        <p className="mt-3 text-gray-500 text-sm text-center max-w-sm">
          Please wait while we check your
          payment status.
        </p>
      </div>
    );
  }

  /* =========================================
     MAIN PAGE
  ========================================= */

  return (
    <div className="bg-white min-h-screen text-black selection:bg-orange-600 selection:text-white">
      <Head>
        <title>
          {visibleStatus === "success"
            ? "Order Confirmed | KickStreet"
            : visibleStatus === "pending"
            ? "Payment Pending | KickStreet"
            : "Payment Verification | KickStreet"}
        </title>

        <meta
          name="robots"
          content="noindex, nofollow"
        />
      </Head>

      <Navbar />

      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="text-center">
          {/* STATUS ICON */}

          <div className="flex justify-center mb-10">
            <div
              className={`w-24 h-24 sm:w-28 sm:h-28 rounded-[2rem] flex items-center justify-center text-white shadow-xl ${
                visibleStatus === "success"
                  ? "bg-green-600"
                  : visibleStatus === "pending"
                  ? "bg-orange-500"
                  : "bg-red-600"
              }`}
              aria-hidden="true"
            >
              {visibleStatus === "success" ? (
                <svg
                  className="w-12 h-12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <path d="M5 13l4 4L19 7" />
                </svg>
              ) : visibleStatus === "pending" ? (
                <svg
                  className="w-12 h-12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                  />

                  <path d="M12 7v5l3 2" />
                </svg>
              ) : (
                <svg
                  className="w-12 h-12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                  />

                  <path d="M9 9l6 6M15 9l-6 6" />
                </svg>
              )}
            </div>
          </div>

          {/* SUCCESS */}

          {visibleStatus === "success" && (
            <>
              <h1 className="text-5xl sm:text-7xl font-black italic uppercase tracking-tighter leading-none">
                GOT{" "}
                <span className="text-orange-600">
                  &apos;EM.
                </span>
              </h1>

              <p className="mt-6 text-gray-500 text-xs font-black uppercase tracking-widest">
                Your payment is confirmed
              </p>
            </>
          )}

          {/* PENDING */}

          {visibleStatus === "pending" && (
            <>
              <h1 className="text-4xl sm:text-6xl font-black italic uppercase tracking-tighter">
                Confirmation{" "}
                <span className="text-orange-600">
                  Pending
                </span>
              </h1>

              <p
                className="mt-6 text-gray-500 text-sm max-w-lg mx-auto"
                role="status"
              >
                {message}
              </p>

              {autoRetryCount <
              MAX_AUTO_RETRIES ? (
                <p className="mt-4 text-xs text-orange-600 font-bold">
                  Checking automatically...
                  Attempt{" "}
                  {autoRetryCount + 1} of{" "}
                  {MAX_AUTO_RETRIES}
                </p>
              ) : (
                <p className="mt-4 text-xs text-gray-500">
                  Automatic checks have finished.
                  You can retry verification
                  manually.
                </p>
              )}

              <p className="mt-3 text-xs text-gray-400 max-w-md mx-auto">
                If you have already paid, avoid
                making another payment until
                your order status is confirmed.
              </p>
            </>
          )}

          {/* ERROR */}

          {visibleStatus === "error" && (
            <>
              <h1 className="text-4xl sm:text-6xl font-black italic uppercase tracking-tighter">
                Verification{" "}
                <span className="text-red-600">
                  Incomplete
                </span>
              </h1>

              <p
                className="mt-6 text-gray-500 text-sm max-w-lg mx-auto"
                role="alert"
              >
                {message ||
                  "We could not confirm your payment."}
              </p>

              <p className="mt-3 text-xs text-gray-400">
                If you have already paid,
                please check your payment
                status before trying to pay again.
              </p>
            </>
          )}

          {/* ORDER RECEIPT */}

          {order && (
            <div className="mt-12 bg-gray-50 border border-gray-100 rounded-[2rem] p-6 sm:p-10 text-left">
              <div className="flex flex-col sm:flex-row justify-between gap-6 pb-6 border-b border-gray-200">
                <div>
                  <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-2">
                    Order Reference
                  </p>

                  <p className="font-mono font-bold text-sm break-all">
                    #{order._id.slice(-12)}
                  </p>
                </div>

                <div className="sm:text-right">
                  <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-2">
                    Payment Status
                  </p>

                  <span
                    className={`inline-block px-4 py-2 rounded-full text-[10px] font-black uppercase ${
                      order.status === "Paid"
                        ? "bg-green-100 text-green-700"
                        : order.status === "Pending"
                        ? "bg-orange-100 text-orange-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {order.status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-8">
                <div>
                  <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-2">
                    Payment Method
                  </p>

                  <p className="font-bold text-sm uppercase">
                    {order.paymentMethod === "cod"
                      ? "Cash on Delivery"
                      : "Stripe Checkout"}
                  </p>
                </div>

                <div className="sm:text-right">
                  <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-2">
                    Order Status
                  </p>

                  <p className="font-bold text-sm uppercase">
                    {order.orderStatus ||
                      "Processing"}
                  </p>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <span className="text-lg font-black uppercase italic">
                  {order.status === "Paid"
                    ? "Total Paid"
                    : "Order Total"}
                </span>

                <span className="text-3xl font-black text-orange-600">
                  {formatPrice(order.amountTotal)}
                </span>
              </div>
            </div>
          )}

          {/* ACTION BUTTONS */}

          <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center">
            {visibleStatus !== "success" &&
              sessionIsValid && (
                <button
                  type="button"
                  onClick={retryVerification}
                  className="bg-orange-600 text-white px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-orange-700 transition"
                >
                  Retry Verification
                </button>
              )}

            {authStatus === "authenticated" && (
              <Link
                href="/orders"
                className="bg-black text-white px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-orange-600 transition"
              >
                My Orders
              </Link>
            )}

            <Link
              href="/"
              className="border-2 border-gray-200 text-black px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:border-black transition"
            >
              Continue Shopping
            </Link>
          </div>

          <p className="mt-10 text-xs text-gray-400">
            Need help with your order?
            Contact KickStreet support.
          </p>
        </div>
      </section>
    </div>
  );
}
