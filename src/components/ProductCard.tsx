
import {
  useState,
} from "react";

import Link from "next/link";
import Image from "next/image";

/* =========================================
   TYPES
========================================= */

export interface ProductCardData {
  _id: string;
  name: string;
  price: number;
  images: string[];
  category: string;
  stock: number;

  slug?: string;
  brand?: string;
  description?: string;

  ratings?: number;
  numOfReviews?: number;

  isActive?: boolean;
}

interface ProductCardProps {
  product: ProductCardData;
}

/* =========================================
   CONSTANTS
========================================= */

const FALLBACK_IMAGE =
  "/placeholder.png";

const LOW_STOCK_THRESHOLD = 5;

const INR_FORMATTER =
  new Intl.NumberFormat(
    "en-IN",
    {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }
  );

/* =========================================
   PRICE HELPER
========================================= */

function formatPrice(
  price: number
): string {
  if (
    typeof price !== "number" ||
    !Number.isFinite(price) ||
    price < 0
  ) {
    return "Price unavailable";
  }

  return INR_FORMATTER.format(
    price
  );
}

/* =========================================
   RATING HELPER
========================================= */

function getValidRating(
  rating?: number
): number | null {
  if (
    typeof rating !== "number" ||
    !Number.isFinite(rating) ||
    rating < 0 ||
    rating > 5
  ) {
    return null;
  }

  return rating;
}

/* =========================================
   IMAGE VALIDATION
========================================= */

function getValidImage(
  images: string[]
): string {
  if (
    !Array.isArray(images)
  ) {
    return FALLBACK_IMAGE;
  }

  const image =
    images.find(
      (item) =>
        typeof item === "string" &&
        item.trim().length > 0
    );

  if (!image) {
    return FALLBACK_IMAGE;
  }

  const trimmed =
    image.trim();

  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//")
  ) {
    return trimmed;
  }

  try {
    const url =
      new URL(trimmed);

    if (
      url.protocol === "https:" ||
      url.protocol === "http:"
    ) {
      return trimmed;
    }
  } catch {
    return FALLBACK_IMAGE;
  }

  return FALLBACK_IMAGE;
}

/* =========================================
   PRODUCT IMAGE COMPONENT
========================================= */

