
import type {
  NextApiRequest,
  NextApiResponse,
} from "next";

import type {
  SortOrder,
} from "mongoose";

type ProductFilter = Record<string, unknown>;

import dbConnect from "@/lib/db";

import Product, {
  type IProduct,
  type ProductCategory,
} from "@/models/Product";

/* =========================================
   CONFIGURATION
========================================= */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 12;

const MAX_LIMIT = 48;
const MAX_SKIP = 100000;

const MAX_SEARCH_LENGTH = 100;
const MAX_BRAND_LENGTH = 100;
const MAX_PRICE = 10000000;

const ALLOWED_CATEGORIES: ProductCategory[] = [
  "Men",
  "Women",
  "Children",
];

const ALLOWED_SORTS = [
  "latest",
  "oldest",
  "price_asc",
  "price_desc",
  "rating",
  "name_asc",
  "name_desc",
] as const;

type SortOption =
  (typeof ALLOWED_SORTS)[number];

/* =========================================
   RESPONSE TYPES
========================================= */

interface PublicProduct {
  _id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  category: ProductCategory;
  brand: string;
  sizes: string[];
  colors: string[];
  stock: number;
  images: string[];
  ratings: number;
  numOfReviews: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

type ApiResponse =
  | {
      success: true;
      products: PublicProduct[];
      pagination: Pagination;
    }
  | {
      success: false;
      message: string;
    };

/* =========================================
   VALIDATION ERROR
========================================= */

class QueryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryValidationError";
  }
}

/* =========================================
   QUERY HELPERS
========================================= */

function getSingleQueryValue(
  value: string | string[] | undefined,
  field: string
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    throw new QueryValidationError(
      `${field} must be provided only once.`
    );
  }

  return value.trim();
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  field: string,
  maximum?: number
): number {
  if (value === undefined) {
    return fallback;
  }

  if (!/^[1-9]\d*$/.test(value)) {
    throw new QueryValidationError(
      `${field} must be a positive integer.`
    );
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    (maximum !== undefined &&
      parsed > maximum)
  ) {
    throw new QueryValidationError(
      `Invalid ${field}.`
    );
  }

  return parsed;
}

function parsePrice(
  value: string | undefined,
  field: string
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    !/^\d+(?:\.\d{1,2})?$/.test(value)
  ) {
    throw new QueryValidationError(
      `${field} must be a valid non-negative price.`
    );
  }

  const parsed = Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed > MAX_PRICE
  ) {
    throw new QueryValidationError(
      `${field} cannot exceed ${MAX_PRICE}.`
    );
  }

  return parsed;
}

