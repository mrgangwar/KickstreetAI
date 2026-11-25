
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import AdminLayout from "@/components/AdminLayout";

/* =========================================
   TYPES
========================================= */

interface ProductType {
  _id: string;
  name: string;
  category: string;
  brand?: string;
  price: number;
  stock: number;
  images: string[];
  isActive?: boolean;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface ProductsResponse {
  success?: boolean;
  products?: unknown;
  pagination?: unknown;
  message?: string;
}

interface MutationResponse {
  success?: boolean;
  message?: string;
}

type StatusFilter =
  | "all"
  | "active"
  | "inactive";

/* =========================================
   CONSTANTS
========================================= */

const PAGE_SIZE = 20;

const OBJECT_ID_REGEX =
  /^[a-fA-F0-9]{24}$/;

const PLACEHOLDER_IMAGE =
  "/placeholder.png";

/* =========================================
   VALIDATION HELPERS
========================================= */

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isProduct(
  value: unknown
): value is ProductType {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value._id === "string" &&
    OBJECT_ID_REGEX.test(value._id) &&
    typeof value.name === "string" &&
    typeof value.category === "string" &&
    typeof value.price === "number" &&
    Number.isFinite(value.price) &&
    typeof value.stock === "number" &&
    Number.isFinite(value.stock) &&
    Array.isArray(value.images) &&
    value.images.every(
      (image) =>
        typeof image === "string"
    ) &&
    (
      value.isActive === undefined ||
      typeof value.isActive === "boolean"
    )
  );
}

function isPagination(
  value: unknown
): value is Pagination {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.page === "number" &&
    Number.isSafeInteger(value.page) &&
    value.page >= 1 &&
    typeof value.limit === "number" &&
    Number.isSafeInteger(value.limit) &&
    value.limit >= 1 &&
    typeof value.total === "number" &&
    Number.isSafeInteger(value.total) &&
    value.total >= 0 &&
    typeof value.totalPages === "number" &&
    Number.isSafeInteger(value.totalPages) &&
    value.totalPages >= 0 &&
    typeof value.hasNextPage === "boolean" &&
    typeof value.hasPrevPage === "boolean"
  );
}

function formatPrice(
  price: number
): string {
  return price.toLocaleString(
    "en-IN",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }
  );
}

function getErrorMessage(
  error: unknown,
  fallback: string
): string {
  return error instanceof Error
    ? error.message
    : fallback;
}

/* =========================================
   PRODUCT IMAGE
========================================= */

function ProductImage({
  product,
  size = "desktop",
}: {
  product: ProductType;
  size?: "desktop" | "mobile";
}) {
  const [failed, setFailed] =
    useState(false);

  const source =
    product.images[0] ||
    PLACEHOLDER_IMAGE;

  const imageSrc = failed
    ? PLACEHOLDER_IMAGE
    : source;

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-gray-50 ${
        size === "mobile"
          ? "h-20 w-20"
          : "h-16 w-16"
      }`}
    >
      <Image
        src={imageSrc}
        alt={product.name}
        fill
        unoptimized
        sizes={
          size === "mobile"
            ? "80px"
            : "64px"
        }
        className="object-cover"
        onError={() =>
          setFailed(true)
        }
      />
    </div>
  );
}

/* =========================================
   STATUS BADGE
========================================= */

function StatusBadge({
  active,
}: {
  active: boolean;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-wider ${
        active
          ? "bg-green-50 text-green-700"
          : "bg-red-50 text-red-600"
      }`}
    >
      {active
        ? "Active"
        : "Inactive"}
    </span>
  );
}

/* =========================================
   ADMIN PRODUCTS PAGE
========================================= */

