
import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  GetServerSideProps,
} from "next";

import Head from "next/head";
import Link from "next/link";
import Image from "next/image";

import mongoose from "mongoose";

import Navbar from "@/components/Navbar";
import Toast from "@/components/Toast";

import {
  useCart,
} from "@/context/CartContext";

import dbConnect from "@/lib/db";
import Product from "@/models/Product";

/* =========================================
   TYPES
========================================= */

type ToastType =
  | "success"
  | "error"
  | "info";

interface ProductData {
  _id: string;
  name: string;
  slug?: string;
  description?: string;
  price: number;
  category: string;
  brand?: string;
  sizes?: string[];
  colors?: string[];
  stock: number;
  images?: string[];
  ratings?: number;
  numOfReviews?: number;
  isActive?: boolean;
}

interface ProductDetailsProps {
  product: ProductData | null;
  serverError?: string;
}

/* =========================================
   CONSTANTS
========================================= */

const FALLBACK_IMAGE =
  "/placeholder.png";

const FREE_SHIPPING_THRESHOLD =
  4999;

/* =========================================
   HELPERS
========================================= */

function getImageUrl(
  image: unknown
): string {
  if (
    typeof image !== "string" ||
    !image.trim()
  ) {
    return FALLBACK_IMAGE;
  }

  const value = image.trim();

  if (
    value.startsWith("/") &&
    !value.startsWith("//")
  ) {
    return value;
  }

  try {
    const url = new URL(value);

    if (
      url.protocol === "https:" ||
      url.protocol === "http:"
    ) {
      return value;
    }
  } catch {
    return FALLBACK_IMAGE;
  }

  return FALLBACK_IMAGE;
}

function formatPrice(
  value: number
): string {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    return "Price unavailable";
  }

  return new Intl.NumberFormat(
    "en-IN",
    {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }
  ).format(value);
}

function normalizeStrings(
  values?: string[]
): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return [
    ...new Set(
      values
        .filter(
          (value) =>
            typeof value === "string"
        )
        .map(
          (value) => value.trim()
        )
        .filter(Boolean)
    ),
  ];
}

function ProductGalleryImage({
  src,
  alt,
  priority = false,
  sizes,
  thumbnail = false,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  sizes: string;
  thumbnail?: boolean;
}) {
  const [hasError, setHasError] =
    useState(false);

  return (
    <Image
      src={
        hasError
          ? FALLBACK_IMAGE
          : src
      }
      alt={alt}
      {...(
        thumbnail
          ? {
              width: 80,
              height: 80,
            }
          : {
              fill: true as const,
            }
      )}
      priority={priority}
      sizes={sizes}
      className={
        thumbnail
          ? "w-full h-full object-cover"
          : "object-contain p-4 md:p-8"
      }
      onError={() =>
        setHasError(true)
      }
    />
  );
}

/* =========================================
   PRODUCT DETAILS COMPONENT
========================================= */

