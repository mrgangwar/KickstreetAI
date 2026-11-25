
import Head from "next/head";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import type {
  FormEvent,
} from "react";

import AdminLayout from "@/components/AdminLayout";

/* =========================================
   TYPES
========================================= */

interface ShopSettingsData {
  storeName: string;
  storeEmail: string;
  storePhone: string;
  storeAddress: string;
  freeShippingThreshold: number;
  codEnabled: boolean;
  stripeEnabled: boolean;
}

interface SettingsForm {
  storeName: string;
  storeEmail: string;
  storePhone: string;
  storeAddress: string;
  freeShippingThreshold: string;
  codEnabled: boolean;
  stripeEnabled: boolean;
}

interface SettingsApiResponse {
  success?: boolean;
  message?: string;
  settings?: Partial<ShopSettingsData>;
}

/* =========================================
   CONSTANTS
========================================= */

const SETTINGS_API =
  "/api/admin/shop-settings";

const INITIAL_FORM: SettingsForm = {
  storeName: "",
  storeEmail: "",
  storePhone: "",
  storeAddress: "",
  freeShippingThreshold: "0",
  codEnabled: false,
  stripeEnabled: false,
};

const inputClass =
  "w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm font-semibold text-black outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:opacity-50";

const labelClass =
  "mb-2 block text-[10px] font-black uppercase tracking-wider text-gray-500";

/* =========================================
   HELPERS
========================================= */

function toForm(
  settings: ShopSettingsData
): SettingsForm {
  return {
    storeName: settings.storeName,
    storeEmail: settings.storeEmail,
    storePhone: settings.storePhone,
    storeAddress: settings.storeAddress,
    freeShippingThreshold: String(
      settings.freeShippingThreshold
    ),
    codEnabled: settings.codEnabled,
    stripeEnabled: settings.stripeEnabled,
  };
}

function normalizeSettings(
  input: Partial<ShopSettingsData>
): ShopSettingsData {
  return {
    storeName:
      typeof input.storeName === "string"
        ? input.storeName
        : "",

    storeEmail:
      typeof input.storeEmail === "string"
        ? input.storeEmail
        : "",

    storePhone:
      typeof input.storePhone === "string"
        ? input.storePhone
        : "",

    storeAddress:
      typeof input.storeAddress === "string"
        ? input.storeAddress
        : "",

    freeShippingThreshold:
      typeof input.freeShippingThreshold ===
        "number" &&
      Number.isFinite(
        input.freeShippingThreshold
      )
        ? input.freeShippingThreshold
        : 0,

    codEnabled:
      input.codEnabled === true,

    stripeEnabled:
      input.stripeEnabled === true,
  };
}

async function readResponse(
  response: Response
): Promise<SettingsApiResponse> {
  try {
    const result: unknown =
      await response.json();

    if (
      result !== null &&
      typeof result === "object" &&
      !Array.isArray(result)
    ) {
      return result as SettingsApiResponse;
    }
  } catch {
    // Handle invalid JSON below.
  }

  return {
    success: false,
    message:
      "Invalid response from server.",
  };
}

function getApiError(
  response: Response,
  data: SettingsApiResponse,
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

  if (response.status === 404) {
    return "Shop settings API is not available yet.";
  }

  return fallback;
}

