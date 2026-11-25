
import Head from "next/head";
import Link from "next/link";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useSession } from "next-auth/react";

import AdminLayout from "@/components/AdminLayout";

/* =========================================
   TYPES
========================================= */

type DateFilter =
  | "all"
  | "today"
  | "week"
  | "month";

interface OrderItem {
  name: string;
  qty?: number;
  quantity?: number;
  price: number;
}

interface Order {
  _id: string;
  email: string;
  amountTotal: number;
  status: string;
  orderStatus: string;
  createdAt: string;
  items?: OrderItem[];
}

interface Stats {
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
  recentOrders: Order[];
  allOrders: Order[];
  filter?: string;
}

interface StatsResponse {
  success?: boolean;
  message?: string;
  stats?: Partial<Stats>;
}

/* =========================================
   CONSTANTS
========================================= */

const REFRESH_INTERVAL = 30000;

const FILTERS: {
  value: DateFilter;
  label: string;
}[] = [
  {
    value: "all",
    label: "All Time",
  },
  {
    value: "today",
    label: "Today",
  },
  {
    value: "week",
    label: "This Week",
  },
  {
    value: "month",
    label: "This Month",
  },
];

const EMPTY_STATS: Stats = {
  totalRevenue: 0,
  totalOrders: 0,
  productsCount: 0,
  pendingOrders: 0,
  paidOrders: 0,
  failedOrders: 0,
  processingOrders: 0,
  shippedOrders: 0,
  deliveredOrders: 0,
  cancelledOrders: 0,
  recentOrders: [],
  allOrders: [],
};

/* =========================================
   HELPERS
========================================= */

function formatCurrency(
  value: number
): string {
  return new Intl.NumberFormat(
    "en-IN",
    {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }
  ).format(value);
}

function formatNumber(
  value: number
): string {
  return new Intl.NumberFormat(
    "en-IN"
  ).format(value);
}

function formatDate(
  value: string
): string {
  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "Unknown date";
  }

  return date.toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}

function getFilterLabel(
  filter: DateFilter
): string {
  return (
    FILTERS.find(
      (item) =>
        item.value === filter
    )?.label || "All Time"
  );
}

function getStatusColor(
  status: string
): string {
  switch (status) {
    case "Paid":
    case "Delivered":
      return "border-green-200 bg-green-50 text-green-700";

    case "Pending":
      return "border-orange-200 bg-orange-50 text-orange-700";

    case "Processing":
      return "border-blue-200 bg-blue-50 text-blue-700";

    case "Shipped":
      return "border-purple-200 bg-purple-50 text-purple-700";

    case "Failed":
    case "Cancelled":
      return "border-red-200 bg-red-50 text-red-700";

    default:
      return "border-gray-200 bg-gray-50 text-gray-700";
  }
}

function normalizeNumber(
  value: unknown
): number {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  )
    ? value
    : 0;
}

function normalizeStats(
  input: Partial<Stats>
): Stats {
  return {
    totalRevenue:
      normalizeNumber(
        input.totalRevenue
      ),

    totalOrders:
      normalizeNumber(
        input.totalOrders
      ),

    productsCount:
      normalizeNumber(
        input.productsCount
      ),

    pendingOrders:
      normalizeNumber(
        input.pendingOrders
      ),

    paidOrders:
      normalizeNumber(
        input.paidOrders
      ),

    failedOrders:
      normalizeNumber(
        input.failedOrders
      ),

    processingOrders:
      normalizeNumber(
        input.processingOrders
      ),

    shippedOrders:
      normalizeNumber(
        input.shippedOrders
      ),

    deliveredOrders:
      normalizeNumber(
        input.deliveredOrders
      ),

    cancelledOrders:
      normalizeNumber(
        input.cancelledOrders
      ),

    recentOrders:
      Array.isArray(
        input.recentOrders
      )
        ? input.recentOrders
        : [],

    allOrders:
      Array.isArray(
        input.allOrders
      )
        ? input.allOrders
        : [],

    filter:
      input.filter,
  };
}

/* =========================================
   CSV HELPERS
========================================= */

/**
 * Escape CSV values safely.
 *
 * Prefix spreadsheet formula-like
 * values to prevent CSV injection.
 */
function escapeCSV(
  value: unknown
): string {
  let text =
    value === null ||
    value === undefined
      ? ""
      : String(value);

  if (
    /^[\s]*[=+\-@]/.test(text)
  ) {
    text = `'${text}`;
  }

  return `"${text.replace(
    /"/g,
    '""'
  )}"`;
}

function downloadCSV(
  filename: string,
  rows: unknown[][]
): void {
  const csv =
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map(escapeCSV)
          .join(",")
      )
      .join("\r\n");

  const blob = new Blob(
    [csv],
    {
      type:
        "text/csv;charset=utf-8;",
    }
  );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);

  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/* =========================================
   DASHBOARD COMPONENT
========================================= */