export default function ProductDetails({
  product,
  serverError,
}: ProductDetailsProps) {
  const {
    addToCart,
    cart,
  } = useCart();

  const [selectedSize, setSelectedSize] =
    useState("");

  const [selectedImage, setSelectedImage] =
    useState(0);

  const [showSizeGuide, setShowSizeGuide] =
    useState(false);

  const closeModalButtonRef =
    useRef<HTMLButtonElement>(null);

  const sizeGuideTriggerRef =
    useRef<HTMLButtonElement>(null);

  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: ToastType;
  }>({
    show: false,
    message: "",
    type: "success",
  });

  /* =====================================
     RESET PRODUCT SELECTION
  ===================================== */

  useEffect(() => {
    setSelectedSize("");
    setSelectedImage(0);
    setShowSizeGuide(false);
  }, [product?._id]);

  /* =====================================
     MODAL ACCESSIBILITY
  ===================================== */

  useEffect(() => {
    if (!showSizeGuide) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    closeModalButtonRef.current?.focus();

    const handleKeyDown = (
      event: KeyboardEvent
    ) => {
      if (event.key === "Escape") {
        setShowSizeGuide(false);
      }
    };

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      document.removeEventListener(
        "keydown",
        handleKeyDown
      );

      sizeGuideTriggerRef.current?.focus();
    };
  }, [showSizeGuide]);

  /* =====================================
     TOAST
  ===================================== */

  const showToast = (
    message: string,
    type: ToastType = "success"
  ) => {
    setToast({
      show: true,
      message,
      type,
    });
  };

  /* =====================================
     UNAVAILABLE PRODUCT
  ===================================== */

  if (!product) {
    return (
      <div className="min-h-screen bg-white">
        <Head>
          <title>
            Product Unavailable | KickStreet
          </title>
        </Head>

        <Navbar />

        <section className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
          <h1 className="text-3xl font-black uppercase italic tracking-tighter mb-4">
            Product Unavailable
          </h1>

          <p className="text-gray-500 text-sm mb-8">
            {serverError ||
              "This product could not be found."}
          </p>

          <Link
            href="/shop"
            className="bg-black text-white px-10 py-4 rounded-full text-xs font-black uppercase hover:bg-orange-600 transition"
          >
            Back to Shop
          </Link>
        </section>
      </div>
    );
  }

  /* =====================================
     PRODUCT IMAGES
  ===================================== */

  const images =
    Array.isArray(product.images)
      ? product.images.map(
          getImageUrl
        )
      : [];

  const galleryImages =
    images.length > 0
      ? images
      : [FALLBACK_IMAGE];

  const activeImageIndex =
    selectedImage >= 0 &&
    selectedImage < galleryImages.length
      ? selectedImage
      : 0;

  /* =====================================
     SIZES AND COLORS
  ===================================== */

  const sizes =
    normalizeStrings(
      product.sizes
    );

  const colors =
    normalizeStrings(
      product.colors
    );

  const hasSizes =
    sizes.length > 0;

  /* =====================================
     STOCK
  ===================================== */

  const stock =
    Number.isFinite(product.stock)
      ? Math.max(
          0,
          Math.floor(product.stock)
        )
      : 0;

  const inStock =
    stock > 0;

  /* =====================================
     CART QUANTITY
  ===================================== */

  const cartQuantity =
    Array.isArray(cart)
      ? cart.reduce(
          (total, item) => {
            if (
              item._id !==
              product._id
            ) {
              return total;
            }

            const quantity =
              Number(
                item.quantity
              );

            return total +
              (
                Number.isFinite(quantity) &&
                quantity > 0
                  ? Math.floor(quantity)
                  : 0
              );
          },
          0
        )
      : 0;

  const remainingStock =
    Math.max(
      0,
      stock - cartQuantity
    );

  const canAddToCart =
    inStock &&
    hasSizes &&
    sizes.includes(
      selectedSize
    ) &&
    remainingStock > 0;

  /* =====================================
     ADD TO CART
  ===================================== */

  const handleAddToBag = () => {
    if (!inStock) {
      showToast(
        "This product is currently out of stock.",
        "error"
      );
      return;
    }

    if (!hasSizes) {
      showToast(
        "No sizes are currently available.",
        "error"
      );
      return;
    }

    if (
      !selectedSize ||
      !sizes.includes(
        selectedSize
      )
    ) {
      showToast(
        "Please select a valid size first.",
        "error"
      );
      return;
    }

    if (
      remainingStock <= 0
    ) {
      showToast(
        "You have reached the available stock limit.",
        "error"
      );
      return;
    }

    addToCart({
      _id: product._id,
      name: product.name,
      price: product.price,
      image: galleryImages[0],
      size: selectedSize,
      quantity: 1,
    });

    showToast(
      "Added to bag successfully!",
      "success"
    );
  };

  /* =====================================
     RATINGS
  ===================================== */

  const rating =
    Number.isFinite(
      product.ratings
    )
      ? Math.min(
          5,
          Math.max(
            0,
            product.ratings ?? 0
          )
        )
      : 0;

  const reviewCount =
    Number.isSafeInteger(
      product.numOfReviews
    ) &&
    (product.numOfReviews ?? 0) >= 0
      ? product.numOfReviews ?? 0
      : 0;

  /* =====================================
     SHIPPING
  ===================================== */

  const qualifiesForFreeShipping =
    product.price >=
    FREE_SHIPPING_THRESHOLD;

  /* =====================================
     RENDER
  ===================================== */

  return (
    <div className="bg-white min-h-screen text-black">
      <Head>
        <title>
          {product.name} | KickStreet
        </title>

        <meta
          name="description"
          content={
            product.description
              ? product.description.slice(
                  0,
                  155
                )
              : `Shop ${product.name} at KickStreet.`
          }
        />
      </Head>

      <Navbar />

      <section className="w-full max-w-7xl mx-auto">

        {/* MOBILE BREADCRUMB */}

        <nav
          aria-label="Breadcrumb"
          className="px-4 py-3 md:hidden border-b border-gray-100"
        >
          <p className="text-xs text-gray-400 font-medium truncate">
            <Link
              href="/"
              className="hover:text-orange-600"
            >
              Home
            </Link>

            {" / "}

            <Link
              href="/shop"
              className="hover:text-orange-600"
            >
              {product.category}
            </Link>

            {" / "}

            <span className="text-black">
              {product.name}
            </span>
          </p>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2">

          {/* IMAGE GALLERY */}

          <div className="w-full">
            <div className="relative w-full aspect-[4/5] md:aspect-square bg-gray-50">
              <ProductGalleryImage
                key={
                  galleryImages[
                    activeImageIndex
                  ]
                }
                src={
                  galleryImages[
                    activeImageIndex
                  ]
                }
                alt={product.name}
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
              />

              <div className="absolute top-4 left-4 md:top-6 md:left-6 flex flex-col items-start gap-2">
                <span className="bg-white/90 backdrop-blur-sm text-black text-[10px] px-3 py-1.5 rounded-full font-bold uppercase tracking-wider shadow-sm">
                  {product.category}
                </span>

                {!inStock && (
                  <span className="bg-red-600 text-white text-[10px] px-3 py-1.5 rounded-full font-bold uppercase tracking-wider">
                    Out of Stock
                  </span>
                )}
              </div>
            </div>

            {/* THUMBNAILS */}

            {galleryImages.length > 1 && (
              <div
                className="flex gap-2 overflow-x-auto px-4 py-3 md:px-6 md:py-4 scrollbar-hide"
                aria-label="Product image gallery"
              >
                {galleryImages.map(
                  (image, index) => (
                    <button
                      key={`${index}-${image}`}
                      type="button"
                      onClick={() =>
                        setSelectedImage(
                          index
                        )
                      }
                      aria-label={`View product image ${index + 1}`}
                      aria-pressed={
                        activeImageIndex ===
                        index
                      }
                      className={`flex-shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden border-2 transition-all ${
                        activeImageIndex ===
                        index
                          ? "border-black shadow-md"
                          : "border-transparent opacity-60 hover:opacity-100"
                      }`}
                    >
                      <ProductGalleryImage
                        key={image}
                        src={image}
                        alt={`${product.name} view ${index + 1}`}
                        sizes="80px"
                        thumbnail
                      />
                    </button>
                  )
                )}
              </div>
            )}
          </div>

          {/* PRODUCT INFORMATION */}

          <div className="w-full px-4 py-6 md:px-8 md:py-8 lg:sticky lg:top-0 lg:h-fit">

            {/* DESKTOP BREADCRUMB */}

            <nav
              aria-label="Breadcrumb"
              className="hidden md:block mb-4"
            >
              <p className="text-xs text-gray-400 font-medium">
                <Link
                  href="/"
                  className="hover:text-orange-600"
                >
                  Home
                </Link>

                {" / "}

                <Link
                  href="/shop"
                  className="hover:text-orange-600"
                >
                  {product.category}
                </Link>

                {" / "}

                <span className="text-black">
                  {product.name}
                </span>
              </p>
            </nav>

            {/* BRAND */}

            {product.brand && (
              <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-2">
                {product.brand}
              </p>
            )}

            {/* ARTICLE NUMBER */}

            <div className="flex items-center gap-3 mb-2">
              <span className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">
                Art No.{" "}
                {product._id
                  .slice(-6)
                  .toUpperCase()}
              </span>
            </div>

            {/* PRODUCT NAME */}

            <h1 className="text-3xl md:text-4xl lg:text-5xl font-black uppercase italic tracking-tight text-black mb-3 leading-none">
              {product.name}
            </h1>

            {/* RATINGS */}

            {reviewCount > 0 && (
              <div className="flex items-center gap-2 mb-4">
                <span
                  className="text-orange-500 text-sm tracking-wider"
                  aria-label={`${rating.toFixed(
                    1
                  )} out of 5 stars`}
                >
                  {"★".repeat(
                    Math.round(rating)
                  )}
                  {"☆".repeat(
                    5 -
                    Math.round(rating)
                  )}
                </span>

                <span className="text-xs font-bold text-gray-500">
                  {rating.toFixed(1)}{" "}
                  ({reviewCount} reviews)
                </span>
              </div>
            )}

            {/* PRICE */}

            <div className="mb-6">
              <span className="text-2xl md:text-3xl font-bold tracking-tight text-black">
                {formatPrice(
                  product.price
                )}
              </span>
            </div>

            {/* AVAILABILITY */}

            <div className="mb-6">
              {inStock ? (
                <p className="text-xs font-bold text-green-700 uppercase tracking-wider">
                  ● In Stock

                  {remainingStock <= 5 &&
                    remainingStock > 0 &&
                    ` — Only ${remainingStock} left`}
                </p>
              ) : (
                <p className="text-xs font-bold text-red-600 uppercase tracking-wider">
                  ● Currently Out of Stock
                </p>
              )}

              {inStock &&
                remainingStock === 0 && (
                  <p className="text-xs text-orange-600 font-medium mt-2">
                    Your bag already contains the available quantity.
                  </p>
                )}
            </div>

            {/* SIZE SELECTOR */}

            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  Select Size (UK)
                </h2>

                <button
                  ref={sizeGuideTriggerRef}
                  type="button"
                  onClick={() =>
                    setShowSizeGuide(
                      true
                    )
                  }
                  className="text-xs font-bold text-orange-600 underline underline-offset-2 uppercase"
                >
                  Size Guide
                </button>
              </div>

              {hasSizes ? (
                <div className="grid grid-cols-4 gap-2 md:gap-3">
                  {sizes.map(
                    (size) => (
                      <button
                        key={size}
                        type="button"
                        disabled={
                          !inStock
                        }
                        onClick={() =>
                          setSelectedSize(
                            size
                          )
                        }
                        aria-pressed={
                          selectedSize ===
                          size
                        }
                        className={`py-3 md:py-4 border-2 rounded-xl font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                          selectedSize ===
                          size
                            ? "bg-black text-white border-black shadow-lg scale-[1.02]"
                            : "bg-white border-gray-200 hover:border-black text-black"
                        }`}
                      >
                        {size}
                      </button>
                    )
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  Sizes are currently unavailable.
                </p>
              )}

              {!selectedSize &&
                hasSizes &&
                inStock && (
                  <p className="text-xs text-gray-500 mt-2 font-medium">
                    Choose your preferred size.
                  </p>
                )}
            </div>

            {/* COLORS */}

            {colors.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                  Available Colors
                </h2>

                <div className="flex flex-wrap gap-2">
                  {colors.map(
                    (color) => (
                      <span
                        key={color}
                        className="px-4 py-2 rounded-full border border-gray-200 text-xs font-bold text-gray-700 bg-gray-50"
                      >
                        {color}
                      </span>
                    )
                  )}
                </div>
              </div>
            )}

            {/* ADD TO BAG */}

            <div className="space-y-3 mb-6">
              <button
                type="button"
                onClick={
                  handleAddToBag
                }
                disabled={
                  !canAddToCart
                }
                className={`w-full py-4 md:py-[18px] rounded-2xl font-black text-base uppercase tracking-wider transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2 ${
                  canAddToCart
                    ? "bg-orange-600 text-white hover:bg-orange-700 shadow-orange-200"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed shadow-none"
                }`}
              >
                {!inStock
                  ? "Out of Stock"
                  : remainingStock === 0
                  ? "Stock Limit Reached"
                  : !hasSizes
                  ? "Unavailable"
                  : !selectedSize
                  ? "Select Size"
                  : "Add to Bag"}
              </button>

              <Link
                href={`/compare?ids=${product._id}`}
                className="block text-center text-xs font-black uppercase italic tracking-wider text-black bg-gray-100 hover:bg-black hover:text-white py-3 rounded-xl transition"
              >
                Compare With Other Sneakers →
              </Link>

              <Link
                href="/cart"
                className="block text-center text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-orange-600 py-2"
              >
                View Shopping Bag
              </Link>
            </div>

            {/* DESCRIPTION */}

            <div className="border-t border-gray-100 pt-6 space-y-4">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                  Description
                </h2>

                <p className="text-sm text-gray-600 leading-relaxed font-medium whitespace-pre-line">
                  {product.description ||
                    "Product details will be available soon."}
                </p>
              </div>

              {/* FEATURES */}

              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1.5 bg-gray-50 text-xs font-medium text-gray-600 rounded-full">
                  100% Authentic
                </span>

                {qualifiesForFreeShipping && (
                  <span className="px-3 py-1.5 bg-gray-50 text-xs font-medium text-gray-600 rounded-full">
                    Free Shipping Eligible
                  </span>
                )}

                <span className="px-3 py-1.5 bg-gray-50 text-xs font-medium text-gray-600 rounded-full">
                  Easy Returns
                </span>
              </div>
            </div>

            {/* SHIPPING NOTE */}

            <p className="text-center mt-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Free delivery on orders above{" "}
              {formatPrice(
                FREE_SHIPPING_THRESHOLD
              )}
            </p>
          </div>
        </div>
      </section>

      {/* SIZE GUIDE MODAL */}

      {showSizeGuide && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setShowSizeGuide(
                false
              );
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="size-guide-title"
            className="bg-white rounded-3xl w-full max-w-md p-6 sm:p-8 shadow-2xl"
          >
            <div className="flex justify-between items-center gap-4 mb-6">
              <h2
                id="size-guide-title"
                className="text-2xl font-black uppercase italic tracking-tighter"
              >
                Size Guide
              </h2>

              <button
                ref={
                  closeModalButtonRef
                }
                type="button"
                onClick={() =>
                  setShowSizeGuide(
                    false
                  )
                }
                aria-label="Close size guide"
                className="text-gray-500 hover:text-black text-2xl"
              >
                ×
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-5">
              Available sizes for this product are shown below.
              Fit may vary by brand and model.
            </p>

            <div className="grid grid-cols-4 gap-2">
              {sizes.map(
                (size) => (
                  <button
                    key={size}
                    type="button"
                    disabled={
                      !inStock
                    }
                    onClick={() => {
                      if (inStock) {
                        setSelectedSize(
                          size
                        );
                        setShowSizeGuide(
                          false
                        );
                      }
                    }}
                    className={`border-2 rounded-xl py-3 text-sm font-bold disabled:opacity-40 ${
                      selectedSize ===
                      size
                        ? "bg-black text-white border-black"
                        : "border-gray-200 hover:border-orange-600"
                    }`}
                  >
                    UK {size}
                  </button>
                )
              )}
            </div>

            <p className="mt-6 text-xs text-gray-400">
              For accurate measurements,
              refer to the manufacturer&apos;s
              official size chart.
            </p>

            <button
              type="button"
              onClick={() =>
                setShowSizeGuide(
                  false
                )
              }
              className="mt-6 w-full bg-black text-white py-3 rounded-xl font-black text-xs uppercase hover:bg-orange-600 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* TOAST */}

      <Toast
        message={
          toast.message
        }
        type={
          toast.type
        }
        isVisible={
          toast.show
        }
        onClose={() =>
          setToast(
            (previous) => ({
              ...previous,
              show: false,
            })
          )
        }
      />
    </div>
  );
}

/* =========================================
   SERVER-SIDE PRODUCT FETCHING
========================================= */

export const getServerSideProps:
  GetServerSideProps<
    ProductDetailsProps
  > = async ({
    params,
  }) => {
    const id =
      params?.id;

    if (
      typeof id !== "string" ||
      !mongoose.isValidObjectId(
        id
      )
    ) {
      return {
        notFound: true,
      };
    }

    try {
      await dbConnect();

      const productData =
        await Product.findOne({
          _id: id,
          isActive: {
            $ne: false,
          },
        })
          .lean();

      if (!productData) {
        return {
          notFound: true,
        };
      }

      const product =
        JSON.parse(
          JSON.stringify(
            productData
          )
        ) as ProductData;

      return {
        props: {
          product,
        },
      };
    } catch (error: unknown) {
      console.error(
        "PRODUCT_DETAILS_SSR_ERROR:",
        error instanceof Error
          ? error.name
          : "UnknownError"
      );

      return {
        props: {
          product: null,
          serverError:
            "Product details are temporarily unavailable. Please try again later.",
        },
      };
    }
  };
