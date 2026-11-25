
import Head from "next/head";
import { useRouter } from "next/router";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  ChangeEvent,
  FormEvent,
} from "react";

import AdminLayout from "@/components/AdminLayout";

/* =========================================
   TYPES
========================================= */

type Category =
  | "Men"
  | "Women"
  | "Children";

interface ProductForm {
  name: string;
  brand: string;
  description: string;
  price: string;
  category: Category;
  stock: string;
  sizes: string;
  colors: string;
  isActive: boolean;
}

interface SelectedImage {
  id: string;
  file: File;
  previewUrl: string;
}

interface ApiResult {
  success?: boolean;
  message?: string;
  product?: {
    _id?: string;
  };
}

type ValidationResult =
  | {
      valid: true;
      price: number;
      stock: number;
      sizes: string[];
      colors: string[];
    }
  | {
      valid: false;
      message: string;
    };

/* =========================================
   CONSTANTS
========================================= */

const MAX_IMAGES = 5;

const MAX_IMAGE_SIZE =
  2 * 1024 * 1024;

const MAX_PRICE = 10000000;
const MAX_STOCK = 1000000;

const MAX_VARIANTS = 30;
const MAX_VARIANT_LENGTH = 50;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const INITIAL_FORM: ProductForm = {
  name: "",
  brand: "",
  description: "",
  price: "",
  category: "Men",
  stock: "",
  sizes: "",
  colors: "",
  isActive: true,
};

/* =========================================
   HELPERS
========================================= */

function parseCommaSeparated(
  value: string,
  uppercase = false
): string[] {
  const values = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) =>
      uppercase
        ? item.toUpperCase()
        : item.toLowerCase()
    );

  return [...new Set(values)];
}

function readFileAsDataURL(
  file: File
): Promise<string> {
  return new Promise(
    (resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (
          typeof reader.result ===
          "string"
        ) {
          resolve(reader.result);
        } else {
          reject(
            new Error(
              "Unable to read selected image."
            )
          );
        }
      };

      reader.onerror = () => {
        reject(
          new Error(
            "Unable to read selected image."
          )
        );
      };

      reader.readAsDataURL(file);
    }
  );
}

async function readApiResponse(
  response: Response
): Promise<ApiResult> {
  try {
    const data: unknown =
      await response.json();

    if (
      typeof data === "object" &&
      data !== null &&
      !Array.isArray(data)
    ) {
      return data as ApiResult;
    }
  } catch {
    // Return a safe fallback.
  }

  return {
    success: false,
    message:
      "Invalid server response.",
  };
}

function validateVariants(
  values: string[],
  field: string,
  required: boolean
): string | null {
  if (
    values.length > MAX_VARIANTS
  ) {
    return `Maximum ${MAX_VARIANTS} ${field} allowed.`;
  }

  if (
    required &&
    values.length === 0
  ) {
    return `At least one ${field} is required.`;
  }

  if (
    values.some(
      (value) =>
        value.length >
        MAX_VARIANT_LENGTH
    )
  ) {
    return `Each ${field} must be ${MAX_VARIANT_LENGTH} characters or fewer.`;
  }

  return null;
}

/* =========================================
   ADD PRODUCT PAGE
========================================= */

