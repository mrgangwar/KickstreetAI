
import Head from "next/head";
import { useRouter } from "next/router";
import {
  useCallback,
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

type Category = "Men" | "Women" | "Children";

type ProductForm = {
  name: string;
  brand: string;
  description: string;
  price: string;
  category: Category;
  stock: string;
  sizes: string;
  colors: string;
  isActive: boolean;
};

type Product = {
  _id: string;
  name: string;
  brand?: string;
  description: string;
  price: number;
  category: Category;
  stock: number;
  sizes: string[];
  colors: string[];
  images: string[];
  isActive?: boolean;
};

type ApiResult = {
  success?: boolean;
  message?: string;
  product?: Product;
  url?: string;
};

type ImageItem =
  | {
      id: string;
      kind: "existing";
      url: string;
    }
  | {
      id: string;
      kind: "new";
      file: File;
      preview: string;
    };

/* =========================================
   CONSTANTS
========================================= */

const MAX_IMAGES = 5;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

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

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm font-bold text-black outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:opacity-60";

const labelClass =
  "mb-2 block text-[10px] font-black uppercase tracking-wider text-gray-500";

/* =========================================
   HELPERS
========================================= */

function parseList(
  value: string,
  uppercase = false
): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) =>
          uppercase
            ? item.toUpperCase()
            : item.toLowerCase()
        )
    ),
  ];
}

function isValidId(id: string): boolean {
  return /^[a-f\d]{24}$/i.test(id);
}

