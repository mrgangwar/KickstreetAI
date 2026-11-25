
import {
  useState,
  type ReactNode,
} from "react";

import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
} from "next";

import Head from "next/head";
import Link from "next/link";
import Image from "next/image";

import mongoose from "mongoose";

import Navbar from "@/components/Navbar";
import { useCart } from "@/context/CartContext";
import dbConnect from "@/lib/db";
import Product from "@/models/Product";

import toast from "react-hot-toast";

/* =========================================
   TYPES
========================================= */

interface ProductData {
  _id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  brand: string;
  sizes: string[];
  colors: string[];
  stock: number;
  images: string[];
  ratings: number;
  numOfReviews: number;
}

interface PageProps {
  product: ProductData;
}

/* =========================================
   CONSTANTS
========================================= */

const FALLBACK_IMAGE =
  "/placeholder.png";

const MAX_QUANTITY = 20;

const INR_FORMATTER =
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });

/* =========================================
   IMAGE HELPER
========================================= */

function getImage(
  value: string | undefined
): string {
  if (!value) {
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
      url.protocol === "https:" ||
      url.protocol === "http:"
    ) {
      return image;
    }
  } catch {
    // Use fallback.
  }

  return FALLBACK_IMAGE;
}

/* =========================================
   PRODUCT IMAGE COMPONENT
========================================= */

function ProductImage({
  src,
  alt,
  priority = false,
}: {
  src: string;
  alt: string;
  priority?: boolean;
}) {
  const [failed, setFailed] =
    useState(false);

  return (
    <Image
      src={
        failed
          ? FALLBACK_IMAGE
          : src
      }
      alt={alt}
      fill
      priority={priority}
      sizes="(max-width: 1023px) 100vw, 50vw"
      className="object-contain p-6 sm:p-10"
      onError={() =>
        setFailed(true)
      }
    />
  );
}

/* =========================================
   DETAIL ROW
========================================= */

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-4">
      <span className="text-xs font-black uppercase tracking-widest text-gray-500">
        {label}
      </span>

      <span className="text-sm font-bold text-right">
        {children}
      </span>
    </div>
  );
}

/* =========================================
   PRODUCT DETAIL PAGE
========================================= */