function ProductImage({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  const [
    imageError,
    setImageError,
  ] = useState(false);

  const imageSrc =
    imageError
      ? FALLBACK_IMAGE
      : src;

  return (
    <Image
      src={imageSrc}
      alt={alt}
      fill
      sizes="
        (max-width: 479px) 100vw,
        (max-width: 1023px) 50vw,
        25vw
      "
      loading="lazy"
      className="
        object-contain
        p-4
        sm:p-6
        lg:p-8
        transition-transform
        duration-500
        ease-out
        group-hover:scale-105
        motion-reduce:transform-none
      "
      onError={() => {
        if (!imageError) {
          setImageError(true);
        }
      }}
    />
  );
}

/* =========================================
   PRODUCT CARD
========================================= */

export default function ProductCard({
  product,
}: ProductCardProps) {
  /* =====================================
     PRODUCT VISIBILITY
  ===================================== */

  if (
    product.isActive === false
  ) {
    return null;
  }

  /* =====================================
     PRODUCT INFORMATION
  ===================================== */

  const productName =
    typeof product.name === "string" &&
    product.name.trim()
      ? product.name.trim()
      : "Unnamed Product";

  const brand =
    typeof product.brand === "string" &&
    product.brand.trim()
      ? product.brand.trim()
      : "KickStreet";

  const category =
    typeof product.category === "string" &&
    product.category.trim()
      ? product.category.trim()
      : "Shoes";

  const primaryImage =
    getValidImage(
      product.images
    );

  /* =====================================
     STOCK STATUS
  ===================================== */

  const stock =
    typeof product.stock === "number" &&
    Number.isFinite(product.stock)
      ? Math.max(
          0,
          Math.floor(product.stock)
        )
      : 0;

  const isOutOfStock =
    stock === 0;

  const isLowStock =
    stock > 0 &&
    stock < LOW_STOCK_THRESHOLD;

  /* =====================================
     PRICE STATUS
  ===================================== */

  const hasValidPrice =
    typeof product.price === "number" &&
    Number.isFinite(product.price) &&
    product.price >= 0;

  const formattedPrice =
    formatPrice(
      product.price
    );

  /* =====================================
     RATINGS
  ===================================== */

  const rating =
    getValidRating(
      product.ratings
    );

  const reviewCount =
    typeof product.numOfReviews ===
      "number" &&
    Number.isSafeInteger(
      product.numOfReviews
    ) &&
    product.numOfReviews >= 0
      ? product.numOfReviews
      : 0;

  const showRating =
    rating !== null &&
    reviewCount > 0;

  /* =====================================
     PRODUCT LINK
  ===================================== */

  const productId =
    typeof product._id === "string"
      ? product._id.trim()
      : "";

  const hasValidId =
    /^[a-fA-F0-9]{24}$/.test(
      productId
    );

  const productUrl =
    hasValidId
      ? `/product/${encodeURIComponent(
          productId
        )}`
      : null;

  /* =====================================
     CARD CONTENT
  ===================================== */

  const cardContent = (
    <article
      className="
        group
        relative
        flex
        h-full
        w-full
        flex-col
        overflow-hidden
        rounded-[1.5rem]
        sm:rounded-[2.5rem]
        border
        border-gray-100
        bg-white
        shadow-sm
        transition-all
        duration-300
        hover:shadow-xl
      "
    >
      {/* =================================
          IMAGE CONTAINER
      ================================= */}

      <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#f6f6f6]">

        <ProductImage
          key={primaryImage}
          src={primaryImage}
          alt={productName}
        />

        {/* CATEGORY BADGE */}

        <span
          className="
            absolute
            top-3
            left-3
            z-10
            rounded-full
            bg-white/90
            px-3
            py-2
            text-[9px]
            font-black
            uppercase
            tracking-wider
            text-black
            shadow-sm
            backdrop-blur-md
            sm:top-6
            sm:left-6
          "
        >
          {category}
        </span>

        {/* SOLD OUT BADGE */}

        {isOutOfStock && (
          <div
            className="
              absolute
              inset-0
              z-20
              flex
              items-center
              justify-center
              bg-white/40
              backdrop-blur-[2px]
            "
          >
            <span className="bg-black px-5 py-3 text-xs font-black uppercase italic tracking-widest text-white shadow-xl -rotate-6">
              Sold Out
            </span>
          </div>
        )}

        {/* LOW STOCK BADGE */}

        {!isOutOfStock &&
          isLowStock && (
            <div className="absolute bottom-3 left-1/2 z-20 w-[90%] -translate-x-1/2">
              <span className="block rounded-full bg-orange-600 px-3 py-2 text-center text-[9px] font-black uppercase tracking-wider text-white">
                Only {stock} Left!
              </span>
            </div>
          )}
      </div>

      {/* =================================
          PRODUCT INFORMATION
      ================================= */}

      <div className="flex flex-1 flex-col p-4 sm:p-6 lg:p-8">

        {/* BRAND */}

        <p className="mb-2 truncate text-[9px] font-black uppercase tracking-[0.15em] text-gray-500">
          {brand}
        </p>

        {/* PRODUCT NAME */}

        <h3 className="mb-4 line-clamp-2 break-words text-base font-black uppercase italic leading-tight text-gray-900 transition-colors group-hover:text-orange-600 sm:text-lg lg:text-xl">
          {productName}
        </h3>

        {/* RATING */}

        {showRating && (
          <div
            className="mb-4 flex items-center gap-1.5"
            aria-label={`${rating.toFixed(
              1
            )} out of 5 stars from ${reviewCount} reviews`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-orange-500"
            >
              <path d="M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55-4.76-4.64 6.58-.96L12 2.5z" />
            </svg>

            <span className="text-xs font-black text-gray-900">
              {rating.toFixed(1)}
            </span>

            <span className="text-[10px] font-medium text-gray-500">
              ({reviewCount})
            </span>
          </div>
        )}

        {/* =================================
            PRICE AND ACTION
        ================================= */}

        <div className="mt-auto flex items-center justify-between gap-2">

          {/* PRICE */}

          <div className="flex min-w-0 flex-col">
            <span className="mb-1 text-[9px] font-black uppercase tracking-wider text-gray-500">
              Price
            </span>

            <span
              className={`break-words text-lg font-black italic tracking-tight sm:text-xl lg:text-2xl ${
                hasValidPrice
                  ? "text-black"
                  : "text-gray-500"
              }`}
            >
              {formattedPrice}
            </span>
          </div>

          {/* ACTION ICON */}

          <span
            aria-hidden="true"
            className="
              flex
              h-10
              w-10
              shrink-0
              items-center
              justify-center
              rounded-full
              bg-gray-100
              text-black
              transition-colors
              duration-300
              group-hover:bg-black
              group-hover:text-white
              sm:h-12
              sm:w-12
            "
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
          </span>
        </div>
      </div>
    </article>
  );

  /* =====================================
     INVALID PRODUCT ID
  ===================================== */

  if (!productUrl) {
    return (
      <div className="h-full opacity-75">
        {cardContent}
      </div>
    );
  }

  /* =====================================
     LINKED PRODUCT CARD
  ===================================== */

  return (
    <Link
      href={productUrl}
      aria-label={`View details for ${productName}${
        isOutOfStock
          ? ", currently sold out"
          : ""
      }`}
      className="block h-full rounded-[1.5rem] sm:rounded-[2.5rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600"
    >
      {cardContent}
    </Link>
  );
}
