
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Toast from "@/components/Toast";

interface ShippingAddress {
  line1: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string;
}

interface UserData {
  name: string;
  email: string;
  phone: string;
  shippingAddress?: Partial<ShippingAddress>;
}

interface ProfileResponse {
  success?: boolean;
  user?: UserData;
  message?: string;
}

interface ProfileForm {
  name: string;
  phone: string;
  line1: string;
  city: string;
  state: string;
  postal_code: string;
  addressPhone: string;
}

type ToastType = "success" | "error";

const EMPTY_FORM: ProfileForm = {
  name: "",
  phone: "",
  line1: "",
  city: "",
  state: "",
  postal_code: "",
  addressPhone: "",
};

const isValidIndianPhone = (value: string) => {
  return /^[6-9]\d{9}$/.test(value);
};

const isValidIndianPincode = (value: string) => {
  return /^[1-9]\d{5}$/.test(value);
};

const getErrorMessage = (error: unknown) => {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
};

export default function Profile() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [formData, setFormData] =
    useState<ProfileForm>({ ...EMPTY_FORM });

  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: ToastType;
  }>({
    show: false,
    message: "",
    type: "success",
  });

  const [retryCount, setRetryCount] = useState(0);

  const mountedRef = useRef(true);
  const savingRef = useRef(false);

  const customerEmail = session?.user?.email ?? "";

  const showToast = useCallback(
    (message: string, type: ToastType = "success") => {
      setToast({
        show: true,
        message,
        type,
      });
    },
    []
  );

  const updateField = (
    field: keyof ProfileForm,
    value: string
  ) => {
    setFormData((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const fetchProfile = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setLoadError("");

      try {
        const response = await fetch("/api/auth/profile", {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          credentials: "same-origin",
          cache: "no-store",
          signal,
        });

        if (response.status === 401) {
          throw new Error(
            "Your session has expired. Please sign in again."
          );
        }

        const data: ProfileResponse = await response.json();

        if (!response.ok || !data.user) {
          throw new Error(
            data.message || "Unable to load your profile."
          );
        }

        if (signal.aborted) return;

        const user = data.user;
        const address = user.shippingAddress;

        setFormData({
          name: user.name || "",
          phone: user.phone || "",
          line1: address?.line1 || "",
          city: address?.city || "",
          state: address?.state || "",
          postal_code: address?.postal_code || "",
          addressPhone: address?.phone || "",
        });
      } catch (error) {
        if (signal.aborted) return;

        setLoadError(getErrorMessage(error));
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/auth/login");
      return;
    }

    if (status !== "authenticated") {
      return;
    }

    const controller = new AbortController();

    fetchProfile(controller.signal);

    return () => {
      controller.abort();
    };
  }, [status, customerEmail, retryCount, fetchProfile, router]);

  const validateForm = (data: ProfileForm) => {
    if (data.name.length < 2) {
      return "Full name must contain at least 2 characters.";
    }

    if (!isValidIndianPhone(data.phone)) {
      return "Enter a valid 10-digit Indian mobile number.";
    }

    const addressFields = [
      data.line1,
      data.city,
      data.state,
      data.postal_code,
      data.addressPhone,
    ];

    const hasAddress = addressFields.some(Boolean);

    if (hasAddress) {
      if (data.line1.length < 5) {
        return "Please enter your complete shipping address.";
      }

      if (!data.city) {
        return "Please enter your city.";
      }

      if (!data.state) {
        return "Please enter your state.";
      }

      if (!isValidIndianPincode(data.postal_code)) {
        return "Enter a valid 6-digit Indian PIN code.";
      }

      if (!isValidIndianPhone(data.addressPhone)) {
        return "Enter a valid shipping contact number.";
      }
    }

    return null;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (savingRef.current) return;

    const cleaned: ProfileForm = {
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      line1: formData.line1.trim(),
      city: formData.city.trim(),
      state: formData.state.trim(),
      postal_code: formData.postal_code.trim(),
      addressPhone: formData.addressPhone.trim(),
    };

    const validationError = validateForm(cleaned);

    if (validationError) {
      showToast(validationError, "error");
      return;
    }

    savingRef.current = true;
    setSaving(true);

    try {
      const response = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          name: cleaned.name,
          phone: cleaned.phone,
          shippingAddress: {
            line1: cleaned.line1,
            city: cleaned.city,
            state: cleaned.state,
            postal_code: cleaned.postal_code,
            country: "IN",
            phone: cleaned.addressPhone,
          },
        }),
      });

      const data: ProfileResponse = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to update your profile."
        );
      }

      if (!data.user) {
        throw new Error(
          "Profile update could not be confirmed."
        );
      }

      if (!mountedRef.current) return;

      const updatedUser = data.user;
      const address = updatedUser.shippingAddress;

      setFormData({
        name: updatedUser.name || cleaned.name,
        phone: updatedUser.phone || cleaned.phone,
        line1: address?.line1 ?? cleaned.line1,
        city: address?.city ?? cleaned.city,
        state: address?.state ?? cleaned.state,
        postal_code:
          address?.postal_code ?? cleaned.postal_code,
        addressPhone:
          address?.phone ?? cleaned.addressPhone,
      });

      showToast("Profile updated successfully!", "success");
    } catch (error) {
      if (mountedRef.current) {
        showToast(getErrorMessage(error), "error");
      }
    } finally {
      savingRef.current = false;

      if (mountedRef.current) {
        setSaving(false);
      }
    }
  };

  const handleLogout = async () => {
    await signOut({
      callbackUrl: "/",
    });
  };

  const retryProfile = () => {
    setRetryCount((count) => count + 1);
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        <Head>
          <title>Loading Profile | KickStreet</title>
        </Head>

        <div
          className="animate-spin rounded-full h-12 w-12 border-4 border-gray-100 border-t-orange-600"
          role="status"
          aria-label="Loading profile"
        />

        <p className="mt-6 text-xs uppercase font-black tracking-widest text-gray-400">
          Loading Your Profile...
        </p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <p className="text-sm font-bold text-gray-500">
          Redirecting to login...
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen selection:bg-orange-600 selection:text-white flex flex-col">
      <Head>
        <title>My Profile | KickStreet</title>
        <meta
          name="robots"
          content="noindex, nofollow"
        />
      </Head>

      <Navbar />

      <section className="flex-grow w-full px-4 sm:px-6 py-8 sm:py-12">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 mb-8">
            <h1 className="text-3xl sm:text-4xl font-black italic uppercase tracking-tighter">
              My Profile
            </h1>

            <button
              type="button"
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-red-600 font-medium"
            >
              Logout
            </button>
          </div>

          {loadError ? (
            <div
              className="rounded-2xl border border-red-100 bg-red-50 p-8 text-center"
              role="alert"
            >
              <h2 className="font-black uppercase italic text-xl mb-3">
                Unable to Load Profile
              </h2>

              <p className="text-sm text-gray-600 mb-6">
                {loadError}
              </p>

              <div className="flex flex-wrap gap-3 justify-center">
                <button
                  type="button"
                  onClick={retryProfile}
                  className="bg-orange-600 text-white px-8 py-3 rounded-full text-xs font-black uppercase hover:bg-orange-700"
                >
                  Try Again
                </button>

                <button
                  type="button"
                  onClick={() => router.push("/auth/login")}
                  className="bg-black text-white px-8 py-3 rounded-full text-xs font-black uppercase"
                >
                  Sign In
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="space-y-6"
              noValidate
            >
              {/* SoleMatch AI Preferences Quick Link */}
              <div className="bg-orange-50/70 border border-orange-200 rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-black uppercase text-orange-600 tracking-wider block">
                    SoleMatch AI Integration
                  </span>
                  <h3 className="text-base font-black uppercase italic text-gray-900">
                    Your Sneaker Matchmaker Profile
                  </h3>
                  <p className="text-xs text-gray-600 mt-0.5">
                    Configure your style, preferred brands, and comfort priorities to get tailored shoe picks.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href="/recommendations"
                    className="px-4 py-2.5 rounded-xl bg-orange-600 text-white font-black text-xs uppercase italic tracking-wider hover:bg-orange-700 transition shrink-0"
                  >
                    AI Matchmaker →
                  </Link>
                  <Link
                    href="/compare"
                    className="px-3 py-2.5 rounded-xl border border-gray-300 font-bold text-xs uppercase text-gray-700 hover:border-black transition shrink-0"
                  >
                    Compare
                  </Link>
                </div>
              </div>

              {/* Personal Information */}
              <div className="bg-gray-50 rounded-2xl p-4 sm:p-6">
                <h2 className="text-lg font-bold uppercase italic mb-4">
                  Personal Information
                </h2>

                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="profile-name"
                      className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2"
                    >
                      Full Name
                    </label>

                    <input
                      id="profile-name"
                      type="text"
                      autoComplete="name"
                      required
                      minLength={2}
                      maxLength={100}
                      value={formData.name}
                      onChange={(event) =>
                        updateField("name", event.target.value)
                      }
                      className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Your full name"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="profile-email"
                      className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2"
                    >
                      Email Address
                    </label>

                    <input
                      id="profile-email"
                      type="email"
                      value={customerEmail}
                      disabled
                      className="w-full p-3 rounded-xl border border-gray-200 text-sm bg-gray-100 text-gray-500"
                    />

                    <p className="text-xs text-gray-400 mt-1">
                      Email cannot be changed.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="profile-phone"
                      className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2"
                    >
                      Phone Number
                    </label>

                    <input
                      id="profile-phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      required
                      maxLength={10}
                      value={formData.phone}
                      onChange={(event) =>
                        updateField(
                          "phone",
                          event.target.value.replace(/\D/g, "")
                        )
                      }
                      className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="10-digit mobile number"
                    />
                  </div>
                </div>
              </div>

              {/* Shipping Address */}
              <div className="bg-gray-50 rounded-2xl p-4 sm:p-6">
                <h2 className="text-lg font-bold uppercase italic mb-2">
                  Shipping Address
                </h2>

                <p className="text-xs text-gray-400 mb-5">
                  Add your address for easier checkout.
                  Leave all address fields empty if you
                  do not want to save an address yet.
                </p>

                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="shipping-address"
                      className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2"
                    >
                      Full Address
                    </label>

                    <textarea
                      id="shipping-address"
                      autoComplete="street-address"
                      rows={3}
                      value={formData.line1}
                      onChange={(event) =>
                        updateField("line1", event.target.value)
                      }
                      className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="House number, street, landmark"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="shipping-city"
                        className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2"
                      >
                        City
                      </label>

                      <input
                        id="shipping-city"
                        type="text"
                        autoComplete="address-level2"
                        value={formData.city}
                        onChange={(event) =>
                          updateField("city", event.target.value)
                        }
                        className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="City"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="shipping-state"
                        className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2"
                      >
                        State
                      </label>

                      <input
                        id="shipping-state"
                        type="text"
                        autoComplete="address-level1"
                        value={formData.state}
                        onChange={(event) =>
                          updateField("state", event.target.value)
                        }
                        className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="State"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="shipping-pincode"
                        className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2"
                      >
                        Pincode
                      </label>

                      <input
                        id="shipping-pincode"
                        type="text"
                        inputMode="numeric"
                        autoComplete="postal-code"
                        maxLength={6}
                        value={formData.postal_code}
                        onChange={(event) =>
                          updateField(
                            "postal_code",
                            event.target.value.replace(/\D/g, "")
                          )
                        }
                        className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="6-digit PIN code"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="shipping-phone"
                        className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2"
                      >
                        Contact Number
                      </label>

                      <input
                        id="shipping-phone"
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        value={formData.addressPhone}
                        onChange={(event) =>
                          updateField(
                            "addressPhone",
                            event.target.value.replace(/\D/g, "")
                          )
                        }
                        className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="Delivery contact number"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <button
                type="submit"
                disabled={saving}
                className="w-full py-4 rounded-full bg-orange-600 text-white font-black uppercase text-sm tracking-wider hover:bg-orange-700 transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving Changes..." : "Save Changes"}
              </button>
            </form>
          )}
        </div>
      </section>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.show}
        onClose={() =>
          setToast((previous) => ({
            ...previous,
            show: false,
          }))
        }
      />
    </div>
  );
}