function escapeRegex(
  value: string
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function parseCategory(
  value: string | undefined
): ProductCategory | undefined {
  if (
    value === undefined ||
    value === "" ||
    value.toLowerCase() === "all"
  ) {
    return undefined;
  }

  const category =
    ALLOWED_CATEGORIES.find(
      (item) =>
        item.toLowerCase() ===
        value.toLowerCase()
    );

  if (!category) {
    throw new QueryValidationError(
      "Category must be Men, Women, or Children."
    );
  }

  return category;
}

function parseSort(
  value: string | undefined
): SortOption {
  if (
    value === undefined ||
    value === ""
  ) {
    return "latest";
  }

  if (
    !ALLOWED_SORTS.includes(
      value as SortOption
    )
  ) {
    throw new QueryValidationError(
      "Invalid sort option."
    );
  }

  return value as SortOption;
}

/* =========================================
   SORT CONFIGURATION
========================================= */

function getSortQuery(
  sort: SortOption
): Record<string, SortOrder> {
  switch (sort) {
    case "oldest":
      return {
        createdAt: 1,
        _id: 1,
      };

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

    case "name_asc":
      return {
        name: 1,
        _id: 1,
      };

    case "name_desc":
      return {
        name: -1,
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
   PRODUCT FILTER BUILDER
========================================= */

function buildProductFilter(
  query: NextApiRequest["query"]
): ProductFilter {
  /*
   * Older products may not have
   * an isActive field.
   *
   * Exclude only explicitly
   * deactivated products.
   */

  const filter: ProductFilter = {
    isActive: {
      $ne: false,
    },
  };

  /* CATEGORY */

  const category = parseCategory(
    getSingleQueryValue(
      query.category,
      "category"
    )
  );

  if (category) {
    filter.category = category;
  }

  /* SEARCH */

  const search = getSingleQueryValue(
    query.search,
    "search"
  );

  if (search) {
    if (
      search.length >
      MAX_SEARCH_LENGTH
    ) {
      throw new QueryValidationError(
        "Search query is too long."
      );
    }

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

  /* BRAND */

  const brand = getSingleQueryValue(
    query.brand,
    "brand"
  );

  if (
    brand &&
    brand.toLowerCase() !== "all"
  ) {
    if (
      brand.length >
      MAX_BRAND_LENGTH
    ) {
      throw new QueryValidationError(
        "Brand filter is too long."
      );
    }

    filter.brand = {
      $regex:
        `^${escapeRegex(brand)}$`,
      $options: "i",
    };
  }

  /* PRICE RANGE */

  const minPrice = parsePrice(
    getSingleQueryValue(
      query.minPrice,
      "minPrice"
    ),
    "minPrice"
  );

  const maxPrice = parsePrice(
    getSingleQueryValue(
      query.maxPrice,
      "maxPrice"
    ),
    "maxPrice"
  );

  if (
    minPrice !== undefined &&
    maxPrice !== undefined &&
    minPrice > maxPrice
  ) {
    throw new QueryValidationError(
      "minPrice cannot exceed maxPrice."
    );
  }

  if (
    minPrice !== undefined ||
    maxPrice !== undefined
  ) {
    const priceFilter: {
      $gte?: number;
      $lte?: number;
    } = {};

    if (minPrice !== undefined) {
      priceFilter.$gte = minPrice;
    }

    if (maxPrice !== undefined) {
      priceFilter.$lte = maxPrice;
    }

    filter.price = priceFilter;
  }

  return filter;
}

/* =========================================
   PUBLIC PRODUCTS API
========================================= */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  res.setHeader(
    "X-Content-Type-Options",
    "nosniff"
  );

  /* =====================================
     ALLOW GET ONLY
  ===================================== */

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    return res.status(405).json({
      success: false,
      message: "Method not allowed.",
    });
  }

  res.setHeader(
    "Cache-Control",
    "public, max-age=0, s-maxage=30, stale-while-revalidate=60"
  );

  try {
    /* ===================================
       PAGINATION VALIDATION
    =================================== */

    const page = parsePositiveInteger(
      getSingleQueryValue(
        req.query.page,
        "page"
      ),
      DEFAULT_PAGE,
      "page"
    );

    const limit = parsePositiveInteger(
      getSingleQueryValue(
        req.query.limit,
        "limit"
      ),
      DEFAULT_LIMIT,
      "limit",
      MAX_LIMIT
    );

    const requestedSkip =
      (page - 1) * limit;

    if (
      !Number.isSafeInteger(
        requestedSkip
      ) ||
      requestedSkip > MAX_SKIP
    ) {
      throw new QueryValidationError(
        "Requested page is too large."
      );
    }

    /* ===================================
       FILTERS AND SORTING
    =================================== */

    const filter =
      buildProductFilter(
        req.query
      );

    const sort = parseSort(
      getSingleQueryValue(
        req.query.sort,
        "sort"
      )
    );

    await dbConnect();

    /* ===================================
       COUNT PRODUCTS
    =================================== */

    const total =
      await Product.countDocuments(
        filter
      );

    const totalPages =
      Math.ceil(
        total / limit
      );

    const currentPage =
      totalPages > 0
        ? Math.min(
            page,
            totalPages
          )
        : 1;

    const skip =
      (currentPage - 1) *
      limit;

    if (skip > MAX_SKIP) {
      throw new QueryValidationError(
        "Requested page is too large."
      );
    }

    /* ===================================
       FETCH PRODUCTS
    =================================== */

    const documents =
      await Product.find(
        filter
      )
        .select(
          "name slug description price category brand sizes colors stock images ratings numOfReviews isActive createdAt updatedAt"
        )
        .sort(
          getSortQuery(sort)
        )
        .skip(skip)
        .limit(limit)
        .lean();

    /* ===================================
       SERIALIZE PRODUCTS
    =================================== */

    const products: PublicProduct[] =
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

          description: String(
            document.description ?? ""
          ),

          price: Number(
            document.price ?? 0
          ),

          category:
            document.category,

          brand: String(
            document.brand ?? ""
          ),

          sizes: Array.isArray(
            document.sizes
          )
            ? document.sizes
            : [],

          colors: Array.isArray(
            document.colors
          )
            ? document.colors
            : [],

          stock: Number(
            document.stock ?? 0
          ),

          images: Array.isArray(
            document.images
          )
            ? document.images
            : [],

          ratings: Number(
            document.ratings ?? 0
          ),

          numOfReviews: Number(
            document.numOfReviews ?? 0
          ),

          isActive:
            document.isActive !== false,

          createdAt:
            document.createdAt instanceof Date
              ? document.createdAt.toISOString()
              : "",

          updatedAt:
            document.updatedAt instanceof Date
              ? document.updatedAt.toISOString()
              : "",
        })
      );

    /* ===================================
       PAGINATION METADATA
    =================================== */

    const pagination: Pagination = {
      page: currentPage,
      limit,
      total,
      totalPages,
      hasNextPage:
        currentPage < totalPages,
      hasPrevPage:
        currentPage > 1,
    };

    return res.status(200).json({
      success: true,
      products,
      pagination,
    });
  } catch (error: unknown) {
    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    if (
      error instanceof
      QueryValidationError
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error(
      "PUBLIC_PRODUCTS_API_ERROR:",
      error instanceof Error
        ? error.name
        : "UnknownError"
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load products. Please try again.",
    });
  }
}
