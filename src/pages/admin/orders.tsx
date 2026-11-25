
import AdminLayout from "@/components/AdminLayout";
import Head from "next/head";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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

type PaymentMethod =
  | "stripe"
  | "cod";

interface OrderItem {
  name?: string;
  qty?: number;
  quantity?: number;
  price?: number;
  size?: string;
}

interface Order {
  _id: string;
  email: string;
  items: OrderItem[];
  amountTotal: number;
  status: PaymentStatus;
  orderStatus: OrderStatus;
  paymentMethod: PaymentMethod;
  trackingId?: string;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface OrdersResponse {
  success: boolean;
  orders?: Order[];
  order?: Order;
  message?: string;
  pagination?: Pagination;
}

/* =========================================
   CONSTANTS
========================================= */

const PAGE_SIZE = 20;

const ORDER_STATUSES: OrderStatus[] = [
  "Processing",
  "Shipped",
  "Delivered",
  "Cancelled",
  "Returned",
];

const OBJECT_ID_REGEX =
  /^[a-fA-F0-9]{24}$/;

/* =========================================
   HELPERS
========================================= */

function getAllowedOrderStatuses(
  currentStatus: OrderStatus
): OrderStatus[] {
  switch (currentStatus) {
    case "Processing":
      return [
        "Processing",
        "Shipped",
        "Cancelled",
      ];

    case "Shipped":
      return [
        "Shipped",
        "Delivered",
      ];

    case "Delivered":
      return [
        "Delivered",
        "Returned",
      ];

    case "Cancelled":
      return ["Cancelled"];

    case "Returned":
      return ["Returned"];

    default:
      return [];
  }
}

function isAllowedOrderTransition(
  currentStatus: OrderStatus,
  newStatus: OrderStatus
): boolean {
  return getAllowedOrderStatuses(
    currentStatus
  ).includes(newStatus);
}

function getStatusColor(
  status: PaymentStatus
): string {
  switch (status) {
    case "Paid":
      return "bg-green-100 text-green-700";

    case "Pending":
      return "bg-orange-100 text-orange-700";

    case "Failed":
      return "bg-red-100 text-red-700";
  }
}

function getOrderStatusColor(
  status: OrderStatus
): string {
  switch (status) {
    case "Processing":
      return "bg-blue-100 text-blue-700";

    case "Shipped":
      return "bg-purple-100 text-purple-700";

    case "Delivered":
      return "bg-green-100 text-green-700";

    case "Cancelled":
      return "bg-red-100 text-red-700";

    case "Returned":
      return "bg-gray-100 text-gray-700";
  }
}

function formatPrice(
  amount: number
): string {
  const value =
    Number.isFinite(amount)
      ? amount
      : 0;

  return value.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });
}

function formatDate(
  value: string
): string {
  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "Date unavailable";
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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
    : 0;
}

function getTotalUnits(
  items: OrderItem[]
): number {
  if (!Array.isArray(items)) {
    return 0;
  }

  return items.reduce(
    (total, item) =>
      total + getItemQuantity(item),
    0
  );
}

function isOrderStatus(
  value: unknown
): value is OrderStatus {
  return (
    typeof value === "string" &&
    ORDER_STATUSES.some(
      (status) => status === value
    )
  );
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
    typeof order.email === "string" &&
    Array.isArray(order.items) &&
    typeof order.amountTotal === "number" &&
    Number.isFinite(order.amountTotal) &&
    order.amountTotal >= 0 &&
    (
      order.status === undefined ||
      order.status === "Pending" ||
      order.status === "Paid" ||
      order.status === "Failed"
    ) &&
    isOrderStatus(order.orderStatus) &&
    (
      order.paymentMethod === "stripe" ||
      order.paymentMethod === "cod"
    ) &&
    typeof order.createdAt === "string"
  );
}

function isValidPagination(
  value: unknown
): value is Pagination {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const pagination =
    value as Record<string, unknown>;

  return (
    typeof pagination.page === "number" &&
    Number.isSafeInteger(pagination.page) &&
    pagination.page >= 1 &&
    typeof pagination.limit === "number" &&
    Number.isSafeInteger(pagination.limit) &&
    pagination.limit > 0 &&
    typeof pagination.total === "number" &&
    Number.isSafeInteger(pagination.total) &&
    pagination.total >= 0 &&
    typeof pagination.totalPages === "number" &&
    Number.isSafeInteger(pagination.totalPages) &&
    pagination.totalPages >= 0
  );
}