function createId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()}`;
}

async function readApiResponse(
  response: Response
): Promise<ApiResult> {
  try {
    const value: unknown = await response.json();

    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      return value as ApiResult;
    }
  } catch {
    // Invalid JSON response.
  }

  return {
    success: false,
    message: "Invalid server response.",
  };
}

function readImage(
  file: File
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(
          new Error("Unable to read image.")
        );
      }
    };

    reader.onerror = () => {
      reject(
        new Error("Unable to read image.")
      );
    };

    reader.readAsDataURL(file);
  });
}

/* =========================================
   FORM VALIDATION
========================================= */

function validateForm(
  form: ProductForm,
  images: ImageItem[]
): string | null {
  const name = form.name.trim();
  const brand = form.brand.trim();
  const description = form.description.trim();

  if (
    name.length < 2 ||
    name.length > 150
  ) {
    return "Name must contain 2–150 characters.";
  }

  if (
    brand.length < 1 ||
    brand.length > 100
  ) {
    return "Brand must contain 1–100 characters.";
  }

  if (
    description.length < 10 ||
    description.length > 5000
  ) {
    return "Description must contain 10–5000 characters.";
  }

  if (
    !form.price.trim() ||
    !Number.isFinite(Number(form.price)) ||
    Number(form.price) < 0 ||
    Number(form.price) > 10000000
  ) {
    return "Enter a valid price.";
  }

  if (
    !form.stock.trim() ||
    !Number.isInteger(Number(form.stock)) ||
    Number(form.stock) < 0 ||
    Number(form.stock) > 1000000
  ) {
    return "Enter a valid whole-number stock.";
  }

  const sizes = parseList(form.sizes, true);
  const colors = parseList(form.colors);

  if (
    !sizes.length ||
    sizes.length > 30 ||
    sizes.some((size) => size.length > 50)
  ) {
    return "Enter 1–30 sizes, each at most 50 characters.";
  }

  if (
    !colors.length ||
    colors.length > 30 ||
    colors.some((color) => color.length > 50)
  ) {
    return "Enter 1–30 colors, each at most 50 characters.";
  }

  if (
    !images.length ||
    images.length > MAX_IMAGES
  ) {
    return `Keep 1–${MAX_IMAGES} product images.`;
  }

  return null;
}

/* =========================================
   EDIT PRODUCT PAGE
========================================= */

export default function EditProduct() {
  const router = useRouter();

  const productId =
    typeof router.query.id === "string"
      ? router.query.id
      : "";

  const [form, setForm] =
    useState<ProductForm>(INITIAL_FORM);

  const [images, setImages] =
    useState<ImageItem[]>([]);

  const [fetching, setFetching] =
    useState(true);

  const [loaded, setLoaded] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [progress, setProgress] =
    useState("");

  const imagesRef =
    useRef<ImageItem[]>([]);

  const submitting =
    useRef(false);

  /* =====================================
     IMAGE CLEANUP
  ===================================== */

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    return () => {
      imagesRef.current.forEach((item) => {
        if (item.kind === "new") {
          URL.revokeObjectURL(item.preview);
        }
      });
    };
  }, []);

  /* =====================================
     FETCH PRODUCT
  ===================================== */

  const loadProduct = useCallback(
    async (
      id: string,
      signal?: AbortSignal
    ) => {
      setFetching(true);
      setLoaded(false);
      setError("");

      try {
        if (!isValidId(id)) {
          throw new Error(
            "Invalid product ID."
          );
        }

        const response = await fetch(
          `/api/admin/products/${encodeURIComponent(id)}`,
          {
            credentials: "same-origin",
            cache: "no-store",
            signal,
          }
        );

        const data =
          await readApiResponse(response);

        if (
          !response.ok ||
          !data.success ||
          !data.product
        ) {
          throw new Error(
            data.message ||
              "Unable to load product."
          );
        }

        const product = data.product;

        if (
          !Array.isArray(product.images) ||
          !Array.isArray(product.sizes) ||
          !Array.isArray(product.colors) ||
          !Number.isFinite(product.price) ||
          !Number.isFinite(product.stock)
        ) {
          throw new Error(
            "Invalid product record."
          );
        }

        if (signal?.aborted) {
          return;
        }

        setForm({
          name: product.name || "",
          brand: product.brand || "",
          description:
            product.description || "",
          price: String(product.price),
          category: product.category,
          stock: String(product.stock),
          sizes: product.sizes.join(", "),
          colors: product.colors.join(", "),
          isActive:
            product.isActive !== false,
        });

        setImages((previous) => {
          previous.forEach((item) => {
            if (item.kind === "new") {
              URL.revokeObjectURL(
                item.preview
              );
            }
          });

          return product.images.map(
            (url, index) => ({
              kind: "existing" as const,
              url,
              id: `saved-${index}`,
            })
          );
        });

        setLoaded(true);
      } catch (err: unknown) {
        if (!signal?.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load product."
          );
        }
      } finally {
        if (!signal?.aborted) {
          setFetching(false);
        }
      }
    },
    []
  );

  /* =====================================
     INITIAL PRODUCT LOAD
  ===================================== */

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const controller =
      new AbortController();

    void loadProduct(
      productId,
      controller.signal
    );

    return () => {
      controller.abort();
    };
  }, [
    router.isReady,
    productId,
    loadProduct,
  ]);

  /* =====================================
     UPDATE FORM
  ===================================== */

  function updateField<
    K extends keyof ProductForm
  >(
    key: K,
    value: ProductForm[K]
  ) {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));

    setError("");
  }

  /* =====================================
     SELECT IMAGES
  ===================================== */

  function handleImageChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const files = Array.from(
      event.target.files || []
    );

    event.target.value = "";

    if (
      saving ||
      !loaded ||
      !files.length
    ) {
      return;
    }

    if (
      images.length + files.length >
      MAX_IMAGES
    ) {
      setError(
        `Maximum ${MAX_IMAGES} images allowed.`
      );
      return;
    }

    for (const file of files) {
      if (
        !ALLOWED_TYPES.includes(file.type)
      ) {
        setError(
          "Only JPEG, PNG or WebP images allowed."
        );
        return;
      }

      if (
        !file.size ||
        file.size > MAX_FILE_BYTES
      ) {
        setError(
          "Each new image must be 2 MB or smaller."
        );
        return;
      }
    }

    const selected: ImageItem[] =
      files.map((file) => ({
        kind: "new" as const,
        id: createId(),
        file,
        preview:
          URL.createObjectURL(file),
      }));

    setImages((previous) => [
      ...previous,
      ...selected,
    ]);

    setError("");
  }

  /* =====================================
     REMOVE IMAGE
  ===================================== */

  function removeImage(id: string) {
    if (saving) {
      return;
    }

    setImages((previous) => {
      const item = previous.find(
        (image) => image.id === id
      );

      if (item?.kind === "new") {
        URL.revokeObjectURL(
          item.preview
        );
      }

      return previous.filter(
        (image) => image.id !== id
      );
    });

    setError("");
  }

  /* =====================================
     UPLOAD NEW IMAGE
  ===================================== */

  async function uploadImage(
    file: File
  ): Promise<string> {
    const image =
      await readImage(file);

    const response = await fetch(
      "/api/upload",
      {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          image,
          type: "product",
        }),
      }
    );

    const data =
      await readApiResponse(response);

    if (
      !response.ok ||
      data.success !== true ||
      typeof data.url !== "string" ||
      !data.url.startsWith("https://")
    ) {
      throw new Error(
        data.message ||
          "Image upload failed."
      );
    }

    return data.url;
  }

  /* =====================================
     SUBMIT PRODUCT UPDATE
  ===================================== */

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      submitting.current ||
      !loaded ||
      fetching
    ) {
      return;
    }

    const validationError =
      validateForm(form, images);

    if (validationError) {
      setError(validationError);
      return;
    }

    if (!isValidId(productId)) {
      setError("Invalid product ID.");
      return;
    }

    submitting.current = true;
    setSaving(true);
    setError("");

    try {
      const imageUrls: string[] = [];

      let uploadedCount = 0;

      const newImageCount =
        images.filter(
          (item) =>
            item.kind === "new"
        ).length;

      for (const item of images) {
        if (
          item.kind === "existing"
        ) {
          imageUrls.push(item.url);
          continue;
        }

        setProgress(
          `Uploading new image ${
            ++uploadedCount
          } of ${newImageCount}...`
        );

        const uploadedUrl =
          await uploadImage(item.file);

        imageUrls.push(uploadedUrl);
      }

      setProgress(
        "Saving product changes..."
      );

      const response = await fetch(
        `/api/admin/products/${encodeURIComponent(productId)}`,
        {
          method: "PUT",
          credentials: "same-origin",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name: form.name.trim(),
            brand: form.brand.trim(),
            description:
              form.description.trim(),
            price: Number(form.price),
            category: form.category,
            stock: Number(form.stock),
            sizes: parseList(
              form.sizes,
              true
            ),
            colors: parseList(
              form.colors
            ),
            images: imageUrls,
            isActive: form.isActive,
          }),
        }
      );

      const result =
        await readApiResponse(response);

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.message ||
            "Unable to update product."
        );
      }

      await router.push(
        "/admin/products"
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update product."
      );
    } finally {
      submitting.current = false;
      setSaving(false);
      setProgress("");
    }
  }

  /* =====================================
     RENDER
  ===================================== */

  return (
    <AdminLayout>
      <Head>
        <title>
          Edit Product | KickStreet
        </title>

        <meta
          name="robots"
          content="noindex,nofollow"
        />
      </Head>

      <div className="mx-auto mb-10 max-w-4xl rounded-3xl border border-gray-100 bg-white p-5 shadow-xl sm:p-10">
        <h1 className="text-3xl font-black uppercase italic tracking-tight text-black sm:text-5xl">
          Edit Product
        </h1>

        <p className="mb-8 mt-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
          KickStreet Inventory Management
        </p>

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"
          >
            {error}
          </div>
        )}

        {fetching ? (
          <p className="py-12 text-center font-bold text-gray-500">
            Loading product...
          </p>
        ) : !loaded ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Product could not be loaded.
            </p>

            <button
              type="button"
              onClick={() =>
                void loadProduct(productId)
              }
              className="rounded-xl bg-black px-5 py-3 text-xs font-bold text-white"
            >
              Retry
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 gap-5 sm:grid-cols-2"
          >
            {/* PRODUCT NAME */}

            <div className="sm:col-span-2">
              <label
                htmlFor="name"
                className={labelClass}
              >
                Shoe Name
              </label>

              <input
                id="name"
                className={inputClass}
                value={form.name}
                onChange={(event) =>
                  updateField(
                    "name",
                    event.target.value
                  )
                }
                required
                minLength={2}
                maxLength={150}
                disabled={saving}
              />
            </div>

            {/* BRAND */}

            <div>
              <label
                htmlFor="brand"
                className={labelClass}
              >
                Brand
              </label>

              <input
                id="brand"
                className={inputClass}
                value={form.brand}
                onChange={(event) =>
                  updateField(
                    "brand",
                    event.target.value
                  )
                }
                required
                maxLength={100}
                disabled={saving}
                placeholder="Nike"
              />
            </div>

            {/* CATEGORY */}

            <div>
              <label
                htmlFor="category"
                className={labelClass}
              >
                Category
              </label>

              <select
                id="category"
                className={inputClass}
                value={form.category}
                onChange={(event) =>
                  updateField(
                    "category",
                    event.target.value as Category
                  )
                }
                disabled={saving}
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
                htmlFor="price"
                className={labelClass}
              >
                Price (₹)
              </label>

              <input
                id="price"
                type="number"
                min="0"
                max="10000000"
                step="0.01"
                className={inputClass}
                value={form.price}
                onChange={(event) =>
                  updateField(
                    "price",
                    event.target.value
                  )
                }
                required
                disabled={saving}
              />
            </div>

            {/* STOCK */}

            <div>
              <label
                htmlFor="stock"
                className={labelClass}
              >
                Stock
              </label>

              <input
                id="stock"
                type="number"
                min="0"
                max="1000000"
                step="1"
                className={inputClass}
                value={form.stock}
                onChange={(event) =>
                  updateField(
                    "stock",
                    event.target.value
                  )
                }
                required
                disabled={saving}
              />
            </div>

            {/* DESCRIPTION */}

            <div className="sm:col-span-2">
              <label
                htmlFor="description"
                className={labelClass}
              >
                Description
              </label>

              <textarea
                id="description"
                className={`${inputClass} min-h-32 resize-y`}
                value={form.description}
                onChange={(event) =>
                  updateField(
                    "description",
                    event.target.value
                  )
                }
                minLength={10}
                maxLength={5000}
                required
                disabled={saving}
              />
            </div>

            {/* SIZES */}

            <div>
              <label
                htmlFor="sizes"
                className={labelClass}
              >
                Sizes (UK)
              </label>

              <input
                id="sizes"
                className={inputClass}
                value={form.sizes}
                onChange={(event) =>
                  updateField(
                    "sizes",
                    event.target.value
                  )
                }
                placeholder="7, 8, 9"
                required
                disabled={saving}
              />
            </div>

            {/* COLORS */}

            <div>
              <label
                htmlFor="colors"
                className={labelClass}
              >
                Colors
              </label>

              <input
                id="colors"
                className={inputClass}
                value={form.colors}
                onChange={(event) =>
                  updateField(
                    "colors",
                    event.target.value
                  )
                }
                placeholder="Black, White"
                required
                disabled={saving}
              />
            </div>

            {/* VISIBILITY */}

            <label className="flex items-center gap-3 rounded-xl bg-gray-50 p-4 text-sm font-black uppercase sm:col-span-2">
              <input
                type="checkbox"
                className="h-5 w-5 accent-orange-500"
                checked={form.isActive}
                onChange={(event) =>
                  updateField(
                    "isActive",
                    event.target.checked
                  )
                }
                disabled={saving}
              />

              Active Product
            </label>

            {/* PRODUCT IMAGES */}

            <div className="sm:col-span-2">
              <label
                htmlFor="images"
                className={labelClass}
              >
                Product Images ({images.length}/{MAX_IMAGES})
              </label>

              <input
                id="images"
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageChange}
                disabled={
                  saving ||
                  images.length >= MAX_IMAGES
                }
                className="block w-full rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-xs file:mr-4 file:rounded-lg file:border-0 file:bg-black file:px-4 file:py-2 file:font-bold file:text-white"
              />

              <p className="mt-2 text-xs text-gray-500">
                New images: JPG, PNG or WebP,
                maximum 2 MB each. Up to 5 images total.
              </p>

              {/* IMAGE PREVIEWS */}

              <div className="mt-5 flex gap-4 overflow-x-auto pb-3">
                {images.map(
                  (item, index) => (
                    <div
                      key={item.id}
                      className="relative shrink-0"
                    >
                      <img
                        src={
                          item.kind === "existing"
                            ? item.url
                            : item.preview
                        }
                        alt={`Product image ${index + 1}`}
                        className="h-28 w-28 rounded-xl border object-cover"
                      />

                      <span className="absolute bottom-1 left-1 rounded bg-black/80 px-2 py-1 text-[9px] font-bold text-white">
                        {item.kind === "existing"
                          ? "Saved"
                          : "New"}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          removeImage(item.id)
                        }
                        disabled={saving}
                        aria-label={`Remove image ${index + 1}`}
                        className="absolute right-1 top-1 rounded-full bg-black px-2 py-1 text-xs font-bold text-white disabled:opacity-50"
                      >
                        ×
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* UPLOAD PROGRESS */}

            {saving && (
              <p
                role="status"
                className="rounded-xl bg-orange-50 p-4 text-sm font-bold text-orange-700 sm:col-span-2"
              >
                {progress || "Processing..."}
              </p>
            )}

            {/* ACTION BUTTONS */}

            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-xl bg-black px-6 py-5 text-xs font-black uppercase tracking-wider text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {saving
                  ? "Updating..."
                  : "Update Product"}
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void router.push(
                    "/admin/products"
                  )
                }
                className="rounded-xl bg-gray-100 px-6 py-5 text-xs font-black uppercase text-gray-700"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </AdminLayout>
  );
}
