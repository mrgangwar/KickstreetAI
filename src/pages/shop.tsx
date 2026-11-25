
import {
  useState,
  useEffect,
  useMemo,
  type FormEvent,
} from "react";

import type {
  GetServerSideProps,
} from "next";

import type {
  SortOrder,
} from "mongoose";

type ProductFilter = Record<string, unknown>;

import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";

import Navbar from "@/components/Navbar";
import ProductCard from "@/components/ProductCard";

import dbConnect from "@/lib/db";

import Product, {
  type IProduct,
} from "@/models/Product";

/* =========================================
   CONSTANTS
========================================= */

const PAGE_SIZE = 12;
const MAX_SEARCH_LENGTH = 100;
const MAX_PAGE = 100000;

const CATEGORIES = [
  "all",
  "Men",
  "Women",
  "Children",
] as const;

type Category =
  (typeof CATEGORIES)[number];

const SORT_OPTIONS = [
  "latest",
  "price_asc",
  "price_desc",
  "rating",
] as const;

type SortOption =
  (typeof SORT_OPTIONS)[number];

/* =========================================
   TYPES
========================================= */

interface ShopProduct {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  price: number;
  category: string;
  brand?: string;
  sizes?: string[];
  colors?: string[];
  stock: number;
  images: string[];
  ratings?: number;
  numOfReviews?: number;
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

interface ShopProps {
  products: ShopProduct[];
  pagination: Pagination;
  initialSearch: string;
  initialCategory: Category;
  initialSort: SortOption;
  error?: string;
}

/* =========================================
   QUERY HELPERS
========================================= */

function getQueryString(
  value: string | string[] | undefined
): string {
  return typeof value === "string"
    ? value
    : "";
}

function normalizeSearch(
  value: string
): string {
  return value
    .trim()
    .slice(0, MAX_SEARCH_LENGTH);
}

function isCategory(
  value: string
): value is Category {
  return CATEGORIES.some(
    (category) => category === value
  );
}

function isSortOption(
  value: string
): value is SortOption {
  return SORT_OPTIONS.some(
    (option) => option === value
  );
}

function escapeRegex(
  value: string
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function getPageNumber(
  value: string
): number {
  if (!/^[1-9]\d*$/.test(value)) {
    return 1;
  }

  const page = Number(value);

  if (
    !Number.isSafeInteger(page) ||
    page > MAX_PAGE
  ) {
    return 1;
  }

  return page;
}

function getSortQuery(
  sort: SortOption
): Record<string, SortOrder> {
  switch (sort) {
    case "price_asc":
      return {
        price: 1,
        _id: 1,
      };

    case "price_desc":
      return {
        price: -1,
        _id: -1,
      };

    case "rating":
      return {
        ratings: -1,
        numOfReviews: -1,
        _id: -1,
      };

    default:
      return {
        createdAt: -1,
        _id: -1,
      };
  }
}

/* =========================================
   SHOP PAGE
========================================= */

export default function Shop({
  products,
  pagination,
  initialSearch,
  initialCategory,
  initialSort,
  error,
}: ShopProps) {
  const router = useRouter();

  const [search, setSearch] =
    useState(initialSearch);

  const [navigating, setNavigating] =
    useState(false);

  /* =====================================
     SYNC SEARCH INPUT
  ===================================== */

  useEffect(() => {
    setSearch(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    const finishNavigation = () => {
      setNavigating(false);
    };

    router.events.on(
      "routeChangeComplete",
      finishNavigation
    );

    router.events.on(
      "routeChangeError",
      finishNavigation
    );

    return () => {
      router.events.off(
        "routeChangeComplete",
        finishNavigation
      );

      router.events.off(
        "routeChangeError",
        finishNavigation
      );
    };
  }, [router.events]);

  /* =====================================
     URL NAVIGATION
  ===================================== */

  const updateQuery = async (
    updates: {
      search?: string;
      category?: Category;
      sort?: SortOption;
      page?: number;
    }
  ) => {
    if (navigating) {
      return;
    }

    const nextSearch =
      updates.search !== undefined
        ? normalizeSearch(
            updates.search
          )
        : initialSearch;

    const nextCategory =
      updates.category ??
      initialCategory;

    const nextSort =
      updates.sort ??
      initialSort;

    const nextPage =
      updates.page ?? 1;

    const query: Record<
      string,
      string
    > = {};

    if (nextSearch) {
      query.search = nextSearch;
    }

    if (
      nextCategory !== "all"
    ) {
      query.category =
        nextCategory;
    }

    if (
      nextSort !== "latest"
    ) {
      query.sort = nextSort;
    }

    if (nextPage > 1) {
      query.page =
        String(nextPage);
    }

    setNavigating(true);

    try {
      const completed =
        await router.push(
          {
            pathname: "/shop",
            query,
          },
          undefined,
          {
            scroll: false,
          }
        );

      if (!completed) {
        setNavigating(false);
      }
    } catch {
      setNavigating(false);
    }
  };

  /* =====================================
     SEARCH
  ===================================== */

  const handleSearchSubmit = (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    void updateQuery({
      search,
      page: 1,
    });
  };

  const clearSearch = () => {
    setSearch("");

    void updateQuery({
      search: "",
      page: 1,
    });
  };

  /* =====================================
     FILTERS
  ===================================== */

  const handleCategoryChange = (
    category: Category
  ) => {
    void updateQuery({
      category,
      page: 1,
    });
  };

  const handleSortChange = (
    sort: SortOption
  ) => {
    void updateQuery({
      sort,
      page: 1,
    });
  };

  /* =====================================
     PAGINATION
  ===================================== */

  const goToPage = (
    page: number
  ) => {
    if (
      navigating ||
      page < 1 ||
      page > pagination.totalPages ||
      page === pagination.page
    ) {
      return;
    }

    void updateQuery({
      page,
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const pageNumbers = useMemo(
    () => {
      const pages: number[] = [];

      const start = Math.max(
        1,
        pagination.page - 2
      );

      const end = Math.min(
        pagination.totalPages,
        pagination.page + 2
      );

      for (
        let page = start;
        page <= end;
        page++
      ) {
        pages.push(page);
      }

      return pages;
    },
    [
      pagination.page,
      pagination.totalPages,
    ]
  );

  const firstResult =
    pagination.total === 0
      ? 0
      : (pagination.page - 1) *
          pagination.limit +
        1;

  const lastResult = Math.min(
    pagination.page *
      pagination.limit,
    pagination.total
  );

  /* =====================================
     RENDER
  ===================================== */

  return (
    <div className="min-h-screen bg-white selection:bg-orange-600 selection:text-white">
      <Head>
        <title>
          Shop New Arrivals | KICKSTREET
        </title>

        <meta
          name="description"
          content="Discover sneakers at KickStreet. Search shoes, browse categories, compare prices and explore new arrivals."
        />
      </Head>

      <Navbar />

      <main className="w-full px-4 sm:px-6 py-8 sm:py-12">
        <div className="max-w-7xl mx-auto">

          {/* HEADER */}

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 sm:mb-12">
            <div>
              <h1 className="text-[8vw] sm:text-6xl lg:text-7xl font-black italic uppercase tracking-tighter leading-none">
                New{" "}
                <span className="text-orange-600">
                  Arrivals
                </span>
              </h1>

              <p className="text-gray-400 font-bold text-[10px] uppercase tracking-[0.3em] mt-2">
                Fresh Drops at KickStreet
              </p>

              <Link
                href="/recommendations"
                className="inline-flex items-center gap-1.5 mt-2.5 text-xs font-black uppercase tracking-wider text-orange-600 hover:text-black transition"
              >
                <span>⚡ Need personalized picks? Try AI Matchmaker</span>
                <span>→</span>
              </Link>
            </div>

            {/* SORT */}

            <div className="flex items-center gap-2">
              <label
                htmlFor="shop-sort"
                className="sr-only"
              >
                Sort products
              </label>

              <select
                id="shop-sort"
                value={initialSort}
                disabled={navigating}
                onChange={(event) =>
                  handleSortChange(
                    event.target.value as SortOption
                  )
                }
                className="bg-gray-50 border border-gray-200 text-xs font-bold uppercase px-4 py-3 rounded-full focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
              >
                <option value="latest">
                  Newest First
                </option>

                <option value="price_asc">
                  Price: Low to High
                </option>

                <option value="price_desc">
                  Price: High to Low
                </option>

                <option value="rating">
                  Top Rated
                </option>
              </select>
            </div>
          </div>

          {/* SEARCH */}

          <form
            onSubmit={
              handleSearchSubmit
            }
            className="mb-6"
            role="search"
          >
            <div className="relative flex gap-2">
              <div className="relative flex-1 min-w-0">
                <label
                  htmlFor="shop-search"
                  className="sr-only"
                >
                  Search shoes
                </label>

                <input
                  id="shop-search"
                  type="search"
                  placeholder="Search shoes..."
                  value={search}
                  maxLength={
                    MAX_SEARCH_LENGTH
                  }
                  onChange={(event) =>
                    setSearch(
                      event.target.value
                    )
                  }
                  className="w-full px-4 py-3 sm:py-4 pl-11 sm:pl-12 bg-gray-100 rounded-xl sm:rounded-full font-medium border-2 border-transparent outline-none focus:border-orange-500 focus:bg-white text-base sm:text-sm transition-all"
                />

                <svg
                  className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>

                {search && (
                  <button
                    type="button"
                    onClick={
                      clearSearch
                    }
                    disabled={
                      navigating
                    }
                    aria-label="Clear search"
                    className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 disabled:opacity-50"
                  >
                    ×
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={navigating}
                className="bg-black text-white px-5 sm:px-8 rounded-xl sm:rounded-full text-xs font-black uppercase tracking-wider hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                Search
              </button>
            </div>
          </form>

          {/* CATEGORIES */}

          <div
            className="flex flex-wrap gap-2 sm:gap-3 mb-8"
            role="group"
            aria-label="Product categories"
          >
            {CATEGORIES.map(
              (category) => (
                <button
                  key={category}
                  type="button"
                  disabled={
                    navigating
                  }
                  onClick={() =>
                    handleCategoryChange(
                      category
                    )
                  }
                  aria-pressed={
                    initialCategory ===
                    category
                  }
                  className={`px-5 py-3 sm:py-2 rounded-xl sm:rounded-full text-sm sm:text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 ${
                    initialCategory ===
                    category
                      ? "bg-orange-600 text-white shadow-lg"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {category === "all"
                    ? "All"
                    : category}
                </button>
              )
            )}
          </div>

          {/* RESULTS */}

          {!error && (
            <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
              <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">
                Showing {firstResult}–
                {lastResult} of{" "}
                {pagination.total} products
              </p>

              {navigating && (
                <p
                  role="status"
                  className="text-xs text-orange-600 font-bold"
                >
                  Loading products...
                </p>
              )}
            </div>
          )}

          {/* ERROR */}

          {error ? (
            <div
              role="alert"
              className="text-center py-16 sm:py-24 bg-red-50 rounded-2xl sm:rounded-[3rem] px-6"
            >
              <h2 className="font-black uppercase italic text-xl mb-3">
                Unable to Load Products
              </h2>

              <p className="text-gray-500 text-sm mb-6">
                {error}
              </p>

              <button
                type="button"
                onClick={() =>
                  void router.reload()
                }
                className="bg-black text-white px-8 py-4 rounded-full text-xs font-black uppercase hover:bg-orange-600 transition"
              >
                Try Again
              </button>
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-16 sm:py-24 bg-gray-50 rounded-2xl sm:rounded-[3rem] px-6">
              <p className="text-gray-400 font-black uppercase italic text-xl">
                No Products Found
              </p>

              <p className="text-gray-400 text-xs mt-2 mb-6">
                Try another search or category.
              </p>

              <button
                type="button"
                disabled={
                  navigating
                }
                onClick={() =>
                  void updateQuery({
                    search: "",
                    category: "all",
                    sort: "latest",
                    page: 1,
                  })
                }
                className="bg-black text-white px-8 py-4 rounded-full text-xs font-black uppercase hover:bg-orange-600 transition disabled:opacity-50"
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div
              className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6 ${
                navigating
                  ? "opacity-60"
                  : ""
              }`}
              aria-busy={
                navigating
              }
            >
              {products.map(
                (product) => (
                  <ProductCard
                    key={product._id}
                    product={product}
                  />
                )
              )}
            </div>
          )}

          {/* PAGINATION */}

          {!error &&
            pagination.totalPages > 1 && (
              <nav
                aria-label="Product pagination"
                className="mt-12 sm:mt-16 flex flex-wrap justify-center items-center gap-2"
              >
                <button
                  type="button"
                  disabled={
                    pagination.page <= 1 ||
                    navigating
                  }
                  onClick={() =>
                    goToPage(
                      pagination.page - 1
                    )
                  }
                  className="px-4 py-3 rounded-xl bg-gray-100 text-xs font-black uppercase disabled:opacity-40 hover:bg-gray-200"
                >
                  Previous
                </button>

                {pageNumbers.map(
                  (page) => (
                    <button
                      key={page}
                      type="button"
                      disabled={
                        navigating
                      }
                      onClick={() =>
                        goToPage(
                          page
                        )
                      }
                      aria-current={
                        page ===
                        pagination.page
                          ? "page"
                          : undefined
                      }
                      className={`w-11 h-11 rounded-xl text-xs font-black ${
                        page ===
                        pagination.page
                          ? "bg-orange-600 text-white"
                          : "bg-gray-100 text-black hover:bg-gray-200"
                      }`}
                    >
                      {page}
                    </button>
                  )
                )}

                <button
                  type="button"
                  disabled={
                    pagination.page >=
                      pagination.totalPages ||
                    navigating
                  }
                  onClick={() =>
                    goToPage(
                      pagination.page + 1
                    )
                  }
                  className="px-4 py-3 rounded-xl bg-gray-100 text-xs font-black uppercase disabled:opacity-40 hover:bg-gray-200"
                >
                  Next
                </button>
              </nav>
            )}
        </div>
      </main>
    </div>
  );
}

/* =========================================
   SERVER-SIDE DATA FETCHING
========================================= */

export const getServerSideProps:
  GetServerSideProps<ShopProps> =
  async (context) => {
    const search =
      normalizeSearch(
        getQueryString(
          context.query.search
        )
      );

    const rawCategory =
      getQueryString(
        context.query.category
      );

    const category: Category =
      isCategory(rawCategory)
        ? rawCategory
        : "all";

    const rawSort =
      getQueryString(
        context.query.sort
      );

    const sort: SortOption =
      isSortOption(rawSort)
        ? rawSort
        : "latest";

    const requestedPage =
      getPageNumber(
        getQueryString(
          context.query.page
        ) || "1"
      );

    const emptyPagination: Pagination = {
      page: 1,
      limit: PAGE_SIZE,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: false,
    };

    try {
      await dbConnect();

      const filter:
        ProductFilter = {
          isActive: true,
        };

      if (
        category !== "all"
      ) {
        filter.category =
          category;
      }

      if (search) {
        const safeSearch =
          escapeRegex(search);

        filter.$or = [
          {
            name: {
              $regex: safeSearch,
              $options: "i",
            },
          },
          {
            brand: {
              $regex: safeSearch,
              $options: "i",
            },
          },
        ];
      }

      const total =
        await Product.countDocuments(
          filter
        );

      const totalPages =
        Math.ceil(
          total / PAGE_SIZE
        );

      const currentPage =
        totalPages > 0
          ? Math.min(
              requestedPage,
              totalPages
            )
          : 1;

      const skip =
        (currentPage - 1) *
        PAGE_SIZE;

      const documents =
        await Product.find(
          filter
        )
          .select(
            "name slug description price category brand sizes colors stock images ratings numOfReviews isActive"
          )
          .sort(
            getSortQuery(sort)
          )
          .skip(skip)
          .limit(
            PAGE_SIZE
          )
          .lean();

      const products: ShopProduct[] =
        documents.map(
          (document) => ({
            _id: String(
              document._id
            ),

            name: String(
              document.name ?? ""
            ),

            slug: String(
              document.slug ?? ""
            ),

            description:
              document.description ??
              "",

            price: Number(
              document.price ?? 0
            ),

            category: String(
              document.category ?? ""
            ),

            brand:
              document.brand ?? "",

            sizes:
              document.sizes ?? [],

            colors:
              document.colors ?? [],

            stock: Number(
              document.stock ?? 0
            ),

            images:
              document.images ?? [],

            ratings: Number(
              document.ratings ?? 0
            ),

            numOfReviews: Number(
              document.numOfReviews ?? 0
            ),

            isActive:
              document.isActive,
          })
        );

      const pagination: Pagination = {
        page: currentPage,
        limit: PAGE_SIZE,
        total,
        totalPages,
        hasNextPage:
          currentPage <
          totalPages,
        hasPrevPage:
          currentPage > 1,
      };

      return {
        props: {
          products,
          pagination,
          initialSearch: search,
          initialCategory: category,
          initialSort: sort,
        },
      };
    } catch (error: unknown) {
      console.error(
        "SHOP_SSR_ERROR:",
        error instanceof Error
          ? error.name
          : "UnknownError"
      );

      return {
        props: {
          products: [],
          pagination:
            emptyPagination,
          initialSearch: search,
          initialCategory:
            category,
          initialSort: sort,
          error:
            "Products are temporarily unavailable. Please try again.",
        },
      };
    }
  };
