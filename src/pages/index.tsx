
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
} from "next";

import Head from "next/head";
import Link from "next/link";
import Image from "next/image";

import Navbar from "@/components/Navbar";
import ProductCard from "@/components/ProductCard";

import dbConnect from "@/lib/db";
import Product from "@/models/Product";
import Slider from "@/models/Slider";

/* =========================================
   TYPES
========================================= */

type ProductCategory =
  | "Men"
  | "Women"
  | "Children";

type CategoryFilter =
  | "all"
  | ProductCategory;

interface HomeProduct {
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
}

interface SliderData {
  _id: string;
  image: string;
  productId: string | null;
  title: string;
  subtitle: string;
  order: number;
  isActive: boolean;
}

interface HomePageProps {
  products: HomeProduct[];
  sliders: SliderData[];
}

interface NewsletterResponse {
  success?: boolean;
  message?: string;
}

/* =========================================
   CONSTANTS
========================================= */

const PRODUCT_LIMIT = 8;
const SLIDER_LIMIT = 3;

const SLIDE_INTERVAL_MS = 5000;
const SLIDE_PAUSE_MS = 10000;

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CATEGORIES: {
  label: string;
  value: CategoryFilter;
}[] = [
  {
    label: "All",
    value: "all",
  },
  {
    label: "Men",
    value: "Men",
  },
  {
    label: "Women",
    value: "Women",
  },
  {
    label: "Children",
    value: "Children",
  },
];

/* =========================================
   HELPERS
========================================= */

function normalizeEmail(
  value: string
): string {
  return value.trim().toLowerCase();
}

function isValidEmail(
  value: string
): boolean {
  return (
    value.length > 0 &&
    value.length <= 254 &&
    EMAIL_REGEX.test(value)
  );
}

/* =========================================
   SAFE API RESPONSE
========================================= */

async function readApiResponse(
  response: Response
): Promise<NewsletterResponse> {
  try {
    const data: unknown =
      await response.json();

    if (
      typeof data !== "object" ||
      data === null ||
      Array.isArray(data)
    ) {
      return {};
    }

    const result =
      data as Record<string, unknown>;

    return {
      success:
        typeof result.success ===
        "boolean"
          ? result.success
          : undefined,

      message:
        typeof result.message ===
        "string"
          ? result.message
          : undefined,
    };
  } catch {
    return {};
  }
}

/* =========================================
   IMAGE HELPER
========================================= */

function getSafeImage(
  value: string | null | undefined
): string {
  if (
    typeof value !== "string"
  ) {
    return "/placeholder-hero.jpg";
  }

  const image = value.trim();

  if (
    image.startsWith("/") &&
    !image.startsWith("//")
  ) {
    return image;
  }

  try {
    const url =
      new URL(image);

    if (
      url.protocol === "https:" ||
      url.protocol === "http:"
    ) {
      return image;
    }
  } catch {
    // Invalid image URL.
  }

  return "/placeholder-hero.jpg";
}

/* =========================================
   HOMEPAGE
========================================= */