export default function AdminProducts() {
  const [products, setProducts] =
    useState<ProductType[]>([]);

  const [pagination, setPagination] =
    useState<Pagination | null>(null);

  const [page, setPage] =
    useState(1);

  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("all");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  const [processingId, setProcessingId] =
    useState<string | null>(null);

  const [refreshKey, setRefreshKey] =
    useState(0);

  const requestIdRef =
    useRef(0);

  const mountedRef =
    useRef(false);

  /* =====================================
     FETCH PRODUCTS
  ===================================== */

  const fetchProducts = useCallback(
    async (
      requestedPage: number,
      signal?: AbortSignal
    ) => {
      const requestId =
        ++requestIdRef.current;

      setLoading(true);
      setError("");

      try {
        const params =
          new URLSearchParams({
            page: String(
              requestedPage
            ),
            limit: String(
              PAGE_SIZE
            ),
          });

        const response =
          await fetch(
            `/api/admin/products?${params.toString()}`,
            {
              method: "GET",
              credentials:
                "same-origin",
              cache: "no-store",
              signal,
            }
          );

        const data: ProductsResponse =
          await response.json();

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.message ||
              (
                response.status === 401 ||
                response.status === 403
                  ? "Admin access required."
                  : "Unable to load products."
              )
          );
        }

        if (
          !Array.isArray(
            data.products
          ) ||
          !isPagination(
            data.pagination
          )
        ) {
          throw new Error(
            "Invalid products API response."
          );
        }

        const validProducts =
          data.products.filter(
            isProduct
          );

        if (
          validProducts.length !==
          data.products.length
        ) {
          throw new Error(
            "Invalid product records received."
          );
        }

        if (
          signal?.aborted ||
          !mountedRef.current ||
          requestId !==
            requestIdRef.current
        ) {
          return;
        }

        setProducts(
          validProducts
        );

        setPagination(
          data.pagination
        );

        if (
          data.pagination.page !==
          requestedPage
        ) {
          setPage(
            data.pagination.page
          );
        }
      } catch (err: unknown) {
        if (
          signal?.aborted ||
          !mountedRef.current ||
          requestId !==
            requestIdRef.current
        ) {
          return;
        }

        setError(
          getErrorMessage(
            err,
            "Something went wrong."
          )
        );
      } finally {
        if (
          !signal?.aborted &&
          mountedRef.current &&
          requestId ===
            requestIdRef.current
        ) {
          setLoading(false);
        }
      }
    },
    []
  );

  /* =====================================
     INITIAL LOAD AND PAGINATION
  ===================================== */

  useEffect(() => {
    mountedRef.current = true;

    const controller =
      new AbortController();

    void fetchProducts(
      page,
      controller.signal
    );

    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [
    fetchProducts,
    page,
    refreshKey,
  ]);

  /* =====================================
     REFRESH
  ===================================== */

  const refreshProducts = () => {
    setRefreshKey(
      (previous) =>
        previous + 1
    );
  };

  /* =====================================
     UPDATE PRODUCT STATUS
  ===================================== */

  const updateProductStatus =
    async (
      product: ProductType,
      activate: boolean
    ) => {
      if (
        processingId !== null
      ) {
        return;
      }

      const action =
        activate
          ? "reactivate"
          : "deactivate";

      const confirmed =
        window.confirm(
          activate
            ? `Reactivate "${product.name}"? It will become visible to customers again.`
            : `Deactivate "${product.name}"? It will be hidden from customers but remain in the database.`
        );

      if (!confirmed) {
        return;
      }

      setProcessingId(
        product._id
      );

      setError("");
      setSuccessMessage("");

      try {
        const response =
          await fetch(
            `/api/admin/products/${encodeURIComponent(product._id)}`,
            {
              method:
                activate
                  ? "PUT"
                  : "DELETE",

              credentials:
                "same-origin",

              headers:
                activate
                  ? {
                      "Content-Type":
                        "application/json",
                    }
                  : undefined,

              body:
                activate
                  ? JSON.stringify({
                      isActive: true,
                    })
                  : undefined,
            }
          );

        const data: MutationResponse =
          await response.json();

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.message ||
              `Failed to ${action} product.`
          );
        }

        setProducts(
          (previous) =>
            previous.map(
              (item) =>
                item._id ===
                product._id
                  ? {
                      ...item,
                      isActive:
                        activate,
                    }
                  : item
            )
        );

        setSuccessMessage(
          `Product ${activate ? "reactivated" : "deactivated"} successfully.`
        );
      } catch (err: unknown) {
        setError(
          getErrorMessage(
            err,
            `Unable to ${action} product.`
          )
        );
      } finally {
        setProcessingId(
          null
        );
      }
    };

  /* =====================================
     FILTER PRODUCTS
  ===================================== */

  const visibleProducts =
    products.filter(
      (product) => {
        const active =
          product.isActive !== false;

        if (
          statusFilter === "active"
        ) {
          return active;
        }

        if (
          statusFilter === "inactive"
        ) {
          return !active;
        }

        return true;
      }
    );

  const startItem =
    pagination &&
    pagination.total > 0
      ? (
          pagination.page - 1
        ) *
          pagination.limit +
        1
      : 0;

  const endItem =
    pagination
      ? Math.min(
          pagination.page *
            pagination.limit,
          pagination.total
        )
      : 0;

  /* =====================================
     RENDER
  ===================================== */

  return (
    <AdminLayout>
      <Head>
        <title>
          Manage Products | KickStreet
        </title>

        <meta
          name="robots"
          content="noindex,nofollow"
        />
      </Head>

      <div className="space-y-6">

        {/* HEADER */}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-black uppercase italic tracking-tighter text-black sm:text-4xl">
              Manage Heat
            </h1>

            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.25em] text-gray-400">
              KickStreet Inventory Management
            </p>
          </div>

          <Link
            href="/admin/add-product"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-black px-7 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-orange-600"
          >
            + Add New Product
          </Link>
        </div>

        {/* MESSAGES */}

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4"
          >
            <p className="text-sm font-semibold text-red-700">
              {error}
            </p>

            <button
              type="button"
              onClick={
                refreshProducts
              }
              className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white"
            >
              Retry
            </button>
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-700"
          >
            {successMessage}
          </div>
        )}

        {/* FILTERS */}

        <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {(
              [
                "all",
                "active",
                "inactive",
              ] as const
            ).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() =>
                  setStatusFilter(
                    filter
                  )
                }
                aria-pressed={
                  statusFilter ===
                  filter
                }
                className={`rounded-lg px-4 py-2 text-[10px] font-black uppercase tracking-wider transition ${
                  statusFilter ===
                  filter
                    ? "bg-black text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-orange-50 hover:text-orange-600"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={
              refreshProducts
            }
            disabled={
              loading ||
              processingId !== null
            }
            className="rounded-lg border border-gray-200 px-4 py-2 text-[10px] font-black uppercase tracking-wider hover:border-orange-500 hover:text-orange-600 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {/* PRODUCTS CONTAINER */}

        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">

          {/* DESKTOP TABLE */}

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  {[
                    "Sneaker",
                    "Category",
                    "Price",
                    "Inventory",
                    "Status",
                    "Actions",
                  ].map(
                    (heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className="p-5 text-[10px] font-black uppercase tracking-wider text-gray-500"
                      >
                        {heading}
                      </th>
                    )
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-16 text-center text-sm font-bold text-gray-400"
                    >
                      Loading products...
                    </td>
                  </tr>
                ) : visibleProducts.length ===
                  0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-16 text-center text-sm font-bold text-gray-400"
                    >
                      {error
                        ? "Unable to load products."
                        : "No matching products found."}
                    </td>
                  </tr>
                ) : (
                  visibleProducts.map(
                    (product) => {
                      const active =
                        product.isActive !==
                        false;

                      const busy =
                        processingId ===
                        product._id;

                      return (
                        <tr
                          key={
                            product._id
                          }
                          className="transition hover:bg-gray-50"
                        >
                          <td className="p-5">
                            <div className="flex items-center gap-4">
                              <ProductImage
                                key={`${product._id}-${product.images[0] ?? ""}`}
                                product={
                                  product
                                }
                              />

                              <div className="min-w-0">
                                <p className="max-w-52 truncate text-sm font-black uppercase text-black">
                                  {
                                    product.name
                                  }
                                </p>

                                <p className="text-[10px] font-semibold text-gray-400">
                                  ID:{" "}
                                  {product._id.slice(
                                    -6
                                  )}
                                </p>

                                {product.brand && (
                                  <p className="text-[10px] font-bold text-gray-500">
                                    {
                                      product.brand
                                    }
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="p-5 text-xs font-bold text-gray-500">
                            {
                              product.category
                            }
                          </td>

                          <td className="p-5 text-sm font-black text-black">
                            ₹
                            {formatPrice(
                              product.price
                            )}
                          </td>

                          <td className="p-5">
                            <span
                              className={`rounded-full px-3 py-1 text-[10px] font-black ${
                                product.stock <
                                10
                                  ? "bg-red-50 text-red-600"
                                  : "bg-green-50 text-green-700"
                              }`}
                            >
                              {
                                product.stock
                              }{" "}
                              Units
                            </span>
                          </td>

                          <td className="p-5">
                            <StatusBadge
                              active={
                                active
                              }
                            />
                          </td>

                          <td className="p-5">
                            <div className="flex flex-wrap gap-2">
                              <Link
                                href={`/admin/edit-product/${product._id}`}
                                className="rounded-lg bg-gray-100 px-4 py-2 text-[10px] font-black uppercase text-gray-700 transition hover:bg-black hover:text-white"
                              >
                                Edit
                              </Link>

                              <button
                                type="button"
                                disabled={
                                  processingId !==
                                  null
                                }
                                onClick={() =>
                                  void updateProductStatus(
                                    product,
                                    !active
                                  )
                                }
                                className={`rounded-lg px-4 py-2 text-[10px] font-black uppercase transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                  active
                                    ? "bg-red-50 text-red-600 hover:bg-red-600 hover:text-white"
                                    : "bg-green-50 text-green-700 hover:bg-green-600 hover:text-white"
                                }`}
                              >
                                {busy
                                  ? "Saving..."
                                  : active
                                    ? "Deactivate"
                                    : "Reactivate"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                  )
                )}
              </tbody>
            </table>
          </div>

          {/* MOBILE CARDS */}

          <div className="divide-y divide-gray-100 md:hidden">
            {loading ? (
              <div className="p-10 text-center text-sm font-bold text-gray-400">
                Loading products...
              </div>
            ) : visibleProducts.length ===
              0 ? (
              <div className="p-10 text-center text-sm font-bold text-gray-400">
                {error
                  ? "Unable to load products."
                  : "No matching products found."}
              </div>
            ) : (
              visibleProducts.map(
                (product) => {
                  const active =
                    product.isActive !==
                    false;

                  const busy =
                    processingId ===
                    product._id;

                  return (
                    <div
                      key={
                        product._id
                      }
                      className="flex gap-4 p-4"
                    >
                      <ProductImage
                        key={`${product._id}-${product.images[0] ?? ""}`}
                        product={
                          product
                        }
                        size="mobile"
                      />

                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-sm font-black uppercase text-black">
                          {
                            product.name
                          }
                        </h2>

                        <p className="mt-1 text-[10px] font-bold uppercase text-gray-400">
                          {
                            product.category
                          }
                          {product.brand
                            ? ` • ${product.brand}`
                            : ""}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <StatusBadge
                            active={
                              active
                            }
                          />

                          <span className="text-xs font-black text-orange-600">
                            ₹
                            {formatPrice(
                              product.price
                            )}
                          </span>
                        </div>

                        <p className="mt-2 text-[10px] font-bold text-gray-500">
                          Stock:{" "}
                          {
                            product.stock
                          }{" "}
                          units
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link
                            href={`/admin/edit-product/${product._id}`}
                            className="rounded-lg bg-gray-100 px-4 py-2 text-[10px] font-black uppercase text-gray-700"
                          >
                            Edit
                          </Link>

                          <button
                            type="button"
                            disabled={
                              processingId !==
                              null
                            }
                            onClick={() =>
                              void updateProductStatus(
                                product,
                                !active
                              )
                            }
                            className={`rounded-lg px-4 py-2 text-[10px] font-black uppercase disabled:opacity-50 ${
                              active
                                ? "bg-red-50 text-red-600"
                                : "bg-green-50 text-green-700"
                            }`}
                          >
                            {busy
                              ? "Saving..."
                              : active
                                ? "Deactivate"
                                : "Reactivate"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }
              )
            )}
          </div>
        </div>

        {/* PAGINATION */}

        {pagination && (
          <div className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold text-gray-500">
              Showing{" "}
              <strong>
                {startItem}–
                {endItem}
              </strong>{" "}
              of{" "}
              <strong>
                {
                  pagination.total
                }
              </strong>{" "}
              products
            </p>

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={
                  loading ||
                  processingId !== null ||
                  !pagination.hasPrevPage
                }
                onClick={() =>
                  setPage(
                    (previous) =>
                      Math.max(
                        1,
                        previous - 1
                      )
                  )
                }
                className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-bold text-gray-700 hover:border-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>

              <span className="text-xs font-black text-gray-600">
                Page{" "}
                {
                  pagination.page
                }{" "}
                of{" "}
                {Math.max(
                  pagination.totalPages,
                  1
                )}
              </span>

              <button
                type="button"
                disabled={
                  loading ||
                  processingId !== null ||
                  !pagination.hasNextPage
                }
                onClick={() =>
                  setPage(
                    (previous) =>
                      previous + 1
                  )
                }
                className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-bold text-gray-700 hover:border-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