export default function AddProduct() {
  const router = useRouter();

  const [formData, setFormData] =
    useState<ProductForm>(
      INITIAL_FORM
    );

  const [images, setImages] =
    useState<SelectedImage[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [progress, setProgress] =
    useState("");

  const [error, setError] =
    useState("");

  const submittingRef =
    useRef(false);

  const imagesRef =
    useRef<SelectedImage[]>([]);

  const fileInputRef =
    useRef<HTMLInputElement>(null);

  /* =====================================
     IMAGE PREVIEW CLEANUP
  ===================================== */

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    return () => {
      imagesRef.current.forEach(
        (image) => {
          URL.revokeObjectURL(
            image.previewUrl
          );
        }
      );
    };
  }, []);

  /* =====================================
     UPDATE FIELD
  ===================================== */

  function updateField<
    K extends keyof ProductForm
  >(
    field: K,
    value: ProductForm[K]
  ) {
    setFormData(
      (previous) => ({
        ...previous,
        [field]: value,
      })
    );

    setError("");
  }

  /* =====================================
     IMAGE SELECTION
  ===================================== */

  function handleImageChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const files = Array.from(
      event.target.files || []
    );

    event.target.value = "";

    if (
      files.length === 0 ||
      submittingRef.current
    ) {
      return;
    }

    const remaining =
      MAX_IMAGES - images.length;

    if (
      remaining <= 0 ||
      files.length > remaining
    ) {
      setError(
        `Maximum ${MAX_IMAGES} images allowed. You can select ${Math.max(
          remaining,
          0
        )} more.`
      );
      return;
    }

    for (const file of files) {
      if (
        !ALLOWED_TYPES.includes(
          file.type
        )
      ) {
        setError(
          "Only JPG, PNG and WebP images are allowed."
        );
        return;
      }

      if (
        file.size === 0 ||
        file.size > MAX_IMAGE_SIZE
      ) {
        setError(
          "Each image must be 2 MB or smaller."
        );
        return;
      }
    }

    const selected:
      SelectedImage[] =
      files.map((file) => ({
        id:
          typeof crypto !==
            "undefined" &&
          "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`,

        file,

        previewUrl:
          URL.createObjectURL(
            file
          ),
      }));

    setImages(
      (previous) => [
        ...previous,
        ...selected,
      ]
    );

    setError("");
  }

  /* =====================================
     REMOVE IMAGE
  ===================================== */

  function removeImage(
    imageId: string
  ) {
    if (
      submittingRef.current
    ) {
      return;
    }

    setImages(
      (previous) => {
        const image =
          previous.find(
            (item) =>
              item.id === imageId
          );

        if (image) {
          URL.revokeObjectURL(
            image.previewUrl
          );
        }

        return previous.filter(
          (item) =>
            item.id !== imageId
        );
      }
    );
  }

  /* =====================================
     VALIDATE FORM
  ===================================== */

  function validateForm():
    ValidationResult {
    const name =
      formData.name.trim();

    const brand =
      formData.brand.trim();

    const description =
      formData.description.trim();

    if (
      name.length < 2 ||
      name.length > 150
    ) {
      return {
        valid: false,
        message:
          "Shoe name must contain 2–150 characters.",
      };
    }

    if (
      brand.length < 1 ||
      brand.length > 100
    ) {
      return {
        valid: false,
        message:
          "Brand must contain 1–100 characters.",
      };
    }

    if (
      description.length < 10 ||
      description.length > 5000
    ) {
      return {
        valid: false,
        message:
          "Description must contain 10–5000 characters.",
      };
    }

    if (
      formData.price.trim() === ""
    ) {
      return {
        valid: false,
        message:
          "Please enter the product price.",
      };
    }

    const price =
      Number(formData.price);

    if (
      !Number.isFinite(price) ||
      price < 0 ||
      price > MAX_PRICE
    ) {
      return {
        valid: false,
        message:
          "Enter a valid price between ₹0 and ₹1,00,00,000.",
      };
    }

    if (
      formData.stock.trim() === ""
    ) {
      return {
        valid: false,
        message:
          "Please enter inventory stock.",
      };
    }

    const stock =
      Number(formData.stock);

    if (
      !Number.isInteger(stock) ||
      stock < 0 ||
      stock > MAX_STOCK
    ) {
      return {
        valid: false,
        message:
          "Stock must be a whole number between 0 and 10,00,000.",
      };
    }

    const sizes =
      parseCommaSeparated(
        formData.sizes,
        true
      );

    const colors =
      parseCommaSeparated(
        formData.colors
      );

    const sizeError =
      validateVariants(
        sizes,
        "sizes",
        true
      );

    if (sizeError) {
      return {
        valid: false,
        message: sizeError,
      };
    }

    const colorError =
      validateVariants(
        colors,
        "colors",
        true
      );

    if (colorError) {
      return {
        valid: false,
        message: colorError,
      };
    }

    if (
      images.length < 1 ||
      images.length > MAX_IMAGES
    ) {
      return {
        valid: false,
        message:
          `Please select 1–${MAX_IMAGES} images.`,
      };
    }

    return {
      valid: true,
      price,
      stock,
      sizes,
      colors,
    };
  }

  /* =====================================
     SUBMIT PRODUCT
  ===================================== */

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      submittingRef.current
    ) {
      return;
    }

    setError("");

    const validation =
      validateForm();

    if (!validation.valid) {
      setError(
        validation.message
      );
      return;
    }

    submittingRef.current = true;
    setLoading(true);

    try {
      const encodedImages:
        string[] = [];

      /*
       * Convert selected images
       * to Base64.
       *
       * Backend handles Cloudinary
       * uploads and cleanup.
       */

      for (
        let index = 0;
        index < images.length;
        index++
      ) {
        setProgress(
          `Preparing image ${
            index + 1
          } of ${images.length}...`
        );

        const base64 =
          await readFileAsDataURL(
            images[index].file
          );

        encodedImages.push(
          base64
        );
      }

      setProgress(
        "Uploading images and saving product..."
      );

      const productData = {
        name:
          formData.name.trim(),

        brand:
          formData.brand.trim(),

        description:
          formData.description.trim(),

        price:
          validation.price,

        category:
          formData.category,

        stock:
          validation.stock,

        sizes:
          validation.sizes,

        colors:
          validation.colors,

        images:
          encodedImages,

        isActive:
          formData.isActive,
      };

      const response =
        await fetch(
          "/api/admin/products",
          {
            method: "POST",

            credentials:
              "same-origin",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify(
              productData
            ),
          }
        );

      const result =
        await readApiResponse(
          response
        );

      if (
        !response.ok ||
        result.success !== true ||
        !result.product?._id
      ) {
        throw new Error(
          result.message ||
            "Unable to create product."
        );
      }

      setProgress(
        "Product created successfully!"
      );

      await router.push(
        "/admin/products"
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create product. Please try again."
      );

      setProgress("");
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  /* =====================================
     SHARED STYLES
  ===================================== */

  const inputClass =
    "w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm font-bold text-black outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:opacity-60";

  const labelClass =
    "mb-2 block text-[10px] font-black uppercase tracking-wider text-gray-500";

  /* =====================================
     RENDER
  ===================================== */

  return (
    <AdminLayout>
      <Head>
        <title>
          Add Product | KickStreet
        </title>

        <meta
          name="robots"
          content="noindex,nofollow"
        />
      </Head>

      <div className="mx-auto mb-10 w-full max-w-4xl overflow-hidden rounded-3xl border border-gray-100 bg-white p-5 shadow-xl sm:p-10">

        {/* HEADER */}

        <div className="mb-8">
          <h1 className="text-3xl font-black uppercase italic tracking-tighter text-black sm:text-5xl">
            Add New Heat
          </h1>

          <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
            KickStreet Inventory Management
          </p>
        </div>

        {/* ERROR */}

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"
          >
            {error}
          </div>
        )}

        {/* FORM */}

        <form
          onSubmit={
            handleSubmit
          }
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6"
        >

          {/* NAME */}

          <div className="sm:col-span-2">
            <label
              htmlFor="product-name"
              className={
                labelClass
              }
            >
              Shoe Name
            </label>

            <input
              id="product-name"
              type="text"
              required
              minLength={2}
              maxLength={150}
              disabled={loading}
              placeholder="Nike Air Max 270"
              value={
                formData.name
              }
              onChange={(
                event
              ) =>
                updateField(
                  "name",
                  event.target.value
                )
              }
              className={
                inputClass
              }
            />
          </div>

          {/* BRAND */}

          <div>
            <label
              htmlFor="product-brand"
              className={
                labelClass
              }
            >
              Brand
            </label>

            <input
              id="product-brand"
              type="text"
              required
              maxLength={100}
              disabled={loading}
              placeholder="Nike"
              value={
                formData.brand
              }
              onChange={(
                event
              ) =>
                updateField(
                  "brand",
                  event.target.value
                )
              }
              className={
                inputClass
              }
            />
          </div>

          {/* CATEGORY */}

          <div>
            <label
              htmlFor="product-category"
              className={
                labelClass
              }
            >
              Category
            </label>

            <select
              id="product-category"
              disabled={loading}
              value={
                formData.category
              }
              onChange={(
                event
              ) =>
                updateField(
                  "category",
                  event.target.value as Category
                )
              }
              className={
                inputClass
              }
            >
              <option value="Men">
                Men
              </option>

              <option value="Women">
                Women
              </option>

              <option value="Children">
                Children
              </option>
            </select>
          </div>

          {/* PRICE */}

          <div>
            <label
              htmlFor="product-price"
              className={
                labelClass
              }
            >
              Price (₹)
            </label>

            <input
              id="product-price"
              type="number"
              min="0"
              max={MAX_PRICE}
              step="0.01"
              required
              disabled={loading}
              placeholder="9999"
              value={
                formData.price
              }
              onChange={(
                event
              ) =>
                updateField(
                  "price",
                  event.target.value
                )
              }
              className={
                inputClass
              }
            />
          </div>

          {/* STOCK */}

          <div>
            <label
              htmlFor="product-stock"
              className={
                labelClass
              }
            >
              Inventory Stock
            </label>

            <input
              id="product-stock"
              type="number"
              min="0"
              max={MAX_STOCK}
              step="1"
              required
              disabled={loading}
              placeholder="50"
              value={
                formData.stock
              }
              onChange={(
                event
              ) =>
                updateField(
                  "stock",
                  event.target.value
                )
              }
              className={
                inputClass
              }
            />
          </div>

          {/* DESCRIPTION */}

          <div className="sm:col-span-2">
            <label
              htmlFor="product-description"
              className={
                labelClass
              }
            >
              Story / Description
            </label>

            <textarea
              id="product-description"
              required
              minLength={10}
              maxLength={5000}
              disabled={loading}
              placeholder="Describe the shoes, materials, comfort and features..."
              value={
                formData.description
              }
              onChange={(
                event
              ) =>
                updateField(
                  "description",
                  event.target.value
                )
              }
              className={`${inputClass} min-h-32 resize-y`}
            />
          </div>

          {/* SIZES */}

          <div>
            <label
              htmlFor="product-sizes"
              className={
                labelClass
              }
            >
              Sizes (UK)
            </label>

            <input
              id="product-sizes"
              type="text"
              required
              disabled={loading}
              placeholder="7, 8, 9, 10"
              value={
                formData.sizes
              }
              onChange={(
                event
              ) =>
                updateField(
                  "sizes",
                  event.target.value
                )
              }
              className={
                inputClass
              }
            />
          </div>

          {/* COLORS */}

          <div>
            <label
              htmlFor="product-colors"
              className={
                labelClass
              }
            >
              Available Colors
            </label>

            <input
              id="product-colors"
              type="text"
              required
              disabled={loading}
              placeholder="Black, White, Red"
              value={
                formData.colors
              }
              onChange={(
                event
              ) =>
                updateField(
                  "colors",
                  event.target.value
                )
              }
              className={
                inputClass
              }
            />
          </div>

          {/* VISIBILITY */}

          <div className="sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-gray-50 p-4">
              <input
                type="checkbox"
                checked={
                  formData.isActive
                }
                disabled={loading}
                onChange={(
                  event
                ) =>
                  updateField(
                    "isActive",
                    event.target.checked
                  )
                }
                className="h-5 w-5 accent-orange-500"
              />

              <span className="text-sm font-black uppercase text-black">
                Active Product
              </span>
            </label>

            <p className="mt-2 text-xs text-gray-500">
              Inactive products remain in the admin inventory but are hidden from the public shop.
            </p>
          </div>

          {/* IMAGE UPLOAD */}

          <div className="sm:col-span-2">
            <label
              htmlFor="product-images"
              className={
                labelClass
              }
            >
              Product Images ({images.length}/{MAX_IMAGES})
            </label>

            <input
              ref={
                fileInputRef
              }
              id="product-images"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              disabled={
                loading ||
                images.length >=
                  MAX_IMAGES
              }
              onChange={
                handleImageChange
              }
              className="block w-full rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-xs text-gray-600 file:mr-4 file:rounded-lg file:border-0 file:bg-black file:px-4 file:py-2 file:font-bold file:text-white hover:border-orange-500"
            />

            <p className="mt-2 text-xs text-gray-500">
              JPG, PNG or WebP. Maximum 2 MB per image, up to 5 images.
            </p>

            {/* PREVIEWS */}

            {images.length > 0 && (
              <div className="mt-5 flex gap-4 overflow-x-auto pb-3">
                {images.map(
                  (image, index) => (
                    <div
                      key={
                        image.id
                      }
                      className="relative shrink-0"
                    >
                      <img
                        src={
                          image.previewUrl
                        }
                        alt={`Product preview ${
                          index + 1
                        }`}
                        className="h-28 w-28 rounded-xl border border-gray-100 object-cover"
                      />

                      <button
                        type="button"
                        disabled={
                          loading
                        }
                        onClick={() =>
                          removeImage(
                            image.id
                          )
                        }
                        aria-label={`Remove image ${
                          index + 1
                        }`}
                        className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black text-sm font-bold text-white disabled:opacity-50"
                      >
                        ×
                      </button>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          {/* PROGRESS */}

          {loading && progress && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-xl bg-orange-50 p-4 text-sm font-bold text-orange-700 sm:col-span-2"
            >
              {progress}
            </div>
          )}

          {/* SUBMIT */}

          <button
            type="submit"
            disabled={loading}
            className="mt-3 rounded-xl bg-black px-6 py-5 text-sm font-black uppercase tracking-wider text-white shadow-lg transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-gray-300 sm:col-span-2"
          >
            {loading
              ? "Processing..."
              : "Confirm & Add Product"}
          </button>
        </form>
      </div>
    </AdminLayout>
  );
}