export default function ProductDetail({
  product,
}: InferGetServerSidePropsType<
  typeof getServerSideProps
>) {
  const { addToCart } = useCart();

  const [selectedSize, setSelectedSize] =
    useState("");

  const [quantity, setQuantity] =
    useState(1);

  const [activeImage, setActiveImage] =
    useState(0);

  const images =
    product.images.length > 0
      ? product.images.map(getImage)
      : [FALLBACK_IMAGE];

  const availableStock =
    Math.max(
      0,
      Math.floor(product.stock)
    );

  const isOutOfStock =
    availableStock === 0;

  const maxQuantity =
    Math.min(
      MAX_QUANTITY,
      availableStock
    );

  const validSizes =
    product.sizes.filter(
      (size) =>
        typeof size === "string" &&
        size.trim().length > 0
    );

  /* =====================================
     ADD TO CART
  ===================================== */

  const handleAddToCart = () => {
    if (isOutOfStock) {
      toast.error(
        "This product is out of stock."
      );
      return;
    }

    if (!selectedSize) {
      toast.error(
        "Please select a shoe size."
      );
      return;
    }

    if (
      !validSizes.includes(
        selectedSize
      )
    ) {
      toast.error(
        "Invalid shoe size."
      );
      return;
    }

    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > maxQuantity
    ) {
      toast.error(
        "Invalid quantity."
      );
      return;
    }

    addToCart({
      _id: product._id,
      name: product.name,
      price: product.price,
      image: images[0],
      size: selectedSize,
      quantity,
    });

    toast.success(
      "Product added to cart!"
    );
  };

  /* =====================================
     RENDER
  ===================================== */

  return (
    <>
      <Head>
        <title>
          {product.name} | KICKSTREET
        </title>

        <meta
          name="description"
          content={
            product.description
              .slice(0, 155)
          }
        />
      </Head>

      <Navbar />

      <main className="min-h-screen bg-[#fcfcfc] px-4 sm:px-6 py-8 sm:py-12">
        <div className="mx-auto max-w-7xl">

          {/* BREADCRUMB */}

          <nav
            aria-label="Breadcrumb"
            className="mb-8"
          >
            <ol className="flex flex-wrap items-center gap-2 text-xs font-bold text-gray-500">
              <li>
                <Link
                  href="/"
                  className="hover:text-orange-600"
                >
                  Home
                </Link>
              </li>

              <li aria-hidden="true">
                /
              </li>

              <li>
                <Link
                  href="/shop"
                  className="hover:text-orange-600"
                >
                  Shop
                </Link>
              </li>

              <li aria-hidden="true">
                /
              </li>

              <li
                className="text-black"
                aria-current="page"
              >
                {product.name}
              </li>
            </ol>
          </nav>

          {/* PRODUCT GRID */}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16">

            {/* IMAGE GALLERY */}

            <section
              aria-label="Product images"
              className="min-w-0"
            >
              <div className="relative aspect-square overflow-hidden rounded-[2rem] bg-gray-100">
                <ProductImage
                  key={
                    images[activeImage]
                  }
                  src={
                    images[activeImage]
                  }
                  alt={`${product.name} image ${
                    activeImage + 1
                  }`}
                  priority
                />

                {isOutOfStock && (
                  <span className="absolute left-5 top-5 rounded-full bg-black px-5 py-3 text-xs font-black uppercase text-white">
                    Sold Out
                  </span>
                )}
              </div>

              {/* THUMBNAILS */}

              {images.length > 1 && (
                <div className="mt-4 grid grid-cols-4 sm:grid-cols-5 gap-3">
                  {images.map(
                    (image, index) => (
                      <button
                        key={`${image}-${index}`}
                        type="button"
                        onClick={() =>
                          setActiveImage(
                            index
                          )
                        }
                        aria-label={`View product image ${
                          index + 1
                        }`}
                        aria-pressed={
                          activeImage ===
                          index
                        }
                        className={`relative aspect-square overflow-hidden rounded-xl border-2 bg-gray-100 ${
                          activeImage ===
                          index
                            ? "border-orange-600"
                            : "border-transparent hover:border-gray-300"
                        }`}
                      >
                        <ProductImage
                          src={image}
                          alt=""
                        />
                      </button>
                    )
                  )}
                </div>
              )}
            </section>

            {/* PRODUCT INFORMATION */}

            <section
              aria-labelledby="product-title"
              className="min-w-0"
            >
              <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-orange-600">
                {product.brand}
              </p>

              <h1
                id="product-title"
                className="text-4xl sm:text-5xl lg:text-6xl font-black italic uppercase tracking-tighter leading-none break-words"
              >
                {product.name}
              </h1>

              <p className="mt-4 text-xs font-black uppercase tracking-widest text-gray-500">
                {product.category}
              </p>

              {/* RATING */}

              {product.numOfReviews > 0 &&
                product.ratings >= 0 &&
                product.ratings <= 5 && (
                  <p className="mt-5 text-sm font-bold">
                    <span className="text-orange-600">
                      ★
                    </span>{" "}
                    {product.ratings.toFixed(
                      1
                    )}{" "}
                    <span className="text-gray-500">
                      ({product.numOfReviews} reviews)
                    </span>
                  </p>
                )}

              {/* PRICE */}

              <p className="mt-8 text-3xl sm:text-4xl font-black italic text-black">
                {INR_FORMATTER.format(
                  product.price
                )}
              </p>

              {/* DESCRIPTION */}

              <p className="mt-6 whitespace-pre-line text-sm sm:text-base leading-relaxed text-gray-600">
                {product.description}
              </p>

              {/* SIZE SELECTION */}

              <div className="mt-10">
                <h2 className="mb-4 text-xs font-black uppercase tracking-widest">
                  Select Shoe Size
                </h2>

                {validSizes.length === 0 ? (
                  <p className="text-sm text-red-600">
                    No sizes available.
                  </p>
                ) : (
                  <div
                    role="group"
                    aria-label="Available shoe sizes"
                    className="flex flex-wrap gap-3"
                  >
                    {validSizes.map(
                      (size) => (
                        <button
                          key={size}
                          type="button"
                          disabled={
                            isOutOfStock
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
                          className={`min-w-14 rounded-xl border-2 px-4 py-3 text-sm font-black transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            selectedSize ===
                            size
                              ? "border-orange-600 bg-orange-600 text-white"
                              : "border-gray-200 bg-white text-black hover:border-orange-600"
                          }`}
                        >
                          {size}
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>

              {/* QUANTITY */}

              <div className="mt-8">
                <h2 className="mb-4 text-xs font-black uppercase tracking-widest">
                  Quantity
                </h2>

                <div className="inline-flex items-center rounded-xl border border-gray-200 bg-white">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    disabled={
                      quantity <= 1 ||
                      isOutOfStock
                    }
                    onClick={() =>
                      setQuantity(
                        (previous) =>
                          Math.max(
                            1,
                            previous - 1
                          )
                      )
                    }
                    className="px-5 py-3 font-black disabled:opacity-40"
                  >
                    −
                  </button>

                  <output className="min-w-10 text-center text-sm font-black">
                    {quantity}
                  </output>

                  <button
                    type="button"
                    aria-label="Increase quantity"
                    disabled={
                      quantity >=
                        maxQuantity ||
                      isOutOfStock
                    }
                    onClick={() =>
                      setQuantity(
                        (previous) =>
                          Math.min(
                            maxQuantity,
                            previous + 1
                          )
                      )
                    }
                    className="px-5 py-3 font-black disabled:opacity-40"
                  >
                    +
                  </button>
                </div>

                <p className="mt-3 text-xs text-gray-500">
                  {isOutOfStock
                    ? "Currently unavailable"
                    : `${availableStock} units in stock`}
                </p>
              </div>

              {/* ADD TO CART */}

              <button
                type="button"
                onClick={
                  handleAddToCart
                }
                disabled={
                  isOutOfStock ||
                  validSizes.length === 0
                }
                className="mt-10 w-full rounded-2xl bg-orange-600 px-8 py-5 text-sm font-black uppercase tracking-widest text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {isOutOfStock
                  ? "Sold Out"
                  : "Add to Cart"}
              </button>

              <Link
                href="/cart"
                className="mt-4 block w-full rounded-2xl border-2 border-black px-8 py-4 text-center text-sm font-black uppercase tracking-widest text-black hover:bg-black hover:text-white transition-colors"
              >
                View Cart
              </Link>

              {/* DETAILS */}

              <div className="mt-10 border-t border-gray-200">
                <DetailRow label="Brand">
                  {product.brand}
                </DetailRow>

                <DetailRow label="Category">
                  {product.category}
                </DetailRow>

                <DetailRow label="Availability">
                  {isOutOfStock
                    ? "Out of Stock"
                    : "In Stock"}
                </DetailRow>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

/* =========================================
   SERVER-SIDE PRODUCT FETCH
========================================= */

export const getServerSideProps:
  GetServerSideProps<PageProps> =
  async (context) => {
    const id = context.params?.id;

    if (
      typeof id !== "string" ||
      !/^[a-fA-F0-9]{24}$/.test(id) ||
      !mongoose.isValidObjectId(id)
    ) {
      return {
        notFound: true,
      };
    }

    try {
      await dbConnect();

      const document =
        await Product.findOne({
          _id: id,
          isActive: true,
        }).lean();

      if (!document) {
        return {
          notFound: true,
        };
      }

      const product: ProductData = {
        _id: String(
          document._id
        ),

        name: String(
          document.name ?? ""
        ),

        description: String(
          document.description ?? ""
        ),

        price: Number(
          document.price ?? 0
        ),

        category: String(
          document.category ?? ""
        ),

        brand: String(
          document.brand ?? ""
        ),

        sizes: Array.isArray(
          document.sizes
        )
          ? document.sizes.map(
              String
            )
          : [],

        colors: Array.isArray(
          document.colors
        )
          ? document.colors.map(
              String
            )
          : [],

        stock: Number(
          document.stock ?? 0
        ),

        images: Array.isArray(
          document.images
        )
          ? document.images.map(
              String
            )
          : [],

        ratings: Number(
          document.ratings ?? 0
        ),

        numOfReviews: Number(
          document.numOfReviews ?? 0
        ),
      };

      return {
        props: {
          product,
        },
      };
    } catch (error) {
      console.error(
        "PRODUCT_DETAIL_FETCH_ERROR:",
        error instanceof Error
          ? error.name
          : "UnknownError"
      );

      return {
        notFound: true,
      };
    }
  };
