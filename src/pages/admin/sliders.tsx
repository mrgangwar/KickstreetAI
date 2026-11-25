
import Head from "next/head";
import Image from "next/image";
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

interface Slider {
  _id: string;
  image: string;
  productId: string | null;
  title: string;
  subtitle: string;
  order: number;
  isActive: boolean;
}

interface Product {
  _id: string;
  name: string;
  price: number;
  images: string[];
  isActive?: boolean;
}

interface SliderForm {
  image: string;
  productId: string;
  title: string;
  subtitle: string;
  order: string;
  isActive: boolean;
}

interface ApiResponse {
  success?: boolean;
  message?: string;
  sliders?: Slider[];
  slider?: Slider;
  products?: Product[];
  url?: string;
  publicId?: string;
  pagination?: {
    page: number;
    totalPages: number;
  };
}

/* =========================================
   CONSTANTS
========================================= */

const MAX_SLIDERS = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TITLE_LENGTH = 150;
const MAX_SUBTITLE_LENGTH = 300;

const IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const INITIAL_FORM: SliderForm = {
  image: "",
  productId: "",
  title: "",
  subtitle: "",
  order: "0",
  isActive: true,
};

const inputClass =
  "w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm font-bold text-black outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:opacity-50";

const labelClass =
  "mb-2 block text-[10px] font-black uppercase tracking-wider text-gray-500";

/* =========================================
   HELPERS
========================================= */

async function readApi(
  response: Response
): Promise<ApiResponse> {
  try {
    const result: unknown =
      await response.json();

    if (
      result !== null &&
      typeof result === "object" &&
      !Array.isArray(result)
    ) {
      return result as ApiResponse;
    }
  } catch {
    // Invalid JSON response.
  }

  return {
    success: false,
    message: "Invalid server response.",
  };
}

function getErrorMessage(
  response: Response,
  data: ApiResponse,
  fallback: string
): string {
  if (
    typeof data.message === "string" &&
    data.message.trim()
  ) {
    return data.message;
  }

  if (response.status === 401) {
    return "Please sign in again.";
  }

  if (response.status === 403) {
    return "Admin access required.";
  }

  return fallback;
}

function readImageAsDataURL(
  file: File
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (
        typeof reader.result === "string"
      ) {
        resolve(reader.result);
      } else {
        reject(
          new Error("Unable to read image.")
        );
      }
    };

    reader.onerror = () => {
      reject(
        new Error("Image reading failed.")
      );
    };

    reader.readAsDataURL(file);
  });
}

function formatPrice(
  value: number
): string {
  return new Intl.NumberFormat(
    "en-IN",
    {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }
  ).format(value);
}

function isCloudinaryUrl(
  value: string
): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      url.hostname ===
        "res.cloudinary.com"
    );
  } catch {
    return false;
  }
}

function validateForm(
  form: SliderForm
): string | null {
  if (!isCloudinaryUrl(form.image)) {
    return "Upload a valid Cloudinary image.";
  }

  if (
    form.title.trim().length >
    MAX_TITLE_LENGTH
  ) {
    return "Title must not exceed 150 characters.";
  }

  if (
    form.subtitle.trim().length >
    MAX_SUBTITLE_LENGTH
  ) {
    return "Subtitle must not exceed 300 characters.";
  }

  if (
    !form.order.trim() ||
    !/^\d+$/.test(form.order.trim())
  ) {
    return "Enter a valid sequence order.";
  }

  const order =
    Number(form.order);

  if (
    !Number.isInteger(order) ||
    order < 0 ||
    order > 1000
  ) {
    return "Order must be between 0 and 1000.";
  }

  return null;
}

/* =========================================
   SLIDER MANAGEMENT PAGE
========================================= */