export default function Home({
  products,
  sliders,
}: InferGetServerSidePropsType<
  typeof getServerSideProps
>) {
  /* =====================================
     SLIDER STATE
  ===================================== */

  const [
    currentSlide,
    setCurrentSlide,
  ] = useState(0);

  const [
    isAutoSliding,
    setIsAutoSliding,
  ] = useState(true);

  const resumeTimerRef =
    useRef<ReturnType<
      typeof setTimeout
    > | null>(null);

  /* =====================================
     PRODUCT FILTER STATE
  ===================================== */

  const [search, setSearch] =
    useState("");

  const [filter, setFilter] =
    useState<CategoryFilter>(
      "all"
    );

  /* =====================================
     NEWSLETTER STATE
  ===================================== */

  const [
    newsletterEmail,
    setNewsletterEmail,
  ] = useState("");

  const [
    newsletterStatus,
    setNewsletterStatus,
  ] = useState<
    "idle" |
    "loading" |
    "success" |
    "error"
  >("idle");

  const [
    newsletterMessage,
    setNewsletterMessage,
  ] = useState("");

  const newsletterSubmittingRef =
    useRef(false);

  /* =====================================
     FILTERED PRODUCTS
  ===================================== */

  const filteredProducts =
    useMemo(() => {
      const query =
        search.trim().toLowerCase();

      return products.filter(
        (product) => {
          const matchesCategory =
            filter === "all" ||
            product.category === filter;

          if (!matchesCategory) {
            return false;
          }

          if (!query) {
            return true;
          }

          const searchableText = [
            product.name,
            product.description,
            product.category,
            product.brand,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return searchableText.includes(
            query
          );
        }
      );
    }, [
      products,
      search,
      filter,
    ]);

  /* =====================================
     AUTOPLAY SLIDER
  ===================================== */

  useEffect(() => {
    if (
      !isAutoSliding ||
      sliders.length <= 1
    ) {
      return;
    }

    const interval =
      window.setInterval(
        () => {
          if (
            document.visibilityState ===
            "hidden"
          ) {
            return;
          }

          setCurrentSlide(
            (previous) =>
              (previous + 1) %
              sliders.length
          );
        },
        SLIDE_INTERVAL_MS
      );

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [
    isAutoSliding,
    sliders.length,
  ]);

  /* =====================================
     CLEAN UP SLIDER TIMER
  ===================================== */

  useEffect(() => {
    return () => {
      if (
        resumeTimerRef.current
      ) {
        clearTimeout(
          resumeTimerRef.current
        );
      }
    };
  }, []);

  /* =====================================
     MANUAL SLIDE CHANGE
  ===================================== */

  const goToSlide = (
    index: number
  ) => {
    if (
      index < 0 ||
      index >= sliders.length
    ) {
      return;
    }

    setCurrentSlide(index);
    setIsAutoSliding(false);

    if (
      resumeTimerRef.current
    ) {
      clearTimeout(
        resumeTimerRef.current
      );
    }

    resumeTimerRef.current =
      setTimeout(() => {
        setIsAutoSliding(true);

        resumeTimerRef.current =
          null;
      }, SLIDE_PAUSE_MS);
  };

  /* =====================================
     NEWSLETTER SUBMIT
  ===================================== */

  const handleNewsletterSubmit =
    async (
      event: FormEvent<HTMLFormElement>
    ) => {
      event.preventDefault();

      if (
        newsletterSubmittingRef.current ||
        newsletterStatus === "loading" ||
        newsletterStatus === "success"
      ) {
        return;
      }

      const email =
        normalizeEmail(
          newsletterEmail
        );

      if (!isValidEmail(email)) {
        setNewsletterStatus(
          "error"
        );

        setNewsletterMessage(
          "Please enter a valid email address."
        );

        return;
      }

      newsletterSubmittingRef.current =
        true;

      setNewsletterStatus(
        "loading"
      );

      setNewsletterMessage("");

      try {
        const response =
          await fetch(
            "/api/newsletter/subscribe",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",

                Accept:
                  "application/json",
              },

              credentials:
                "same-origin",

              body:
                JSON.stringify({
                  email,
                }),
            }
          );

        const data =
          await readApiResponse(
            response
          );

        if (
          !response.ok ||
          data.success !== true
        ) {
          throw new Error(
            data.message ||
            "Subscription failed. Please try again."
          );
        }

        setNewsletterStatus(
          "success"
        );

        setNewsletterMessage(
          data.message ||
          "Subscription request successful."
        );

        setNewsletterEmail("");
      } catch (
        error: unknown
      ) {
        setNewsletterStatus(
          "error"
        );

        setNewsletterMessage(
          error instanceof Error
            ? error.message
            : "Something went wrong. Try again."
        );
      } finally {
        newsletterSubmittingRef.current =
          false;
      }
    };

  /* =====================================
     RENDER
  ===================================== */

  return (
    <div className="min-h-screen bg-[#fcfcfc] selection:bg-orange-600 selection:text-white">

      {/* =================================
          SEO
      ================================= */}

      <Head>
        <title>
          KICKSTREET | Authentic Sneakers & Streetwear
        </title>

        <meta
          name="description"
          content="Explore sneakers and streetwear at KickStreet. Discover the latest shoe collections for men, women and children."
        />
      </Head>

      <Navbar />

      {/* =================================
          HERO SLIDER
      ================================= */}

      <section
        id="hero"
        aria-label="Featured sneaker collections"
        className="relative bg-black text-white h-[75vh] min-h-[450px] sm:h-[85vh] lg:h-[90vh] flex items-center justify-center overflow-hidden"
      >
        {sliders.length > 0 ? (
          sliders.map(
            (slider, index) => {
              const isCurrent =
                index === currentSlide;

              return (
                <div
                  key={slider._id}
                  aria-hidden={
                    !isCurrent
                  }
                  className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                    isCurrent
                      ? "opacity-100 z-10"
                      : "opacity-0 z-0 pointer-events-none"
                  }`}
                >
                  {/* BACKGROUND */}

                  <div className="absolute inset-0">
                    <Image
                      src={getSafeImage(
                        slider.image
                      )}
                      alt=""
                      fill
                      sizes="100vw"
                      className="object-cover"
                      priority={
                        index === 0
                      }
                    />

                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                  </div>

                  {/* HERO CONTENT */}

                  <div className="relative z-10 flex flex-col items-center justify-center h-full text-center px-4 sm:px-6">

                    <span className="text-orange-400 font-black text-[10px] uppercase tracking-[0.3em] mb-4">
                      {slider.subtitle ||
                        "Limited Drop"}
                    </span>

                    <h1 className="text-[12vw] sm:text-7xl lg:text-[8rem] font-black italic tracking-tighter mb-8 uppercase leading-[0.9] max-w-[95vw] break-words">
                      {slider.title ||
                        "HEAT FOR YOUR FEET"}
                    </h1>

                    {slider.productId ? (
                      <Link
                        href={`/product/${slider.productId}`}
                        tabIndex={
                          isCurrent
                            ? 0
                            : -1
                        }
                        className="group flex items-center gap-3 bg-white text-black px-8 py-4 rounded-full font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 hover:text-white transition-all active:scale-95"
                      >
                        SHOP THIS DROP

                        <span
                          aria-hidden="true"
                          className="group-hover:translate-x-1 transition-transform"
                        >
                          →
                        </span>
                      </Link>
                    ) : (
                      <Link
                        href="/shop"
                        tabIndex={
                          isCurrent
                            ? 0
                            : -1
                        }
                        className="rounded-full bg-white px-8 py-4 text-[10px] font-black uppercase tracking-widest text-black hover:bg-orange-600 hover:text-white transition-colors"
                      >
                        EXPLORE SHOES
                      </Link>
                    )}
                  </div>
                </div>
              );
            }
          )
        ) : (
          /* FALLBACK HERO */

          <div className="text-center px-6">
            <h1 className="text-[15vw] sm:text-8xl font-black italic tracking-tighter uppercase leading-none">
              KICK
              <br />
              STREET.
            </h1>

            <Link
              href="/shop"
              className="inline-block mt-8 rounded-full bg-orange-600 px-8 py-4 text-xs font-black uppercase tracking-widest text-white hover:bg-white hover:text-black transition-colors"
            >
              SHOP NOW
            </Link>
          </div>
        )}

        {/* SLIDER DOTS */}

        {sliders.length > 1 && (
          <div
            className="absolute bottom-8 sm:bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-3 z-20"
            role="group"
            aria-label="Choose featured slide"
          >
            {sliders.map(
              (_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() =>
                    goToSlide(index)
                  }
                  aria-label={`Go to slide ${
                    index + 1
                  }`}
                  aria-pressed={
                    index === currentSlide
                  }
                  className={`h-2 rounded-full transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-500 ${
                    index === currentSlide
                      ? "bg-orange-600 w-12"
                      : "bg-white/50 hover:bg-white w-6"
                  }`}
                />
              )
            )}
          </div>
        )}
      </section>

      {/* =================================
          SOLEMATCH AI DISCOVERY BANNER
      ================================= */}

      <section className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 pt-8 pb-4">
        <div className="bg-black text-white rounded-3xl p-6 sm:p-10 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl relative overflow-hidden">
          <div className="relative z-10 max-w-xl">
            <span className="inline-block px-3 py-1 rounded-full bg-orange-600 text-white text-[10px] font-black uppercase tracking-widest mb-3">
              SoleMatch AI Feature
            </span>
            <h2 className="text-2xl sm:text-4xl font-black italic uppercase tracking-tighter text-white">
              Not sure which pair suits you?
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-gray-300 font-medium">
              Use our hybrid content-based recommendation engine. Tell us your budget, preferred brands, and comfort priorities to get personalized shoe matches with Gemini AI grounding.
            </p>
          </div>
          <div className="relative z-10 flex flex-wrap gap-3 shrink-0">
            <Link
              href="/recommendations"
              className="px-6 py-3.5 rounded-2xl bg-orange-600 text-white font-black text-xs uppercase italic tracking-wider hover:bg-orange-500 transition shadow-lg"
            >
              Start AI Matchmaker →
            </Link>
            <Link
              href="/compare"
              className="px-5 py-3.5 rounded-2xl border border-gray-700 bg-gray-900/80 text-white font-bold text-xs uppercase tracking-wider hover:border-white transition"
            >
              Compare Shoes
            </Link>
          </div>
          <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-orange-600/10 rounded-full blur-3xl pointer-events-none" />
        </div>
      </section>

      {/* =================================
          PRODUCTS SECTION
      ================================= */}

      <main
        id="products"
        className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-10 md:py-16"
      >
        {/* SEARCH */}

        <div className="mb-8">
          <div className="relative max-w-md">

            <label
              htmlFor="home-product-search"
              className="sr-only"
            >
              Search featured shoes
            </label>

            <input
              id="home-product-search"
              type="search"
              placeholder="Search featured shoes..."
              value={search}
              onChange={(
                event
              ) =>
                setSearch(
                  event.target.value
                )
              }
              maxLength={100}
              className="w-full px-4 py-3 sm:py-4 pl-11 sm:pl-12 bg-gray-100 rounded-xl sm:rounded-full font-medium border-2 border-transparent outline-none focus:border-orange-500 focus:bg-white text-base sm:text-sm transition-all"
            />

            <svg
              aria-hidden="true"
              className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
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
                onClick={() =>
                  setSearch("")
                }
                aria-label="Clear search"
                className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black p-1"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* CATEGORY FILTER */}

        <div
          className="flex flex-wrap gap-2 sm:gap-3 mb-8"
          role="group"
          aria-label="Filter shoes by category"
        >
          {CATEGORIES.map(
            (category) => (
              <button
                key={category.value}
                type="button"
                onClick={() =>
                  setFilter(
                    category.value
                  )
                }
                aria-pressed={
                  filter ===
                  category.value
                }
                className={`px-5 py-3 sm:py-2 rounded-xl sm:rounded-full text-sm sm:text-xs font-black uppercase tracking-wider transition-all ${
                  filter ===
                  category.value
                    ? "bg-orange-600 text-white shadow-lg"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {category.label}
              </button>
            )
          )}
        </div>

        {/* SECTION HEADER */}

        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 md:mb-12 gap-6">
          <div className="space-y-2">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black italic uppercase tracking-tighter leading-none">
              Step Into the{" "}
              <span className="text-orange-600">
                Future
              </span>
            </h2>

            <p className="text-gray-500 font-bold text-[10px] uppercase tracking-[0.15em] mt-3 leading-relaxed">
              Discover sneaker drops,
              premium street-style collections
              and fresh kicks at KickStreet.
            </p>
          </div>

          <p
            role="status"
            className="text-black font-black uppercase text-[10px] tracking-widest"
          >
            {filteredProducts.length}{" "}
            Featured Products
          </p>
        </div>

        {/* PRODUCT GRID */}

        {filteredProducts.length === 0 ? (
          <div className="text-center py-20 bg-gray-50 rounded-[2rem] border-2 border-dashed border-gray-200">
            <p className="text-gray-500 text-xl italic font-black uppercase tracking-tighter">
              No Products Found
            </p>

            <p className="text-gray-500 text-xs mt-2">
              Try a different search or category.
            </p>

            <button
              type="button"
              onClick={() => {
                setSearch("");
                setFilter("all");
              }}
              className="mt-6 rounded-full bg-black px-6 py-3 text-xs font-black uppercase text-white hover:bg-orange-600 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-4 gap-x-4 sm:gap-x-8 gap-y-12 sm:gap-y-16">
            {filteredProducts.map(
              (product) => (
                <ProductCard
                  key={product._id}
                  product={product}
                />
              )
            )}
          </div>
        )}

        {/* VIEW ALL PRODUCTS */}

        <div className="mt-12 text-center">
          <Link
            href="/shop"
            className="inline-block rounded-full bg-black px-8 py-4 text-xs font-black uppercase tracking-widest text-white hover:bg-orange-600 transition-colors"
          >
            View All Shoes
          </Link>
        </div>
      </main>

      {/* =========================================
          NEWSLETTER SECTION
      ========================================= */}

      <section
        aria-labelledby="newsletter-heading"
        className="px-4 sm:px-6 mb-12"
      >
        <div className="max-w-[1400px] mx-auto bg-black text-white py-16 sm:py-24 px-6 rounded-[2.5rem] text-center relative overflow-hidden">

          {/* BACKGROUND TEXT */}

          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-10 pointer-events-none select-none text-[20vw] font-black italic whitespace-nowrap"
          >
            NEWSLETTER NEWSLETTER
          </div>

          <div className="relative z-10 max-w-2xl mx-auto">

            <h2
              id="newsletter-heading"
              className="text-4xl sm:text-6xl font-black italic uppercase tracking-tighter mb-4"
            >
              Join the Crew
            </h2>

            <p className="text-gray-400 font-bold text-[10px] uppercase tracking-widest mb-10">
              Get updates about new sneaker drops.
            </p>

            {/* NEWSLETTER FORM */}

            <form
              onSubmit={
                handleNewsletterSubmit
              }
              className="flex flex-col sm:flex-row gap-3"
              noValidate
            >
              <label
                htmlFor="newsletter-email"
                className="sr-only"
              >
                Newsletter email address
              </label>

              <input
                id="newsletter-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="YOUR@EMAIL.COM"
                value={
                  newsletterEmail
                }
                onChange={(
                  event
                ) => {
                  setNewsletterEmail(
                    event.target.value
                  );

                  if (
                    newsletterStatus ===
                    "error"
                  ) {
                    setNewsletterStatus(
                      "idle"
                    );

                    setNewsletterMessage(
                      ""
                    );
                  }
                }}
                maxLength={254}
                disabled={
                  newsletterStatus ===
                    "loading" ||
                  newsletterStatus ===
                    "success"
                }
                className="flex-1 min-w-0 p-5 bg-white/10 rounded-2xl outline-none font-black text-xs focus:bg-white focus:text-black transition-all border border-white/10 disabled:opacity-50"
                required
              />

              <button
                type="submit"
                disabled={
                  newsletterStatus ===
                    "loading" ||
                  newsletterStatus ===
                    "success"
                }
                className="bg-orange-600 text-white px-10 py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-white hover:text-black transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {newsletterStatus ===
                "loading"
                  ? "Joining..."
                  : newsletterStatus ===
                    "success"
                  ? "Joined!"
                  : "Subscribe"}
              </button>
            </form>

            {/* NEWSLETTER MESSAGE */}

            {newsletterMessage && (
              <p
                role={
                  newsletterStatus ===
                  "error"
                    ? "alert"
                    : "status"
                }
                className={`mt-4 text-xs font-black uppercase tracking-wider ${
                  newsletterStatus ===
                  "success"
                    ? "text-green-400"
                    : "text-red-400"
                }`}
              >
                {newsletterMessage}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/* =========================================
   SERVER-SIDE DATA FETCHING
========================================= */

export const getServerSideProps:
  GetServerSideProps<HomePageProps> =
  async () => {
    try {
      await dbConnect();

      /* =================================
         FETCH ACTIVE PRODUCTS
      ================================= */

      const productDocuments =
        await Product.find({
          isActive: true,
        })
          .sort({
            createdAt: -1,
          })
          .limit(
            PRODUCT_LIMIT
          )
          .lean();

      const products: HomeProduct[] =
        productDocuments.map(
          (product) => ({
            _id:
              String(product._id),

            name:
              String(
                product.name ?? ""
              ),

            slug:
              String(
                product.slug ?? ""
              ),

            description:
              String(
                product.description ??
                  ""
              ),

            price:
              Number(
                product.price ?? 0
              ),

            category:
              product.category as
                ProductCategory,

            brand:
              String(
                product.brand ?? ""
              ),

            sizes:
              Array.isArray(
                product.sizes
              )
                ? product.sizes.map(
                    String
                  )
                : [],

            colors:
              Array.isArray(
                product.colors
              )
                ? product.colors.map(
                    String
                  )
                : [],

            stock:
              Number(
                product.stock ?? 0
              ),

            images:
              Array.isArray(
                product.images
              )
                ? product.images.map(
                    String
                  )
                : [],

            ratings:
              Number(
                product.ratings ?? 0
              ),

            numOfReviews:
              Number(
                product.numOfReviews ??
                  0
              ),

            isActive:
              Boolean(
                product.isActive
              ),
          })
        );

      /* =================================
         FETCH ACTIVE SLIDERS
      ================================= */

      const sliderDocuments =
        await Slider.find({
          isActive: true,
        })
          .sort({
            order: 1,
          })
          .limit(
            SLIDER_LIMIT
          )
          .lean();

      let sliders: SliderData[] =
        sliderDocuments.map(
          (slider) => ({
            _id:
              String(
                slider._id
              ),

            image:
              String(
                slider.image ?? ""
              ),

            productId:
              slider.productId
                ? String(
                    slider.productId
                  )
                : null,

            title:
              String(
                slider.title ?? ""
              ),

            subtitle:
              String(
                slider.subtitle ?? ""
              ),

            order:
              Number(
                slider.order ?? 0
              ),

            isActive:
              Boolean(
                slider.isActive
              ),
          })
        );

      /* =================================
         FALLBACK SLIDERS
      ================================= */

      if (
        sliders.length === 0 &&
        products.length > 0
      ) {
        sliders = products
          .slice(
            0,
            SLIDER_LIMIT
          )
          .map(
            (
              product,
              index
            ) => ({
              _id:
                `auto-${product._id}`,

              image:
                product.images[0] ||
                "/placeholder-hero.jpg",

              productId:
                product._id,

              title:
                product.name,

              subtitle:
                `₹${product.price.toLocaleString(
                  "en-IN"
                )}`,

              order:
                index,

              isActive:
                true,
            })
          );
      }

      return {
        props: {
          products,
          sliders,
        },
      };
    } catch (error) {
      console.error(
        "Homepage data fetching failed:",
        error instanceof Error
          ? error.name
          : "UnknownError"
      );

      return {
        props: {
          products: [],
          sliders: [],
        },
      };
    }
  };