export default function Dashboard() {
  const {
    data: session,
    status,
  } = useSession();

  const isAdmin =
    session?.user?.role ===
    "admin";

  const [stats, setStats] =
    useState<Stats>(
      EMPTY_STATS
    );

  const [filter, setFilter] =
    useState<DateFilter>("all");

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [lastUpdated, setLastUpdated] =
    useState<Date | null>(
      null
    );

  const [showReportModal, setShowReportModal] =
    useState(false);

  const requestIdRef =
    useRef(0);

  const latestStatsRef =
    useRef<Stats>(
      EMPTY_STATS
    );

  const reportModalRef =
    useRef<HTMLDivElement>(null);

  /* =====================================
     FETCH DASHBOARD STATS
  ===================================== */

  const fetchStats = useCallback(
    async (
      selectedFilter: DateFilter,
      signal?: AbortSignal,
      initial = false
    ) => {
      const requestId =
        ++requestIdRef.current;

      if (initial) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError("");

      try {
        const response =
          await fetch(
            `/api/admin/stats?filter=${encodeURIComponent(
              selectedFilter
            )}`,
            {
              credentials:
                "same-origin",
              cache: "no-store",
              signal,
            }
          );

        const data: StatsResponse =
          await response.json();

        if (
          !response.ok ||
          data.success !== true ||
          !data.stats
        ) {
          throw new Error(
            data.message ||
              "Unable to load dashboard analytics."
          );
        }

        if (
          signal?.aborted ||
          requestId !==
            requestIdRef.current
        ) {
          return;
        }

        const normalized =
          normalizeStats(
            data.stats
          );

        latestStatsRef.current =
          normalized;

        setStats(normalized);

        setLastUpdated(
          new Date()
        );
      } catch (err: unknown) {
        if (
          signal?.aborted ||
          requestId !==
            requestIdRef.current
        ) {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "Dashboard request failed."
        );
      } finally {
        if (
          !signal?.aborted &&
          requestId ===
            requestIdRef.current
        ) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    []
  );

  /* =====================================
     INITIAL LOAD + AUTO REFRESH
  ===================================== */

  useEffect(() => {
    if (
      status !==
        "authenticated" ||
      !isAdmin
    ) {
      return;
    }

    const controller =
      new AbortController();

    void fetchStats(
      filter,
      controller.signal,
      true
    );

    const intervalId =
      window.setInterval(() => {
        if (
          document.visibilityState ===
          "visible"
        ) {
          void fetchStats(
            filter,
            controller.signal
          );
        }
      }, REFRESH_INTERVAL);

    return () => {
      controller.abort();

      window.clearInterval(
        intervalId
      );

      requestIdRef.current += 1;
    };
  }, [
    status,
    isAdmin,
    filter,
    fetchStats,
  ]);

  /* =====================================
     MANUAL REFRESH
  ===================================== */

  function handleRefresh() {
    if (refreshing) {
      return;
    }

    void fetchStats(
      filter
    );
  }

  /* =====================================
     EXPORT CSV
  ===================================== */

  function exportToCSV() {
    const currentStats =
      latestStatsRef.current;

    if (
      currentStats.allOrders.length ===
      0
    ) {
      setError(
        "No order records are available for export."
      );
      setShowReportModal(false);
      return;
    }

    const rows: unknown[][] = [
      [
        "Order ID",
        "Customer Email",
        "Amount (INR)",
        "Payment Status",
        "Order Status",
        "Date",
      ],
      ...currentStats.allOrders.map(
        (order) => [
          order._id,
          order.email,
          order.amountTotal,
          order.status,
          order.orderStatus,
          formatDate(
            order.createdAt
          ),
        ]
      ),
    ];

    const date =
      new Date()
        .toISOString()
        .slice(0, 10);

    downloadCSV(
      `kickstreet_orders_${filter}_${date}.csv`,
      rows
    );

    setShowReportModal(false);
  }

  /* =====================================
     REPORT MODAL KEYBOARD SUPPORT
  ===================================== */

  useEffect(() => {
    if (!showReportModal) {
      return;
    }

    function handleKeyDown(
      event: KeyboardEvent
    ) {
      if (event.key === "Escape") {
        setShowReportModal(false);
      }

      if (
        event.key !== "Tab" ||
        !reportModalRef.current
      ) {
        return;
      }

      const buttons =
        reportModalRef.current.querySelectorAll<HTMLButtonElement>(
          "button:not([disabled])"
        );

      if (!buttons.length) {
        return;
      }

      const first =
        buttons[0];

      const last =
        buttons[
          buttons.length - 1
        ];

      if (
        event.shiftKey &&
        document.activeElement === first
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === last
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [showReportModal]);

  /* =====================================
     METRIC CARDS
  ===================================== */

  const primaryCards = [
    {
      label: "Revenue",
      value: formatCurrency(
        stats.totalRevenue
      ),
      color: "text-green-600",
      description:
        "Reported revenue",
    },
    {
      label: "Pending Payments",
      value: formatNumber(
        stats.pendingOrders
      ),
      color: "text-orange-600",
      description:
        "Payment pending",
    },
    {
      label: "Paid Orders",
      value: formatNumber(
        stats.paidOrders
      ),
      color: "text-blue-600",
      description:
        "Payment completed",
    },
    {
      label: "Products",
      value: formatNumber(
        stats.productsCount
      ),
      color: "text-black",
      description:
        "Product records",
    },
  ];

  const secondaryCards = [
    {
      label: "Failed",
      value: stats.failedOrders,
      color: "text-red-600",
    },
    {
      label: "Processing",
      value: stats.processingOrders,
      color: "text-blue-600",
    },
    {
      label: "Shipped",
      value: stats.shippedOrders,
      color: "text-purple-600",
    },
    {
      label: "Delivered",
      value: stats.deliveredOrders,
      color: "text-green-600",
    },
    {
      label: "Cancelled",
      value: stats.cancelledOrders,
      color: "text-gray-600",
    },
    {
      label: "Total Orders",
      value: stats.totalOrders,
      color: "text-black",
    },
  ];

  /* =====================================
     RENDER
  ===================================== */

  return (
    <AdminLayout>
      <Head>
        <title>
          Dashboard | KickStreet Admin
        </title>

        <meta
          name="robots"
          content="noindex,nofollow"
        />
      </Head>

      <div className="mx-auto w-full max-w-7xl">
        {/* HEADER */}

        <section className="mb-8 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm sm:p-9">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
            <div>
              <h1 className="text-3xl font-black uppercase italic tracking-tighter text-black sm:text-5xl">
                Insights{" "}
                <span className="text-orange-600">
                  Overview
                </span>
              </h1>

              <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                KickStreet Control Center
              </p>

              {lastUpdated && (
                <p className="mt-2 text-[10px] font-bold text-green-700">
                  Last updated:{" "}
                  {lastUpdated.toLocaleTimeString(
                    "en-IN"
                  )}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={
                  refreshing || loading
                }
                className="rounded-2xl border border-gray-200 bg-white px-6 py-4 text-xs font-black uppercase text-black transition hover:bg-gray-100 disabled:opacity-50"
              >
                {refreshing
                  ? "Refreshing..."
                  : "Refresh"}
              </button>

              <button
                type="button"
                onClick={() =>
                  setShowReportModal(true)
                }
                disabled={
                  loading ||
                  stats.allOrders.length ===
                    0
                }
                className="rounded-2xl bg-black px-6 py-4 text-xs font-black uppercase tracking-wider text-white transition hover:bg-orange-600 disabled:opacity-50"
              >
                Export Report
              </button>
            </div>
          </div>

          {/* FILTERS */}

          <div className="mt-7 flex flex-wrap gap-2 border-t border-gray-100 pt-6">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() =>
                  setFilter(
                    item.value
                  )
                }
                aria-pressed={
                  filter ===
                  item.value
                }
                className={`rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-wider transition ${
                  filter === item.value
                    ? "bg-orange-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        {/* ERROR */}

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"
          >
            {error}
          </div>
        )}

        {/* LOADING */}

        {loading ? (
          <div className="flex min-h-80 flex-col items-center justify-center rounded-3xl bg-white">
            <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-orange-600" />

            <p className="text-xs font-black uppercase tracking-widest text-gray-500">
              Loading Analytics...
            </p>
          </div>
        ) : !lastUpdated ? (
          <div className="rounded-3xl bg-white p-10 text-center">
            <h2 className="text-lg font-black uppercase text-black">
              Analytics Unavailable
            </h2>

            <p className="mt-2 text-sm text-gray-500">
              Dashboard data could not be loaded.
            </p>

            <button
              type="button"
              onClick={handleRefresh}
              className="mt-5 rounded-xl bg-black px-6 py-3 text-xs font-black uppercase text-white"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* PRIMARY METRICS */}

            <section
              aria-label="Primary metrics"
              className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-6"
            >
              {primaryCards.map(
                (card) => (
                  <div
                    key={card.label}
                    className="min-w-0 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm transition hover:shadow-md sm:p-7"
                  >
                    <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                      {card.label}
                    </p>

                    <h2
                      className={`mt-4 break-words text-2xl font-black tracking-tighter sm:text-3xl xl:text-4xl ${card.color}`}
                    >
                      {card.value}
                    </h2>

                    <p className="mt-2 text-[10px] text-gray-400">
                      {card.description}
                    </p>
                  </div>
                )
              )}
            </section>

            {/* SECONDARY METRICS */}

            <section
              aria-label="Order metrics"
              className="mb-9 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
            >
              {secondaryCards.map(
                (card) => (
                  <div
                    key={card.label}
                    className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
                  >
                    <p className="text-[9px] font-black uppercase text-gray-400">
                      {card.label}
                    </p>

                    <p
                      className={`mt-3 text-2xl font-black ${card.color}`}
                    >
                      {formatNumber(
                        card.value
                      )}
                    </p>
                  </div>
                )
              )}
            </section>

            {/* RECENT ORDERS */}

            <section className="mb-10 overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
              <div className="flex flex-col justify-between gap-3 border-b border-gray-100 bg-gray-50 p-6 sm:flex-row sm:items-center">
                <h2 className="text-xl font-black uppercase italic text-black">
                  Recent Drops Sold
                </h2>

                <Link
                  href="/admin/orders"
                  className="text-xs font-black uppercase text-orange-600 hover:underline"
                >
                  View All Orders
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[680px] w-full text-left">
                  <thead className="border-b border-gray-100 bg-white text-[10px] font-black uppercase tracking-wider text-gray-400">
                    <tr>
                      <th className="px-5 py-5">
                        Order
                      </th>

                      <th className="px-5 py-5">
                        Customer
                      </th>

                      <th className="px-5 py-5 text-right">
                        Amount
                      </th>

                      <th className="px-5 py-5 text-center">
                        Payment
                      </th>

                      <th className="px-5 py-5 text-center">
                        Shipping
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100">
                    {stats.recentOrders.length >
                    0 ? (
                      stats.recentOrders.map(
                        (order) => (
                          <tr
                            key={order._id}
                            className="transition hover:bg-gray-50"
                          >
                            <td className="px-5 py-5 font-mono text-xs font-bold text-gray-600">
                              #
                              {order._id
                                .slice(-6)
                                .toUpperCase()}
                            </td>

                            <td className="px-5 py-5">
                              <p className="max-w-44 truncate text-xs font-black text-black">
                                {order.email.split(
                                  "@"
                                )[0]}
                              </p>

                              <p className="max-w-44 truncate text-[10px] text-gray-400">
                                {order.email}
                              </p>
                            </td>

                            <td className="px-5 py-5 text-right text-sm font-black text-black">
                              {formatCurrency(
                                order.amountTotal
                              )}
                            </td>

                            <td className="px-5 py-5 text-center">
                              <span
                                className={`inline-block rounded-full border px-3 py-1 text-[9px] font-black uppercase ${getStatusColor(
                                  order.status
                                )}`}
                              >
                                {order.status}
                              </span>
                            </td>

                            <td className="px-5 py-5 text-center">
                              <span
                                className={`inline-block rounded-full border px-3 py-1 text-[9px] font-black uppercase ${getStatusColor(
                                  order.orderStatus
                                )}`}
                              >
                                {order.orderStatus}
                              </span>
                            </td>
                          </tr>
                        )
                      )
                    ) : (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-16 text-center text-sm font-bold text-gray-400"
                        >
                          No orders found for this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* REPORT INFORMATION */}

            <p className="mb-8 text-xs text-gray-500">
              Showing analytics for{" "}
              <strong>
                {getFilterLabel(
                  filter
                )}
              </strong>
              . Data refreshes approximately
              every 30 seconds while this
              tab is visible.
            </p>
          </>
        )}

        {/* REPORT MODAL */}

        {showReportModal && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                setShowReportModal(false);
              }
            }}
          >
            <div
              ref={reportModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="report-title"
              className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl"
            >
              <h2
                id="report-title"
                className="text-2xl font-black uppercase italic text-black"
              >
                Export{" "}
                <span className="text-orange-600">
                  Report
                </span>
              </h2>

              <p className="mt-3 text-xs text-gray-500">
                Period:{" "}
                {getFilterLabel(
                  filter
                )}
              </p>

              <p className="mt-2 text-xs text-gray-500">
                Exporting{" "}
                {
                  stats.allOrders.length
                }{" "}
                order records returned by
                the dashboard API.
              </p>

              <p className="mt-3 text-xs text-orange-700">
                Note: This CSV may not
                include every historical
                order if the API limits
                its results.
              </p>

              <button
                type="button"
                onClick={exportToCSV}
                className="mt-7 w-full rounded-2xl bg-black px-6 py-4 text-xs font-black uppercase tracking-wider text-white transition hover:bg-orange-600"
              >
                Download CSV
              </button>

              <button
                type="button"
                onClick={() =>
                  setShowReportModal(false)
                }
                className="mt-3 w-full rounded-2xl bg-gray-100 px-6 py-4 text-xs font-black uppercase text-gray-600 transition hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
