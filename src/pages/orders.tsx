
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useSession } from "next-auth/react";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import Image from "next/image";
import Head from "next/head";

/* =========================================
   TYPES
========================================= */

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

interface OrderItem {
  productId?: string;
  name: string;
  image?: string;
  size?: string;
  qty?: number;
  quantity?: number;
  price: number;
}

interface Order {
  _id: string;
  items: OrderItem[];
  amountTotal: number;
  status: PaymentStatus;
  orderStatus: OrderStatus;
  paymentMethod: "stripe" | "cod";
  trackingId?: string;
  createdAt: string;
}

interface OrdersResponse {
  success?: boolean;
  orders?: Order[];
  hasMore?: boolean;
  nextCursor?: string | null;
  message?: string;
}

/* =========================================
   CONSTANTS
========================================= */

const OBJECT_ID_REGEX =
  /^[a-fA-F0-9]{24}$/;

const PLACEHOLDER_IMAGE =
  "/placeholder.png";

/* =========================================
   HELPERS
========================================= */

function getStatusColor(
  status: PaymentStatus | OrderStatus
): string {
  switch (status) {
    case "Processing":
      return "bg-blue-100 text-blue-700";

    case "Shipped":
      return "bg-purple-100 text-purple-700";

    case "Delivered":
    case "Paid":
      return "bg-green-100 text-green-700";

    case "Cancelled":
    case "Failed":
      return "bg-red-100 text-red-700";

    case "Returned":
      return "bg-gray-100 text-gray-700";

    case "Pending":
      return "bg-orange-100 text-orange-700";
  }
}

function formatPrice(
  value: number
): string {
  const amount =
    Number.isFinite(value)
      ? value
      : 0;

  return amount.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });
}

function formatDate(
  value: string
): string {
  const parsed = new Date(value);

  if (
    Number.isNaN(parsed.getTime())
  ) {
    return "Date unavailable";
  }

  return parsed.toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}

function getItemQuantity(
  item: OrderItem
): number {
  const value =
    item.qty ?? item.quantity;

  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  )
    ? value
    : 1;
}

function getImageSource(
  value?: string
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return PLACEHOLDER_IMAGE;
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

    if (url.protocol !== "https:") {
      return PLACEHOLDER_IMAGE;
    }

    return url.toString();
  } catch {
    return PLACEHOLDER_IMAGE;
  }
}

function isValidOrder(
  value: unknown
): value is Order {
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
    Array.isArray(order.items) &&
    typeof order.amountTotal === "number" &&
    Number.isFinite(order.amountTotal) &&
    order.amountTotal >= 0 &&
    (
      order.status === "Pending" ||
      order.status === "Paid" ||
      order.status === "Failed"
    ) &&
    (
      order.orderStatus === "Processing" ||
      order.orderStatus === "Shipped" ||
      order.orderStatus === "Delivered" ||
      order.orderStatus === "Cancelled" ||
      order.orderStatus === "Returned"
    ) &&
    (
      order.paymentMethod === "stripe" ||
      order.paymentMethod === "cod"
    ) &&
    typeof order.createdAt === "string"
  );
}

async function readOrdersResponse(
  response: Response
): Promise<OrdersResponse> {
  const data: unknown =
    await response.json();

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new Error(
      "Invalid server response."
    );
  }

  return data as OrdersResponse;
}

/* =========================================
   COMPONENT
========================================= */