function validateSettings(
  form: SettingsForm
): string | null {
  const name =
    form.storeName.trim();

  const email =
    form.storeEmail.trim();

  const phone =
    form.storePhone.trim();

  const address =
    form.storeAddress.trim();

  if (
    name.length < 2 ||
    name.length > 100
  ) {
    return "Store name must contain 2–100 characters.";
  }

  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  ) {
    return "Enter a valid support email address.";
  }

  if (
    phone.length < 7 ||
    phone.length > 20 ||
    !/^\+?[0-9\s()-]+$/.test(
      phone
    )
  ) {
    return "Enter a valid contact phone number.";
  }

  if (
    address.length < 5 ||
    address.length > 500
  ) {
    return "Warehouse address must contain 5–500 characters.";
  }

  const thresholdText =
    form.freeShippingThreshold.trim();

  if (
    !/^\d+$/.test(thresholdText)
  ) {
    return "Free shipping threshold must be a whole number.";
  }

  const threshold =
    Number(thresholdText);

  if (
    !Number.isSafeInteger(threshold) ||
    threshold < 0 ||
    threshold > 10000000
  ) {
    return "Free shipping threshold must be between ₹0 and ₹1,00,00,000.";
  }

  if (
    !form.codEnabled &&
    !form.stripeEnabled
  ) {
    return "At least one payment method must remain enabled.";
  }

  return null;
}

/* =========================================
   SHOP SETTINGS PAGE
========================================= */