async function readApiResponse(
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

export default function AdminOrders() {
  const [orders, setOrders] =
    useState<Order[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [updating, setUpdating] =
    useState<string | null>(null);

  const [error, setError] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const [search, setSearch] =
    useState("");

  const [page, setPage] =
    useState(1);

  const [
    refreshCount,
    setRefreshCount,
  ] = useState(0);

  const [pagination, setPagination] =
    useState<Pagination>({
      page: 1,
      limit: PAGE_SIZE,
      total: 0,
      totalPages: 0,
    });

  const [expandedOrderId, setExpandedOrderId] =
    useState<string | null>(null);

  /*
   * Synchronous guard prevents
   * duplicate update submissions.
   */
  const updateLockRef =
    useRef(false);

  /* =========================================
     FETCH ORDERS
  ========================================= */

  const fetchOrders = useCallback(
    async (
      signal: AbortSignal
    ) => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/admin/orders?page=${page}&limit=${PAGE_SIZE}`,
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
          await readApiResponse(response);

        if (
          !response.ok ||
          data.success !== true ||
          !Array.isArray(data.orders)
        ) {
          throw new Error(
            data.message ||
              "Unable to load orders."
          );
        }

        if (signal.aborted) {
          return;
        }

        if (
          !data.orders.every(isValidOrder)
        ) {
          throw new Error(
            "The server returned invalid order information."
          );
        }

        const nextPagination =
          isValidPagination(data.pagination)
            ? data.pagination
            : {
                page,
                limit: PAGE_SIZE,
                total: data.orders.length,
                totalPages: 1,
              };

        /*
         * If an order was removed and
         * the current page is now invalid,
         * return to the last valid page.
         */
        if (
          nextPagination.totalPages > 0 &&
          page > nextPagination.totalPages
        ) {
          setPage(
            nextPagination.totalPages
          );
          return;
        }

        /*
         * Legacy orders may not contain
         * a payment status. Treat missing
         * status conservatively as Pending.
         */
        const normalizedOrders: Order[] =
          data.orders.map((order) => ({
            ...order,
            status: order.status ?? "Pending",
          }));

        setOrders(normalizedOrders);
        setPagination(nextPagination);
      } catch (err: unknown) {
        if (signal.aborted) {
          return;
        }

        setOrders([]);

        setError(
          err instanceof Error
            ? err.message
            : "Failed to load orders."
        );
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },
    [page]
  );

  /* =========================================
     FETCH ON PAGE CHANGE
  ========================================= */

  useEffect(() => {
    const controller =
      new AbortController();

    void fetchOrders(
      controller.signal
    );

    return () => {
      controller.abort();
    };
  }, [
    fetchOrders,
    refreshCount,
  ]);

  /* =========================================
     REFRESH ORDERS
  ========================================= */

  const refreshOrders = () => {
    setSuccessMessage("");
    setExpandedOrderId(null);

    setRefreshCount(
      (previous) => previous + 1
    );
  };

  /* =========================================
     UPDATE ORDER STATUS
  ========================================= */

  const updateOrderStatus = async (
    orderId: string,
    newStatus: OrderStatus
  ) => {
    if (
      updateLockRef.current ||
      !OBJECT_ID_REGEX.test(orderId) ||
      !isOrderStatus(newStatus)
    ) {
      return;
    }

    const existingOrder = orders.find(
      (order) =>
        order._id === orderId
    );

    if (!existingOrder) {
      return;
    }

    if (
      existingOrder.orderStatus ===
      newStatus
    ) {
      return;
    }

    if (
      !isAllowedOrderTransition(
        existingOrder.orderStatus,
        newStatus
      )
    ) {
      setError(
        `Invalid order status transition: ${existingOrder.orderStatus} to ${newStatus}.`
      );
      return;
    }

    if (
      newStatus === "Cancelled" &&
      !window.confirm(
        "Cancel this order? Stock restoration and refund handling must be completed according to your order policy."
      )
    ) {
      return;
    }

    if (
      (
        newStatus === "Shipped" ||
        newStatus === "Delivered"
      ) &&
      existingOrder.paymentMethod ===
        "stripe" &&
      existingOrder.status !== "Paid"
    ) {
      setError(
        "Stripe payment must be confirmed before shipping or delivery."
      );
      return;
    }

    updateLockRef.current = true;

    setUpdating(orderId);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch(
        "/api/admin/orders",
        {
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
            Accept: "application/json",
          },
          credentials: "same-origin",
          body: JSON.stringify({
            orderId,
            orderStatus: newStatus,
          }),
        }
      );

      const data =
        await readApiResponse(response);

      if (
        !response.ok ||
        data.success !== true
      ) {
        throw new Error(
          data.message ||
            "Failed to update order."
        );
      }

      setSuccessMessage(
        `Order #${orderId
          .slice(-6)
          .toUpperCase()} updated successfully.`
      );

      setRefreshCount(
        (previous) => previous + 1
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Error updating order."
      );
    } finally {
      updateLockRef.current = false;
      setUpdating(null);
    }
  };

  /* =========================================
     UPDATE COD PAYMENT STATUS
  ========================================= */

  const updateCodPaymentStatus = async (
    orderId: string
  ) => {
    if (
      updateLockRef.current ||
      !OBJECT_ID_REGEX.test(orderId)
    ) {
      return;
    }

    const existingOrder = orders.find(
      (order) =>
        order._id === orderId
    );

    if (
      !existingOrder ||
      existingOrder.paymentMethod !== "cod" ||
      existingOrder.status !== "Pending"
    ) {
      return;
    }

    if (
      !window.confirm(
        "Confirm that the COD payment has been collected and mark this order as Paid?"
      )
    ) {
      return;
    }

    updateLockRef.current = true;

    setUpdating(orderId);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch(
        "/api/admin/orders",
        {
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
            Accept: "application/json",
          },
          credentials: "same-origin",
          body: JSON.stringify({
            orderId,
            status: "Paid",
          }),
        }
      );

      const data =
        await readApiResponse(response);

      if (
        !response.ok ||
        data.success !== true
      ) {
        throw new Error(
          data.message ||
            "Failed to update COD payment status."
        );
      }

      setSuccessMessage(
        `COD payment for order #${orderId
          .slice(-6)
          .toUpperCase()} marked as Paid successfully.`
      );

      setRefreshCount(
        (previous) => previous + 1
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Error updating COD payment status."
      );
    } finally {
      updateLockRef.current = false;
      setUpdating(null);
    }
  };

  /* =========================================
     COD PAYMENT ACTION
  ========================================= */

  const renderCodPaymentAction = (
    order: Order
  ) => {
    if (
      order.paymentMethod !== "cod" ||
      order.status !== "Pending"
    ) {
      return null;
    }

    return (
      <button
        type="button"
        onClick={() =>
          void updateCodPaymentStatus(
            order._id
          )
        }
        disabled={
          updating !== null ||
          loading
        }
        className="mt-2 px-3 py-2 rounded-lg bg-green-600 text-white text-[9px] font-black uppercase hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label={`Mark COD payment as paid for order ${order._id}`}
      >
        {updating === order._id
          ? "Updating..."
          : "Mark Paid"}
      </button>
    );
  };

  /* =========================================
     CLIENT-SIDE SEARCH
  ========================================= */

  const normalizedSearch =
    search.trim().toLowerCase();

  const filteredOrders = useMemo(
    () =>
      orders.filter((order) => {
        if (!normalizedSearch) {
          return true;
        }

        return (
          order._id
            .toLowerCase()
            .includes(normalizedSearch) ||
          order.email
            .toLowerCase()
            .includes(normalizedSearch) ||
          (order.trackingId || "")
            .toLowerCase()
            .includes(normalizedSearch)
        );
      }),
    [orders, normalizedSearch]
  );

  /* =========================================
     STATUS SELECT
  ========================================= */

  const renderStatusSelect = (
    order: Order
  ) => {
    const isUpdating =
      updating !== null;

    const allowedStatuses =
      getAllowedOrderStatuses(
        order.orderStatus
      );

    const isLocked =
      allowedStatuses.length <= 1;

    return (
      <select
        value={order.orderStatus}
        onChange={(event) => {
          const selectedStatus =
            event.target.value;

          if (
            !isOrderStatus(selectedStatus)
          ) {
            return;
          }

          void updateOrderStatus(
            order._id,
            selectedStatus
          );
        }}
        disabled={
          isUpdating ||
          isLocked ||
          loading
        }
        aria-label={`Update status for order ${order._id}`}
        className="text-[10px] font-black uppercase bg-gray-100 rounded-lg px-3 py-2 border border-gray-200 outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {allowedStatuses.map(
          (status) => (
            <option
              key={status}
              value={status}
            >
              {status}
            </option>
          )
        )}
      </select>
    );
  };

  /* =========================================
     ORDER ITEMS
  ========================================= */

  const renderOrderItems = (
    order: Order
  ) => {
    const isExpanded =
      expandedOrderId === order._id;

    return (
      <div>
        <button
          type="button"
          onClick={() =>
            setExpandedOrderId(
              isExpanded
                ? null
                : order._id
            )
          }
          aria-expanded={isExpanded}
          className="text-[10px] font-black uppercase text-orange-600 hover:text-orange-700"
        >
          {isExpanded
            ? "Hide Items"
            : "View Items"}
        </button>

        {isExpanded && (
          <div className="mt-3 space-y-2">
            {order.items.map(
              (item, index) => (
                <div
                  key={`${order._id}-${index}`}
                  className="bg-gray-50 rounded-lg p-3 text-xs"
                >
                  <p className="font-bold text-black">
                    {item.name ||
                      "Product"}
                  </p>

                  <p className="text-gray-500 mt-1">
                    Size:{" "}
                    {item.size || "N/A"}
                    {" · "}
                    Qty:{" "}
                    {getItemQuantity(item)}
                  </p>

                  {typeof item.price ===
                    "number" && (
                    <p className="text-gray-600 mt-1">
                      Unit price:{" "}
                      {formatPrice(
                        item.price
                      )}
                    </p>
                  )}
                </div>
              )
            )}
          </div>
        )}
      </div>
    );
  };

  /* =========================================
     RENDER
  ========================================= */

  return (
    <AdminLayout>
      <Head>
        <title>
          Manage Orders | KickStreet Admin
        </title>

        <meta
          name="robots"
          content="noindex, nofollow"
        />
      </Head>

      {/* PAGE HEADER */}

      <div className="mb-8 px-2 sm:px-0">
        <h2 className="text-3xl sm:text-4xl font-black italic uppercase tracking-tighter text-black">
          Manage Orders
        </h2>

        <p className="text-gray-400 text-xs sm:text-sm font-bold uppercase tracking-widest">
          Customer Sales Tracker
        </p>
      </div>

      {/* SEARCH AND REFRESH */}

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <input
          type="search"
          value={search}
          onChange={(event) =>
            setSearch(
              event.target.value
            )
          }
          placeholder="Search order ID, email or tracking ID..."
          aria-label="Search orders on current page"
          className="flex-1 px-5 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500"
        />

        <button
          type="button"
          onClick={refreshOrders}
          disabled={loading}
          className="bg-black text-white px-6 py-3 rounded-xl text-xs font-black uppercase hover:bg-orange-600 transition disabled:opacity-50"
        >
          Refresh Orders
        </button>
      </div>

      {/* NOTIFICATIONS */}

      {error && (
        <div
          role="alert"
          className="mb-6 bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-xl text-sm"
        >
          {error}
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="mb-6 bg-green-50 border border-green-200 text-green-700 px-5 py-4 rounded-xl text-sm"
        >
          {successMessage}
        </div>
      )}

      {/* MAIN CONTAINER */}

      <div className="bg-white rounded-[1.5rem] sm:rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

        {/* DESKTOP TABLE */}

        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {[
                  "Order ID",
                  "Customer",
                  "Items",
                  "Total",
                  "Payment",
                  "Order Status",
                  "Actions",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="p-5 font-black text-[10px] uppercase tracking-widest text-gray-400"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="p-20 text-center italic text-gray-400 font-bold uppercase tracking-widest text-xs"
                  >
                    Loading Orders...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="p-20 text-center text-gray-400 uppercase font-black text-xs"
                  >
                    {search
                      ? "No matching orders on this page."
                      : "No orders found yet."}
                  </td>
                </tr>
              ) : (
                filteredOrders.map(
                  (order) => (
                    <tr
                      key={order._id}
                      className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="p-5 text-[11px] font-mono font-bold text-gray-400">
                        #
                        {order._id
                          .slice(-6)
                          .toUpperCase()}

                        <p className="mt-2 text-[9px]">
                          {formatDate(
                            order.createdAt
                          )}
                        </p>

                        {order.trackingId && (
                          <p className="mt-2 text-[9px] break-all">
                            Tracking:{" "}
                            {order.trackingId}
                          </p>
                        )}
                      </td>

                      <td className="p-5">
                        <p className="font-black text-sm text-black">
                          {order.email.split(
                            "@"
                          )[0]}
                        </p>

                        <p className="text-[10px] text-gray-400 font-bold break-all">
                          {order.email}
                        </p>
                      </td>

                      <td className="p-5 text-xs font-bold text-gray-600">
                        <p>
                          {getTotalUnits(
                            order.items
                          )}{" "}
                          Units
                        </p>

                        <div className="mt-2">
                          {renderOrderItems(
                            order
                          )}
                        </div>
                      </td>

                      <td className="p-5 font-black text-black">
                        {formatPrice(
                          order.amountTotal
                        )}
                      </td>

                      <td className="p-5">
                        <span
                          className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${getStatusColor(
                            order.status
                          )}`}
                        >
                          {order.status}
                        </span>

                        <p className="text-[9px] text-gray-400 mt-2 uppercase font-bold">
                          {order.paymentMethod ===
                          "cod"
                            ? "Cash on Delivery"
                            : "Stripe"}
                        </p>

                        {renderCodPaymentAction(
                          order
                        )}
                      </td>

                      <td className="p-5">
                        <span
                          className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${getOrderStatusColor(
                            order.orderStatus
                          )}`}
                        >
                          {order.orderStatus}
                        </span>
                      </td>

                      <td className="p-5">
                        {renderStatusSelect(
                          order
                        )}
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE AND TABLET */}

        <div className="lg:hidden divide-y divide-gray-100">
          {loading ? (
            <div className="p-10 text-center text-gray-400 font-bold uppercase text-xs tracking-widest">
              Loading Orders...
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-10 text-center text-gray-400 font-bold uppercase text-xs">
              {search
                ? "No matching orders on this page."
                : "No orders found yet."}
            </div>
          ) : (
            filteredOrders.map(
              (order) => (
                <div
                  key={order._id}
                  className="p-5 flex flex-col gap-4"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0">
                      <p className="text-[10px] font-mono font-bold text-gray-400 mb-1">
                        #
                        {order._id
                          .slice(-8)
                          .toUpperCase()}
                      </p>

                      <h4 className="font-black uppercase text-sm leading-tight break-all">
                        {order.email}
                      </h4>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="font-black text-black">
                        {formatPrice(
                          order.amountTotal
                        )}
                      </p>

                      <p className="text-[10px] font-bold text-gray-400">
                        {formatDate(
                          order.createdAt
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-[8px] font-black uppercase border ${getStatusColor(
                        order.status
                      )}`}
                    >
                      PAY: {order.status}
                    </span>

                    <span
                      className={`px-3 py-1 rounded-full text-[8px] font-black uppercase border ${getOrderStatusColor(
                        order.orderStatus
                      )}`}
                    >
                      SHIP:{" "}
                      {order.orderStatus}
                    </span>
                  </div>

                  <div className="text-[10px] text-gray-500 font-bold">
                    {getTotalUnits(
                      order.items
                    )}{" "}
                    Units ·{" "}
                    {order.paymentMethod ===
                    "cod"
                      ? "Cash on Delivery"
                      : "Stripe"}
                  </div>

                  {renderCodPaymentAction(
                    order
                  )}

                  <div>
                    {renderOrderItems(
                      order
                    )}
                  </div>

                  {order.trackingId && (
                    <div className="text-[10px] text-gray-500 break-all">
                      Tracking:{" "}
                      {order.trackingId}
                    </div>
                  )}

                  <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between gap-3">
                    <span className="text-[10px] font-black uppercase text-gray-400">
                      Quick Update
                    </span>

                    {renderStatusSelect(
                      order
                    )}
                  </div>
                </div>
              )
            )
          )}
        </div>
      </div>

      {/* PAGINATION */}

      {!loading &&
        pagination.totalPages > 1 && (
          <div className="mt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-xs text-gray-500 font-bold">
              Page {pagination.page} of{" "}
              {pagination.totalPages} ·{" "}
              {pagination.total} total orders
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() =>
                  setPage(
                    (previous) =>
                      Math.max(
                        1,
                        previous - 1
                      )
                  )
                }
                disabled={
                  page <= 1 ||
                  loading ||
                  updating !== null
                }
                className="px-6 py-3 bg-white border border-gray-200 rounded-xl text-xs font-black uppercase disabled:opacity-40"
              >
                Previous
              </button>

              <button
                type="button"
                onClick={() =>
                  setPage(
                    (previous) =>
                      Math.min(
                        pagination.totalPages,
                        previous + 1
                      )
                  )
                }
                disabled={
                  page >=
                    pagination.totalPages ||
                  loading ||
                  updating !== null
                }
                className="px-6 py-3 bg-black text-white rounded-xl text-xs font-black uppercase disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}

      {/* SEARCH NOTE */}

      <p className="mt-6 text-[10px] text-gray-400">
        Search filters only the currently loaded page.
        Use pagination to browse older orders.
      </p>
    </AdminLayout>
  );
}