export default function MyOrders() {
  const {
    data: session,
    status,
  } = useSession();

  const [orders, setOrders] =
    useState<Order[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [loadingMore, setLoadingMore] =
    useState(false);

  const [error, setError] =
    useState("");

  const [
    loadMoreError,
    setLoadMoreError,
  ] = useState("");

  const [hasMore, setHasMore] =
    useState(false);

  const [nextCursor, setNextCursor] =
    useState<string | null>(null);

  const [retryCount, setRetryCount] =
    useState(0);

  const [loadedForEmail, setLoadedForEmail] =
    useState("");

  const requestControllerRef =
    useRef<AbortController | null>(null);

  const loadMoreLockRef =
    useRef(false);

  const requestSequenceRef =
    useRef(0);

  const customerEmail =
    typeof session?.user?.email === "string"
      ? session.user.email.trim().toLowerCase()
      : "";

  const authenticated =
    status === "authenticated" &&
    Boolean(customerEmail);

  const isCurrentCustomer =
    authenticated &&
    loadedForEmail === customerEmail;

  const visibleOrders =
    isCurrentCustomer ? orders : [];

  const visibleLoading =
    authenticated &&
    (!isCurrentCustomer || loading);

  /* =========================================
     FETCH ORDERS
  ========================================= */

  const fetchOrders = useCallback(
    async (
      signal: AbortSignal,
      requestId: number,
      email: string,
      cursor?: string
    ) => {
      const isLoadMore =
        Boolean(cursor);

      const isCurrentRequest = () =>
        !signal.aborted &&
        requestSequenceRef.current === requestId;

      if (isLoadMore) {
        setLoadingMore(true);
        setLoadMoreError("");
      } else {
        setLoading(true);
        setError("");
      }

      try {
        const url = cursor
          ? `/api/orders/my-orders?cursor=${encodeURIComponent(
              cursor
            )}`
          : "/api/orders/my-orders";

        const response = await fetch(
          url,
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

        if (
          response.status === 401 ||
          response.status === 403
        ) {
          throw new Error(
            "Your session has expired or access was denied. Please sign in again."
          );
        }

        const data =
          await readOrdersResponse(response);

        if (
          !response.ok ||
          data.success !== true ||
          !Array.isArray(data.orders)
        ) {
          throw new Error(
            data.message ||
              "Unable to load your orders."
          );
        }

        if (
          !data.orders.every(isValidOrder)
        ) {
          throw new Error(
            "Invalid order information received."
          );
        }

        if (
          data.hasMore === true &&
          (
            typeof data.nextCursor !== "string" ||
            !data.nextCursor
          )
        ) {
          throw new Error(
            "Invalid pagination information received."
          );
        }

        if (!isCurrentRequest()) {
          return;
        }

        if (isLoadMore) {
          setOrders((previous) => {
            const existingIds =
              new Set(
                previous.map(
                  (order) => order._id
                )
              );

            const newOrders =
              data.orders!.filter(
                (order) =>
                  !existingIds.has(
                    order._id
                  )
              );

            return [
              ...previous,
              ...newOrders,
            ];
          });
        } else {
          setOrders(data.orders);
          setLoadedForEmail(email);
        }

        setHasMore(
          data.hasMore === true
        );

        setNextCursor(
          typeof data.nextCursor === "string"
            ? data.nextCursor
            : null
        );
      } catch (err: unknown) {
        if (!isCurrentRequest()) {
          return;
        }

        const message =
          err instanceof Error
            ? err.message
            : "Something went wrong while loading orders.";

        if (isLoadMore) {
          setLoadMoreError(message);
        } else {
          setOrders([]);
          setLoadedForEmail(email);
          setError(message);
          setHasMore(false);
          setNextCursor(null);
        }
      } finally {
        if (isCurrentRequest()) {
          if (isLoadMore) {
            setLoadingMore(false);
          } else {
            setLoading(false);
          }
        }

        if (isLoadMore) {
          loadMoreLockRef.current =
            false;
        }
      }
    },
    []
  );

  /* =========================================
     INITIAL FETCH
  ========================================= */

  useEffect(() => {
    requestControllerRef.current?.abort();

    requestSequenceRef.current += 1;

    loadMoreLockRef.current = false;

    if (
      status !== "authenticated" ||
      !customerEmail
    ) {
      setOrders([]);
      setLoadedForEmail("");
      setError("");
      setLoadMoreError("");
      setHasMore(false);
      setNextCursor(null);
      setLoading(false);
      setLoadingMore(false);

      return;
    }

    const controller =
      new AbortController();

    const requestId =
      requestSequenceRef.current;

    requestControllerRef.current =
      controller;

    setOrders([]);
    setLoadedForEmail("");
    setHasMore(false);
    setNextCursor(null);
    setLoadingMore(false);

    void fetchOrders(
      controller.signal,
      requestId,
      customerEmail
    );

    return () => {
      controller.abort();
    };
  }, [
    status,
    customerEmail,
    retryCount,
    fetchOrders,
  ]);

  /* =========================================
     RETRY
  ========================================= */

  const retryFetch = () => {
    setRetryCount(
      (previous) => previous + 1
    );
  };

  /* =========================================
     LOAD MORE
  ========================================= */

  const loadMoreOrders = () => {
    if (
      !authenticated ||
      !isCurrentCustomer ||
      loading ||
      loadingMore ||
      loadMoreLockRef.current ||
      !hasMore ||
      !nextCursor
    ) {
      return;
    }

    loadMoreLockRef.current = true;

    const controller =
      new AbortController();

    requestControllerRef.current =
      controller;

    const requestId =
      ++requestSequenceRef.current;

    void fetchOrders(
      controller.signal,
      requestId,
      customerEmail,
      nextCursor
    );
  };

  /* =========================================
     AUTH LOADING
  ========================================= */

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Head>
          <title>
            My Orders | KickStreet
          </title>
        </Head>

        <div
          className="h-12 w-12 rounded-full border-4 border-gray-100 border-t-orange-600 animate-spin"
          role="status"
          aria-label="Checking your session"
        />
      </div>
    );
  }

  /* =========================================
     NOT AUTHENTICATED
  ========================================= */

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <Head>
          <title>
            Sign In Required | KickStreet
          </title>

          <meta
            name="robots"
            content="noindex, nofollow"
          />
        </Head>

        <Navbar />

        <section className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <h1 className="text-4xl sm:text-5xl font-black uppercase italic tracking-tighter mb-6">
            Sign In Required
          </h1>

          <p className="text-gray-500 font-bold text-xs uppercase tracking-widest mb-8 max-w-md">
            Sign in to view your order history
            and delivery updates.
          </p>

          <Link
            href="/auth/login"
            className="bg-black text-white px-10 py-4 rounded-full font-black uppercase text-[10px] tracking-widest hover:bg-orange-600 transition-all"
          >
            Sign In Now
          </Link>
        </section>
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
          My Orders | KickStreet
        </title>

        <meta
          name="robots"
          content="noindex, nofollow"
        />
      </Head>

      <Navbar />

      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        {/* HEADER */}

        <header className="mb-12 sm:mb-16">
          <h1 className="text-[10vw] sm:text-7xl font-[1000] italic uppercase tracking-tighter leading-none mb-4">
            Order{" "}
            <span className="text-orange-600">
              History
            </span>
          </h1>

          <p className="text-gray-400 font-black text-[10px] uppercase tracking-[0.3em]">
            {visibleLoading
              ? "Loading your orders..."
              : `${visibleOrders.length} ${
                  visibleOrders.length === 1
                    ? "Order"
                    : "Orders"
                } Loaded`}
          </p>
        </header>

        {/* LOADING */}

        {visibleLoading ? (
          <div
            className="space-y-6"
            role="status"
            aria-label="Loading orders"
          >
            {[1, 2].map((item) => (
              <div
                key={item}
                className="h-48 w-full bg-gray-50 animate-pulse rounded-[2.5rem]"
              />
            ))}
          </div>
        ) : error ? (
          /* ERROR */

          <div
            className="py-16 px-6 border-2 border-dashed border-red-100 rounded-[2.5rem] text-center"
            role="alert"
          >
            <h2 className="text-2xl font-black italic uppercase tracking-tighter mb-4">
              Unable to Load Orders
            </h2>

            <p className="text-gray-500 text-sm mb-8 max-w-md mx-auto">
              {error}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={retryFetch}
                className="bg-orange-600 text-white px-10 py-4 rounded-full font-black uppercase text-xs hover:bg-orange-700 transition"
              >
                Try Again
              </button>

              <Link
                href="/auth/login"
                className="bg-black text-white px-10 py-4 rounded-full font-black uppercase text-xs hover:bg-gray-800 transition"
              >
                Sign In
              </Link>
            </div>
          </div>
        ) : visibleOrders.length === 0 ? (
          /* EMPTY */

          <div className="py-24 border-2 border-dashed border-gray-100 rounded-[3rem] text-center px-6">
            <p className="text-gray-300 font-black uppercase italic text-xl sm:text-2xl tracking-tighter mb-8">
              No orders yet.

              <span className="block">
                Start your collection today.
              </span>
            </p>

            <Link
              href="/shop"
              className="inline-block bg-black text-white px-12 py-5 rounded-full font-black uppercase text-[10px] tracking-widest hover:bg-orange-600 transition-all"
            >
              Go To Shop
            </Link>
          </div>
        ) : (
          /* ORDER LIST */

          <div className="space-y-8 sm:space-y-12">
            {visibleOrders.map((order) => {
              const isPaid =
                order.status === "Paid";

              const isCod =
                order.paymentMethod === "cod";

              return (
                <article
                  key={order._id}
                  className="group border border-gray-100 p-6 sm:p-10 rounded-[2.5rem] bg-[#fdfdfd] hover:bg-white hover:shadow-2xl hover:shadow-gray-200 transition-all duration-500"
                >
                  {/* ORDER HEADER */}

                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 pb-6 border-b border-gray-100">
                    <div>
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                        Receipt Reference
                      </span>

                      <p className="font-mono text-sm uppercase font-bold text-black">
                        #
                        {order._id.slice(-10)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full ${getStatusColor(
                          order.orderStatus
                        )}`}
                      >
                        {order.orderStatus}
                      </span>

                      <span
                        className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full ${getStatusColor(
                          order.status
                        )}`}
                      >
                        Payment: {order.status}
                      </span>
                    </div>
                  </div>

                  {/* ORDER ITEMS */}

                  <div className="space-y-6">
                    {order.items.map(
                      (item, index) => {
                        const quantity =
                          getItemQuantity(
                            item
                          );

                        const unitPrice =
                          Number.isFinite(
                            item.price
                          )
                            ? item.price
                            : 0;

                        const lineTotal =
                          quantity *
                          unitPrice;

                        const imageSrc =
                          getImageSource(
                            item.image
                          );

                        return (
                          <div
                            key={`${item.productId || index}-${item.size || ""}-${index}`}
                            className="flex items-center gap-4 sm:gap-6"
                          >
                            {/* IMAGE */}

                            <div className="relative w-20 h-20 sm:w-24 sm:h-24 bg-white rounded-2xl overflow-hidden border border-gray-100 shrink-0">
                              <Image
                                src={imageSrc}
                                alt={
                                  item.name ||
                                  "Product image"
                                }
                                fill
                                sizes="(max-width: 640px) 80px, 96px"
                                className="object-contain p-2"
                              />
                            </div>

                            {/* DETAILS */}

                            <div className="flex-1 min-w-0">
                              <h3 className="font-black uppercase italic text-sm sm:text-lg leading-tight break-words">
                                {item.name ||
                                  "Product"}
                              </h3>

                              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                                {item.size && (
                                  <p className="text-gray-400 text-[9px] font-bold uppercase tracking-widest">
                                    Size:{" "}
                                    <span className="text-black">
                                      UK{" "}
                                      {item.size}
                                    </span>
                                  </p>
                                )}

                                <p className="text-gray-400 text-[9px] font-bold uppercase tracking-widest">
                                  Qty:{" "}
                                  <span className="text-black">
                                    {quantity}
                                  </span>
                                </p>
                              </div>

                              <p className="text-gray-400 text-[10px] mt-2">
                                {formatPrice(
                                  unitPrice
                                )}{" "}
                                each
                              </p>
                            </div>

                            {/* ITEM TOTAL */}

                            <div className="text-right shrink-0">
                              <p className="font-black text-sm sm:text-base">
                                {formatPrice(
                                  lineTotal
                                )}
                              </p>
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>

                  {/* TRACKING */}

                  {order.trackingId && (
                    <div className="mt-8 rounded-xl bg-gray-50 px-4 py-3">
                      <p className="text-gray-400 text-[9px] font-black uppercase tracking-widest mb-1">
                        Tracking ID
                      </p>

                      <p className="text-xs font-mono font-bold break-all">
                        {order.trackingId}
                      </p>
                    </div>
                  )}

                  {/* FOOTER */}

                  <div className="mt-10 pt-8 border-t border-gray-100 flex flex-col sm:flex-row justify-between sm:items-center gap-6">
                    <div>
                      <p className="text-gray-400 text-[9px] font-bold uppercase tracking-widest">
                        Placed On:{" "}
                        {formatDate(
                          order.createdAt
                        )}
                      </p>

                      <p className="text-gray-400 text-[9px] font-bold uppercase tracking-widest mt-2">
                        Payment Method:{" "}
                        <span className="text-black">
                          {isCod
                            ? "Cash on Delivery"
                            : "Stripe Checkout"}
                        </span>
                      </p>
                    </div>

                    <div className="sm:text-right">
                      <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                        {isPaid
                          ? "Paid Total"
                          : "Order Total"}
                      </span>

                      <p className="text-2xl sm:text-3xl font-[1000] italic tracking-tighter">
                        {formatPrice(
                          order.amountTotal
                        )}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}

            {/* LOAD MORE */}

            {hasMore && nextCursor && (
              <div className="pt-6 text-center">
                {loadMoreError && (
                  <p
                    className="text-red-600 text-sm mb-4"
                    role="alert"
                  >
                    {loadMoreError}
                  </p>
                )}

                <button
                  type="button"
                  onClick={loadMoreOrders}
                  disabled={loadingMore}
                  className="bg-black text-white px-12 py-5 rounded-full font-black uppercase text-[10px] tracking-widest hover:bg-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMore
                    ? "Loading Orders..."
                    : "Load More Orders"}
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