export default function SlidersPage() {
  const [sliders, setSliders] =
    useState<Slider[]>([]);

  const [products, setProducts] =
    useState<Product[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [uploading, setUploading] =
    useState(false);

  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  const [showModal, setShowModal] =
    useState(false);

  const [editingSlider, setEditingSlider] =
    useState<Slider | null>(null);

  const [form, setForm] =
    useState<SliderForm>(INITIAL_FORM);

  const [error, setError] =
    useState("");

  const [modalError, setModalError] =
    useState("");

  const [notice, setNotice] =
    useState("");

  const [productNotice, setProductNotice] =
    useState("");

  const modalRef =
    useRef<HTMLDivElement>(null);

  const closeButtonRef =
    useRef<HTMLButtonElement>(null);

  const uploadingRef =
    useRef(false);

  const savingRef =
    useRef(false);

  const uploadGeneration =
    useRef(0);

  /* =====================================
     FETCH SLIDERS AND PRODUCTS
  ===================================== */

  const fetchData = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");

      try {
        const [sliderResponse, productResponse] =
          await Promise.all([
            fetch("/api/admin/sliders", {
              credentials: "same-origin",
              cache: "no-store",
              signal,
            }),
            fetch(
              "/api/admin/products?page=1&limit=100",
              {
                credentials: "same-origin",
                cache: "no-store",
                signal,
              }
            ),
          ]);

        const [sliderData, productData] =
          await Promise.all([
            readApi(sliderResponse),
            readApi(productResponse),
          ]);

        if (
          !sliderResponse.ok ||
          sliderData.success !== true ||
          !Array.isArray(sliderData.sliders)
        ) {
          throw new Error(
            getErrorMessage(
              sliderResponse,
              sliderData,
              "Unable to load sliders."
            )
          );
        }

        if (signal?.aborted) {
          return;
        }

        setSliders(
          [...sliderData.sliders].sort(
            (a, b) =>
              a.order - b.order ||
              a._id.localeCompare(b._id)
          )
        );

        if (
          productResponse.ok &&
          productData.success === true &&
          Array.isArray(productData.products)
        ) {
          const activeProducts =
            productData.products.filter(
              (product) =>
                product.isActive !== false &&
                Array.isArray(product.images) &&
                product.images.length > 0
            );

          setProducts(activeProducts);

          const totalPages =
            productData.pagination?.totalPages ?? 1;

          setProductNotice(
            totalPages > 1
              ? "Showing products from the first page only. Some products may not appear in the dropdown."
              : ""
          );
        } else {
          setProducts([]);
          setProductNotice(
            getErrorMessage(
              productResponse,
              productData,
              "Products could not be loaded."
            )
          );
        }
      } catch (err: unknown) {
        if (signal?.aborted) {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load slider data."
        );
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    const controller =
      new AbortController();

    void fetchData(controller.signal);

    return () => {
      controller.abort();
      uploadGeneration.current += 1;
    };
  }, [fetchData]);

  /* =====================================
     FORM HELPERS
  ===================================== */

  function updateForm<
    K extends keyof SliderForm
  >(
    field: K,
    value: SliderForm[K]
  ) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));

    setModalError("");
  }

  function resetForm() {
    setForm({
      ...INITIAL_FORM,
      order: String(sliders.length),
    });
  }

  function openCreateModal() {
    if (
      sliders.length >= MAX_SLIDERS ||
      loading ||
      saving
    ) {
      return;
    }

    setEditingSlider(null);
    resetForm();
    setModalError("");
    setShowModal(true);
  }

  function openEditModal(
    slider: Slider
  ) {
    if (saving || deletingId) {
      return;
    }

    setEditingSlider(slider);

    setForm({
      image: slider.image,
      productId:
        slider.productId || "",
      title: slider.title || "",
      subtitle: slider.subtitle || "",
      order: String(slider.order),
      isActive: slider.isActive,
    });

    setModalError("");
    setShowModal(true);
  }

  function openQuickAdd(
    product: Product
  ) {
    if (
      sliders.length >= MAX_SLIDERS ||
      saving
    ) {
      return;
    }

    setEditingSlider(null);

    setForm({
      image: product.images[0],
      productId: product._id,
      title: product.name.slice(
        0,
        MAX_TITLE_LENGTH
      ),
      subtitle: formatPrice(
        product.price
      ),
      order: String(sliders.length),
      isActive: true,
    });

    setModalError("");
    setShowModal(true);
  }

  function closeModal() {
    if (
      savingRef.current ||
      uploadingRef.current
    ) {
      return;
    }

    uploadGeneration.current += 1;
    setShowModal(false);
    setEditingSlider(null);
    setModalError("");
  }

  /* =====================================
     MODAL KEYBOARD HANDLING
  ===================================== */

  useEffect(() => {
    if (!showModal) {
      return;
    }

    const previousFocus =
      document.activeElement;

    closeButtonRef.current?.focus();

    function handleKeyDown(
      event: KeyboardEvent
    ) {
      if (event.key === "Escape") {
        if (
          !savingRef.current &&
          !uploadingRef.current
        ) {
          closeModal();
        }

        return;
      }

      if (
        event.key !== "Tab" ||
        !modalRef.current
      ) {
        return;
      }

      const elements =
        modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
        );

      if (!elements.length) {
        return;
      }

      const first = elements[0];
      const last =
        elements[elements.length - 1];

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

      if (
        previousFocus instanceof HTMLElement
      ) {
        previousFocus.focus();
      }
    };
  }, [showModal]);

  /* =====================================
     IMAGE UPLOAD
  ===================================== */

  async function handleImageUpload(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0];

    event.target.value = "";

    if (
      !file ||
      uploadingRef.current ||
      savingRef.current
    ) {
      return;
    }

    if (
      !IMAGE_TYPES.includes(file.type)
    ) {
      setModalError(
        "Only JPEG, PNG and WebP images are allowed."
      );
      return;
    }

    if (
      file.size === 0 ||
      file.size > MAX_IMAGE_BYTES
    ) {
      setModalError(
        "Slider image must be 5 MB or smaller."
      );
      return;
    }

    uploadingRef.current = true;
    setUploading(true);
    setModalError("");

    const generation =
      ++uploadGeneration.current;

    try {
      const image =
        await readImageAsDataURL(file);

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
            type: "slider",
          }),
        }
      );

      const data =
        await readApi(response);

      if (
        !response.ok ||
        data.success !== true ||
        typeof data.url !== "string" ||
        !isCloudinaryUrl(data.url)
      ) {
        throw new Error(
          getErrorMessage(
            response,
            data,
            "Slider image upload failed."
          )
        );
      }

      if (
        generation !==
        uploadGeneration.current
      ) {
        return;
      }

      setForm((previous) => ({
        ...previous,
        image: data.url as string,
      }));
    } catch (err: unknown) {
      if (
        generation ===
        uploadGeneration.current
      ) {
        setModalError(
          err instanceof Error
            ? err.message
            : "Image upload failed."
        );
      }
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  }

  /* =====================================
     SAVE SLIDER
  ===================================== */

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      savingRef.current ||
      uploadingRef.current
    ) {
      return;
    }

    const validationError =
      validateForm(form);

    if (validationError) {
      setModalError(validationError);
      return;
    }

    if (
      !editingSlider &&
      sliders.length >= MAX_SLIDERS
    ) {
      setModalError(
        "Maximum 3 sliders allowed."
      );
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setModalError("");

    try {
      const endpoint = editingSlider
        ? `/api/admin/sliders/${encodeURIComponent(
            editingSlider._id
          )}`
        : "/api/admin/sliders";

      const response = await fetch(
        endpoint,
        {
          method: editingSlider
            ? "PUT"
            : "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            image: form.image,
            productId:
              form.productId || null,
            title: form.title.trim(),
            subtitle:
              form.subtitle.trim(),
            order: Number(form.order),
            isActive: form.isActive,
          }),
        }
      );

      const data =
        await readApi(response);

      if (
        !response.ok ||
        data.success !== true
      ) {
        throw new Error(
          getErrorMessage(
            response,
            data,
            "Unable to save slider."
          )
        );
      }

      setShowModal(false);
      setEditingSlider(null);
      setNotice(
        editingSlider
          ? "Slider updated successfully."
          : "Slider created successfully."
      );

      await fetchData();
    } catch (err: unknown) {
      setModalError(
        err instanceof Error
          ? err.message
          : "Unable to save slider."
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  /* =====================================
     DELETE SLIDER
  ===================================== */

  async function handleDelete(
    slider: Slider
  ) {
    if (
      deletingId ||
      saving ||
      uploading
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        `Delete slider "${slider.title || "Untitled"}"?`
      );

    if (!confirmed) {
      return;
    }

    setDeletingId(slider._id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/admin/sliders/${encodeURIComponent(
          slider._id
        )}`,
        {
          method: "DELETE",
          credentials: "same-origin",
        }
      );

      const data =
        await readApi(response);

      if (
        !response.ok ||
        data.success !== true
      ) {
        throw new Error(
          getErrorMessage(
            response,
            data,
            "Unable to delete slider."
          )
        );
      }

      setNotice(
        "Slider deleted successfully."
      );

      await fetchData();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to delete slider."
      );
    } finally {
      setDeletingId(null);
    }
  }

  /* =====================================
     RENDER
  ===================================== */

  return (
    <AdminLayout>
      <Head>
        <title>
          Hero Sliders | KickStreet Admin
        </title>

        <meta
          name="robots"
          content="noindex,nofollow"
        />
      </Head>

      <div className="mx-auto w-full max-w-7xl px-2 pb-10 sm:px-4">
        {/* HEADER */}

        <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-4xl font-black uppercase italic tracking-tighter text-black sm:text-5xl">
              Hero{" "}
              <span className="text-orange-600">
                Visuals
              </span>
            </h1>

            <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
              Homepage Banner Management
              {" · "}
              {sliders.length}/{MAX_SLIDERS}
            </p>
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            disabled={
              loading ||
              saving ||
              sliders.length >= MAX_SLIDERS
            }
            className="rounded-2xl bg-black px-7 py-4 text-xs font-black uppercase tracking-wider text-white shadow-lg transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Create New Slide
          </button>
        </div>

        {/* NOTIFICATIONS */}

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"
          >
            {error}

            <button
              type="button"
              onClick={() =>
                void fetchData()
              }
              className="ml-3 font-black underline"
            >
              Retry
            </button>
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="mb-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-700"
          >
            {notice}
          </div>
        )}

        {productNotice && (
          <div className="mb-5 rounded-xl border border-orange-200 bg-orange-50 p-4 text-xs font-semibold text-orange-800">
            {productNotice}
          </div>
        )}

        {/* QUICK ADD */}

        {!loading &&
          products.length > 0 &&
          sliders.length < MAX_SLIDERS && (
            <section className="mb-9">
              <h2 className="mb-3 text-xs font-black uppercase text-gray-500">
                Quick Create From Products
              </h2>

              <div className="flex gap-3 overflow-x-auto pb-3">
                {products
                  .slice(0, 8)
                  .map((product) => (
                    <button
                      key={product._id}
                      type="button"
                      onClick={() =>
                        openQuickAdd(product)
                      }
                      className="w-32 shrink-0 rounded-2xl border-2 border-gray-100 bg-white p-3 text-left transition hover:border-orange-500"
                    >
                      <div className="relative mb-3 h-24 w-full overflow-hidden rounded-xl bg-gray-100">
                        <Image
                          src={product.images[0]}
                          alt={product.name}
                          fill
                          sizes="128px"
                          className="object-cover"
                        />
                      </div>

                      <p className="truncate text-[10px] font-black uppercase text-black">
                        {product.name}
                      </p>

                      <p className="mt-1 text-[10px] font-bold text-orange-600">
                        {formatPrice(
                          product.price
                        )}
                      </p>
                    </button>
                  ))}
              </div>
            </section>
          )}

        {/* LOADING */}

        {loading ? (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-gray-200 bg-gray-50">
            <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-orange-600" />

            <p className="text-xs font-black uppercase text-gray-400">
              Loading Visuals...
            </p>
          </div>
        ) : sliders.length === 0 ? (
          /* EMPTY STATE */

          <div className="rounded-3xl border-2 border-dashed border-gray-200 bg-gray-50 p-10 text-center sm:p-16">
            <h2 className="text-xl font-black uppercase italic text-black">
              The Stage Is Empty
            </h2>

            <p className="mt-3 text-xs text-gray-500">
              Create your first homepage slider.
            </p>
          </div>
        ) : (
          /* SLIDER GRID */

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {sliders.map((slider) => (
              <article
                key={slider._id}
                className="group overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm transition hover:shadow-xl"
              >
                <div className="relative h-56 bg-gray-900">
                  {slider.image ? (
                    <Image
                      src={slider.image}
                      alt={
                        slider.title ||
                        "Homepage slider"
                      }
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover opacity-85 transition duration-500 group-hover:scale-105 group-hover:opacity-100"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs font-bold text-white">
                      Image Missing
                    </div>
                  )}

                  <span
                    className={`absolute left-4 top-4 rounded-full px-3 py-1 text-[9px] font-black uppercase ${
                      slider.isActive
                        ? "bg-orange-600 text-white"
                        : "bg-white text-black"
                    }`}
                  >
                    {slider.isActive
                      ? "Live"
                      : "Draft"}
                  </span>

                  <span className="absolute bottom-4 right-4 rounded-lg bg-black/70 px-3 py-1 text-[10px] font-black text-white">
                    ORDER {slider.order}
                  </span>
                </div>

                <div className="p-6">
                  <h3 className="truncate text-lg font-black uppercase italic text-black">
                    {slider.title ||
                      "Untitled Slider"}
                  </h3>

                  <p className="mt-2 truncate text-xs text-gray-500">
                    {slider.subtitle ||
                      "No subtitle"}
                  </p>

                  <div className="mt-6 flex gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        openEditModal(slider)
                      }
                      disabled={
                        saving ||
                        deletingId !== null
                      }
                      className="flex-1 rounded-xl bg-gray-100 py-3 text-xs font-black uppercase transition hover:bg-black hover:text-white disabled:opacity-50"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void handleDelete(slider)
                      }
                      disabled={
                        deletingId !== null ||
                        saving
                      }
                      className="flex-1 rounded-xl bg-red-50 py-3 text-xs font-black uppercase text-red-600 transition hover:bg-red-600 hover:text-white disabled:opacity-50"
                    >
                      {deletingId === slider._id
                        ? "Deleting..."
                        : "Delete"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* MODAL */}

        {showModal && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm sm:p-6"
            onMouseDown={(event) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                closeModal();
              }
            }}
          >
            <div
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="slider-modal-title"
              className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
            >
              {/* MODAL HEADER */}

              <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white p-6 sm:p-8">
                <div>
                  <h2
                    id="slider-modal-title"
                    className="text-3xl font-black uppercase italic tracking-tight text-black sm:text-4xl"
                  >
                    {editingSlider
                      ? "Edit Slide"
                      : "Add New Slide"}
                  </h2>

                  <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
                    KickStreet Hero Management
                  </p>
                </div>

                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={closeModal}
                  disabled={
                    saving || uploading
                  }
                  aria-label="Close slider editor"
                  className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-black text-black disabled:opacity-50"
                >
                  CLOSE
                </button>
              </div>

              {/* FORM */}

              <form
                onSubmit={handleSubmit}
                className="grid grid-cols-1 gap-5 p-6 sm:grid-cols-2 sm:p-8"
              >
                {modalError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-700 sm:col-span-2"
                  >
                    {modalError}
                  </div>
                )}

                {/* IMAGE */}

                <div className="sm:col-span-2">
                  <label
                    htmlFor="slider-image"
                    className={labelClass}
                  >
                    Slider Image
                  </label>

                  {form.image && (
                    <div className="relative mb-4 h-44 overflow-hidden rounded-2xl bg-gray-100">
                      <Image
                        src={form.image}
                        alt="Slider preview"
                        fill
                        sizes="640px"
                        className="object-cover"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          updateForm(
                            "image",
                            ""
                          )
                        }
                        disabled={
                          saving || uploading
                        }
                        aria-label="Remove slider image"
                        className="absolute right-3 top-3 rounded-full bg-red-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                      >
                        ×
                      </button>
                    </div>
                  )}

                  <input
                    id="slider-image"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={
                      handleImageUpload
                    }
                    disabled={
                      uploading || saving
                    }
                    className="block w-full rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-black file:px-4 file:py-2 file:text-white"
                  />

                  <p className="mt-2 text-xs text-gray-500">
                    JPEG, PNG or WebP.
                    Maximum 5 MB.
                  </p>

                  {uploading && (
                    <p
                      role="status"
                      className="mt-2 text-xs font-bold text-orange-600"
                    >
                      Uploading image...
                    </p>
                  )}
                </div>

                {/* ORDER */}

                <div>
                  <label
                    htmlFor="slider-order"
                    className={labelClass}
                  >
                    Sequence Order
                  </label>

                  <input
                    id="slider-order"
                    type="number"
                    min="0"
                    max="1000"
                    step="1"
                    required
                    disabled={saving}
                    value={form.order}
                    onChange={(event) =>
                      updateForm(
                        "order",
                        event.target.value
                      )
                    }
                    className={inputClass}
                  />
                </div>

                {/* STATUS */}

                <div>
                  <span className={labelClass}>
                    Visibility
                  </span>

                  <label className="flex min-h-14 items-center gap-3 rounded-2xl bg-gray-50 p-4">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      disabled={saving}
                      onChange={(event) =>
                        updateForm(
                          "isActive",
                          event.target.checked
                        )
                      }
                      className="h-5 w-5 accent-orange-600"
                    />

                    <span className="text-xs font-black uppercase text-black">
                      Active on Site
                    </span>
                  </label>
                </div>

                {/* TITLE */}

                <div className="sm:col-span-2">
                  <label
                    htmlFor="slider-title"
                    className={labelClass}
                  >
                    Primary Title
                  </label>

                  <input
                    id="slider-title"
                    type="text"
                    maxLength={
                      MAX_TITLE_LENGTH
                    }
                    value={form.title}
                    onChange={(event) =>
                      updateForm(
                        "title",
                        event.target.value
                      )
                    }
                    disabled={saving}
                    placeholder="HEAT FOR YOUR FEET"
                    className={inputClass}
                  />
                </div>

                {/* SUBTITLE */}

                <div className="sm:col-span-2">
                  <label
                    htmlFor="slider-subtitle"
                    className={labelClass}
                  >
                    Subtitle
                  </label>

                  <input
                    id="slider-subtitle"
                    type="text"
                    maxLength={
                      MAX_SUBTITLE_LENGTH
                    }
                    value={form.subtitle}
                    onChange={(event) =>
                      updateForm(
                        "subtitle",
                        event.target.value
                      )
                    }
                    disabled={saving}
                    placeholder="Limited Drop"
                    className={inputClass}
                  />
                </div>

                {/* PRODUCT LINK */}

                <div className="sm:col-span-2">
                  <label
                    htmlFor="slider-product"
                    className={labelClass}
                  >
                    Product Connection
                  </label>

                  <select
                    id="slider-product"
                    value={form.productId}
                    onChange={(event) =>
                      updateForm(
                        "productId",
                        event.target.value
                      )
                    }
                    disabled={saving}
                    className={inputClass}
                  >
                    <option value="">
                      No Product Link
                    </option>

                    {form.productId &&
                      !products.some(
                        (product) =>
                          product._id ===
                          form.productId
                      ) && (
                        <option
                          value={
                            form.productId
                          }
                        >
                          Previously linked product
                        </option>
                      )}

                    {products.map(
                      (product) => (
                        <option
                          key={
                            product._id
                          }
                          value={
                            product._id
                          }
                        >
                          {product.name}
                        </option>
                      )
                    )}
                  </select>
                </div>

                {/* SAVE */}

                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={
                      saving || uploading
                    }
                    className="w-full rounded-2xl bg-black py-5 text-xs font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving
                      ? "Saving..."
                      : uploading
                        ? "Uploading..."
                        : editingSlider
                          ? "Sync Updates"
                          : "Launch Slide"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