export default function ShopSettings() {
  const [form, setForm] =
    useState<SettingsForm>(
      INITIAL_FORM
    );

  const [savedForm, setSavedForm] =
    useState<SettingsForm | null>(
      null
    );

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const hasChanges =
    savedForm !== null &&
    JSON.stringify(form) !==
      JSON.stringify(savedForm);

  /* =====================================
     LOAD SETTINGS
  ===================================== */

  const loadSettings = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      setSuccess("");

      try {
        const response =
          await fetch(
            SETTINGS_API,
            {
              method: "GET",
              credentials:
                "same-origin",
              cache: "no-store",
              signal,
            }
          );

        const data =
          await readResponse(
            response
          );

        if (
          !response.ok ||
          data.success !== true ||
          !data.settings
        ) {
          throw new Error(
            getApiError(
              response,
              data,
              "Unable to load shop settings."
            )
          );
        }

        if (signal?.aborted) {
          return;
        }

        const normalized =
          normalizeSettings(
            data.settings
          );

        const loadedForm =
          toForm(normalized);

        setForm(loadedForm);
        setSavedForm(loadedForm);
      } catch (err: unknown) {
        if (signal?.aborted) {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load settings."
        );

        setSavedForm(null);
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

    void loadSettings(
      controller.signal
    );

    return () => {
      controller.abort();
    };
  }, [loadSettings]);

  /* =====================================
     UPDATE FORM
  ===================================== */

  function updateField<
    K extends keyof SettingsForm
  >(
    field: K,
    value: SettingsForm[K]
  ) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));

    setError("");
    setSuccess("");
  }

  /* =====================================
     RESET CHANGES
  ===================================== */

  function handleReset() {
    if (
      !savedForm ||
      saving
    ) {
      return;
    }

    setForm({
      ...savedForm,
    });

    setError("");
    setSuccess("");
  }

  /* =====================================
     SAVE SETTINGS
  ===================================== */

  async function handleSave(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      saving ||
      loading ||
      !savedForm
    ) {
      return;
    }

    const validationError =
      validateSettings(form);

    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const payload: ShopSettingsData = {
      storeName:
        form.storeName.trim(),

      storeEmail:
        form.storeEmail.trim().toLowerCase(),

      storePhone:
        form.storePhone.trim(),

      storeAddress:
        form.storeAddress.trim(),

      freeShippingThreshold:
        Number(
          form.freeShippingThreshold
        ),

      codEnabled:
        form.codEnabled,

      stripeEnabled:
        form.stripeEnabled,
    };

    try {
      const response =
        await fetch(
          SETTINGS_API,
          {
            method: "PUT",
            credentials:
              "same-origin",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify(
              payload
            ),
          }
        );

      const data =
        await readResponse(
          response
        );

      if (
        !response.ok ||
        data.success !== true ||
        !data.settings
      ) {
        throw new Error(
          getApiError(
            response,
            data,
            "Unable to save shop settings."
          )
        );
      }

      const normalized =
        normalizeSettings(
          data.settings
        );

      const updatedForm =
        toForm(normalized);

      setForm(updatedForm);
      setSavedForm(updatedForm);

      setSuccess(
        "Store settings saved successfully."
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save settings."
      );
    } finally {
      setSaving(false);
    }
  }

  /* =====================================
     RENDER
  ===================================== */

  return (
    <AdminLayout>
      <Head>
        <title>
          Shop Settings | KickStreet Admin
        </title>

        <meta
          name="robots"
          content="noindex,nofollow"
        />
      </Head>

      <div className="mx-auto mb-10 w-full max-w-4xl">
        {/* HEADER */}

        <div className="mb-8">
          <h1 className="text-4xl font-black uppercase italic tracking-tighter text-black sm:text-5xl">
            Store{" "}
            <span className="text-orange-600">
              Config
            </span>
          </h1>

          <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">
            KickStreet Core Parameters
          </p>
        </div>

        {/* ERROR */}

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"
          >
            {error}
          </div>
        )}

        {/* SUCCESS */}

        {success && (
          <div
            role="status"
            className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-700"
          >
            {success}
          </div>
        )}

        {/* LOADING */}

        {loading ? (
          <div className="flex min-h-72 flex-col items-center justify-center rounded-3xl bg-white">
            <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-orange-600" />

            <p className="text-xs font-black uppercase text-gray-500">
              Loading Store Settings...
            </p>
          </div>
        ) : !savedForm ? (
          <div className="rounded-3xl border border-gray-100 bg-white p-8 text-center">
            <h2 className="text-lg font-black uppercase text-black">
              Settings Unavailable
            </h2>

            <p className="mt-3 text-sm text-gray-500">
              Store settings could not be loaded.
            </p>

            <button
              type="button"
              onClick={() =>
                void loadSettings()
              }
              className="mt-6 rounded-xl bg-black px-6 py-3 text-xs font-black uppercase text-white"
            >
              Retry
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSave}
            className="rounded-3xl border border-gray-100 bg-white p-6 shadow-lg sm:p-10"
          >
            {/* STORE INFORMATION */}

            <section>
              <div className="mb-6 flex items-center gap-3">
                <span className="h-8 w-2 rounded-full bg-orange-600" />

                <h2 className="text-sm font-black uppercase tracking-widest text-black">
                  Store Information
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {/* STORE NAME */}

                <div>
                  <label
                    htmlFor="store-name"
                    className={labelClass}
                  >
                    Store Name
                  </label>

                  <input
                    id="store-name"
                    type="text"
                    required
                    minLength={2}
                    maxLength={100}
                    value={
                      form.storeName
                    }
                    onChange={(event) =>
                      updateField(
                        "storeName",
                        event.target.value
                      )
                    }
                    disabled={saving}
                    className={inputClass}
                  />
                </div>

                {/* SUPPORT EMAIL */}

                <div>
                  <label
                    htmlFor="store-email"
                    className={labelClass}
                  >
                    Support Email
                  </label>

                  <input
                    id="store-email"
                    type="email"
                    required
                    maxLength={254}
                    value={
                      form.storeEmail
                    }
                    onChange={(event) =>
                      updateField(
                        "storeEmail",
                        event.target.value
                      )
                    }
                    disabled={saving}
                    className={inputClass}
                  />
                </div>

                {/* PHONE */}

                <div>
                  <label
                    htmlFor="store-phone"
                    className={labelClass}
                  >
                    Contact Phone
                  </label>

                  <input
                    id="store-phone"
                    type="tel"
                    required
                    maxLength={20}
                    value={
                      form.storePhone
                    }
                    onChange={(event) =>
                      updateField(
                        "storePhone",
                        event.target.value
                      )
                    }
                    disabled={saving}
                    className={inputClass}
                  />
                </div>

                {/* SHIPPING THRESHOLD */}

                <div>
                  <label
                    htmlFor="shipping-threshold"
                    className={labelClass}
                  >
                    Free Shipping Threshold (₹)
                  </label>

                  <input
                    id="shipping-threshold"
                    type="number"
                    required
                    min="0"
                    max="10000000"
                    step="1"
                    value={
                      form.freeShippingThreshold
                    }
                    onChange={(event) =>
                      updateField(
                        "freeShippingThreshold",
                        event.target.value
                      )
                    }
                    disabled={saving}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* ADDRESS */}

              <div className="mt-6">
                <label
                  htmlFor="store-address"
                  className={labelClass}
                >
                  Warehouse Address
                </label>

                <textarea
                  id="store-address"
                  required
                  minLength={5}
                  maxLength={500}
                  rows={4}
                  value={
                    form.storeAddress
                  }
                  onChange={(event) =>
                    updateField(
                      "storeAddress",
                      event.target.value
                    )
                  }
                  disabled={saving}
                  className={inputClass}
                />
              </div>
            </section>

            {/* PAYMENT METHODS */}

            <section className="mt-10 border-t border-gray-100 pt-10">
              <div className="mb-6 flex items-center gap-3">
                <span className="h-8 w-2 rounded-full bg-black" />

                <h2 className="text-sm font-black uppercase tracking-widest text-black">
                  Payment Gateways
                </h2>
              </div>

              <div className="space-y-4">
                {/* COD */}

                <label className="flex cursor-pointer items-center justify-between gap-5 rounded-2xl border border-gray-100 bg-gray-50 p-5">
                  <div>
                    <p className="text-sm font-black uppercase text-black">
                      Cash on Delivery
                    </p>

                    <p className="mt-1 text-xs text-gray-500">
                      Allow payment upon delivery.
                    </p>
                  </div>

                  <input
                    type="checkbox"
                    checked={
                      form.codEnabled
                    }
                    onChange={(event) =>
                      updateField(
                        "codEnabled",
                        event.target.checked
                      )
                    }
                    disabled={saving}
                    className="h-5 w-5 shrink-0 accent-orange-600"
                    aria-label="Enable Cash on Delivery"
                  />
                </label>

                {/* STRIPE */}

                <label className="flex cursor-pointer items-center justify-between gap-5 rounded-2xl border border-gray-100 bg-gray-50 p-5">
                  <div>
                    <p className="text-sm font-black uppercase text-black">
                      Stripe Secure
                    </p>

                    <p className="mt-1 text-xs text-gray-500">
                      Enable Stripe checkout.
                    </p>
                  </div>

                  <input
                    type="checkbox"
                    checked={
                      form.stripeEnabled
                    }
                    onChange={(event) =>
                      updateField(
                        "stripeEnabled",
                        event.target.checked
                      )
                    }
                    disabled={saving}
                    className="h-5 w-5 shrink-0 accent-orange-600"
                    aria-label="Enable Stripe payments"
                  />
                </label>
              </div>

              <p className="mt-4 text-xs leading-relaxed text-gray-500">
                Payment method settings must also be
                enforced by the checkout APIs.
                Changing these switches alone
                does not disable a payment endpoint.
              </p>
            </section>

            {/* SAVE ACTIONS */}

            <div className="mt-10 border-t border-gray-100 pt-8">
              {hasChanges && (
                <p className="mb-4 text-xs font-bold text-orange-600">
                  You have unsaved changes.
                </p>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={
                    saving || !hasChanges
                  }
                  className="rounded-2xl border border-gray-200 px-7 py-4 text-xs font-black uppercase text-gray-600 transition hover:bg-gray-100 disabled:opacity-40"
                >
                  Discard Changes
                </button>

                <button
                  type="submit"
                  disabled={
                    saving || !hasChanges
                  }
                  className="flex-1 rounded-2xl bg-black px-7 py-5 text-xs font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving
                    ? "Saving Settings..."
                    : "Sync All Changes"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </AdminLayout>
  );
}
