
import {
  useRef,
  useState,
  type FormEvent,
} from "react";

import Head from "next/head";
import Link from "next/link";

import {
  useRouter,
} from "next/router";

import {
  useSession,
} from "next-auth/react";

import toast from "react-hot-toast";

import Navbar from "@/components/Navbar";

/* =========================================
   TYPES
========================================= */

interface RegisterFormData {
  name: string;
  email: string;
  phone: string;
  password: string;
}

interface RegisterResponse {
  success?: boolean;
  message?: string;
  verificationRequired?: boolean;
  emailDeliveryPending?: boolean;
  email?: string;
}

/* =========================================
   CONSTANTS
========================================= */

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PHONE_REGEX =
  /^[6-9]\d{9}$/;

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const MAX_PASSWORD_BYTES = 72;

const INITIAL_FORM: RegisterFormData = {
  name: "",
  email: "",
  phone: "",
  password: "",
};

/* =========================================
   HELPERS
========================================= */

function normalizeForm(
  form: RegisterFormData
): RegisterFormData {
  return {
    name: form.name
      .trim()
      .replace(/\s+/g, " "),

    email: form.email
      .trim()
      .toLowerCase(),

    phone: form.phone
      .replace(/\D/g, ""),

    password: form.password,
  };
}

/* =========================================
   PASSWORD BYTE LENGTH
========================================= */

function getPasswordByteLength(
  password: string
): number {
  return new TextEncoder()
    .encode(password)
    .length;
}

/* =========================================
   FORM VALIDATION
========================================= */

function validateForm(
  form: RegisterFormData
): string | null {
  /* FULL NAME */

  if (
    form.name.length < 2 ||
    form.name.length > 100
  ) {
    return "Name must contain 2 to 100 characters.";
  }

  /* EMAIL */

  if (
    form.email.length === 0 ||
    form.email.length > 254 ||
    !EMAIL_REGEX.test(form.email)
  ) {
    return "Please enter a valid email address.";
  }

  /* PHONE */

  if (
    !PHONE_REGEX.test(form.phone)
  ) {
    return "Enter a valid 10-digit Indian mobile number.";
  }

  /* PASSWORD LENGTH */

  if (
    form.password.length <
      MIN_PASSWORD_LENGTH ||
    form.password.length >
      MAX_PASSWORD_LENGTH
  ) {
    return "Password must contain 8 to 128 characters.";
  }

  /* PASSWORD STRENGTH */

  if (
    !/[A-Za-z]/.test(form.password) ||
    !/[0-9]/.test(form.password)
  ) {
    return "Password must contain at least one letter and one number.";
  }

  /* BCRYPT BYTE LIMIT */

  if (
    getPasswordByteLength(
      form.password
    ) > MAX_PASSWORD_BYTES
  ) {
    return "Password must not exceed 72 UTF-8 bytes.";
  }

  return null;
}

/* =========================================
   API RESPONSE PARSER
========================================= */

async function readApiResponse(
  response: Response
): Promise<RegisterResponse> {
  try {
    const data: unknown =
      await response.json();

    if (
      typeof data === "object" &&
      data !== null &&
      !Array.isArray(data)
    ) {
      return data as RegisterResponse;
    }

    return {};
  } catch {
    return {};
  }
}

/* =========================================
   REGISTER PAGE
========================================= */

export default function Register() {
  const router =
    useRouter();

  const {
    status,
  } = useSession();

  /* FORM STATE */

  const [
    formData,
    setFormData,
  ] = useState<RegisterFormData>(
    INITIAL_FORM
  );

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    showPassword,
    setShowPassword,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const submittingRef =
    useRef(false);

  /* =====================================
     INPUT HANDLER
  ===================================== */

  const updateField = (
    field: keyof RegisterFormData,
    value: string
  ) => {
    setFormData((previous) => ({
      ...previous,
      [field]: value,
    }));

    setError("");
  };

  /* =====================================
     REGISTER HANDLER
  ===================================== */

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (
      submittingRef.current ||
      loading ||
      status === "loading"
    ) {
      return;
    }

    if (
      status === "authenticated"
    ) {
      toast.error(
        "You are already signed in."
      );

      return;
    }

    /* NORMALIZE INPUT */

    const payload =
      normalizeForm(formData);

    /* VALIDATE INPUT */

    const validationError =
      validateForm(payload);

    if (validationError) {
      setError(validationError);
      toast.error(validationError);

      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setError("");

    try {
      /* =================================
         REGISTER REQUEST
      ================================= */

      const response =
        await fetch(
          "/api/auth/register",
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
              JSON.stringify(payload),
          }
        );

      const data =
        await readApiResponse(
          response
        );

      /* =================================
         HANDLE EXISTING UNVERIFIED USER
      ================================= */

      if (
        response.status === 409 &&
        data.verificationRequired === true
      ) {
        toast(
          "Account already exists but needs email verification."
        );

        const navigated =
          await router.push({
            pathname:
              "/auth/otp-verification",

            query: {
              email:
                payload.email,
            },
          });

        if (!navigated) {
          setError(
            "Please open the email verification page."
          );
        }

        return;
      }

      /* =================================
         HANDLE API ERRORS
      ================================= */

      if (
        !response.ok ||
        data.success !== true
      ) {
        const message =
          typeof data.message === "string" &&
          data.message.length > 0
            ? data.message
            : "Registration failed. Please try again.";

        throw new Error(message);
      }

      /* =================================
         REGISTRATION SUCCESS
      ================================= */

      if (
        data.emailDeliveryPending
      ) {
        toast(
          "Account created. Email delivery could not be confirmed. You can request another code."
        );
      } else {
        toast.success(
          "Check your email for the verification code."
        );
      }

      /*
       * Password is never placed
       * in the URL or localStorage.
       */

      const navigated =
        await router.push({
          pathname:
            "/auth/otp-verification",

          query: {
            email:
              payload.email,
          },
        });

      if (!navigated) {
        setError(
          "Account created. Please open the email verification page."
        );
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Connection error. Please try again.";

      setError(message);
      toast.error(message);
    } finally {
      submittingRef.current =
        false;

      setLoading(false);
    }
  };

  /* =====================================
     UI STATE
  ===================================== */

  const isBusy =
    loading ||
    status === "loading" ||
    status === "authenticated";

  /* =====================================
     PAGE UI
  ===================================== */

  return (
    <div className="min-h-screen bg-white selection:bg-orange-500 selection:text-white flex flex-col">
      <Head>
        <title>
          Create Account | KickStreet
        </title>

        <meta
          name="description"
          content="Create your KickStreet account and verify your email to get started."
        />

        <meta
          name="robots"
          content="noindex, nofollow"
        />
      </Head>

      <Navbar />

      {/* MAIN LAYOUT */}

      <main className="flex-grow flex flex-col justify-center items-center px-4 py-8 sm:px-6 sm:py-10 lg:pt-16">
        <div className="w-full max-w-[420px]">

          {/* HEADER */}

          <div className="text-left mb-8">
            <h1 className="text-[14vw] sm:text-6xl font-black italic uppercase tracking-tighter leading-[0.85] mb-4 break-words">
              Join
              <br />

              <span className="text-orange-500">
                The Crew.
              </span>
            </h1>

            <p className="text-gray-500 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] leading-relaxed">
              Start your journey with KickStreet
            </p>
          </div>

          {/* REGISTER FORM */}

          <form
            onSubmit={handleSubmit}
            className="space-y-4 w-full"
            noValidate
          >

            {/* FULL NAME */}

            <div className="group w-full">
              <label
                htmlFor="register-name"
                className="text-[10px] font-black uppercase tracking-[0.2em] ml-2 mb-2 block text-gray-500 group-focus-within:text-black transition-colors"
              >
                Full Name
              </label>

              <input
                id="register-name"
                name="name"
                type="text"
                autoComplete="name"
                placeholder="YOUR FULL NAME"
                value={formData.name}
                onChange={(event) =>
                  updateField(
                    "name",
                    event.target.value
                  )
                }
                minLength={2}
                maxLength={100}
                disabled={isBusy}
                required
                className="w-full p-4 sm:p-5 bg-gray-100 rounded-2xl font-bold text-sm outline-none border-2 border-transparent focus:border-black focus:bg-white transition-all duration-300 disabled:opacity-60"
              />
            </div>

            {/* EMAIL */}

            <div className="group w-full">
              <label
                htmlFor="register-email"
                className="text-[10px] font-black uppercase tracking-[0.2em] ml-2 mb-2 block text-gray-500 group-focus-within:text-black transition-colors"
              >
                Email Address
              </label>

              <input
                id="register-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="YOUR@EMAIL.COM"
                value={formData.email}
                onChange={(event) =>
                  updateField(
                    "email",
                    event.target.value
                  )
                }
                maxLength={254}
                disabled={isBusy}
                required
                className="w-full p-4 sm:p-5 bg-gray-100 rounded-2xl font-bold text-sm outline-none border-2 border-transparent focus:border-black focus:bg-white transition-all duration-300 disabled:opacity-60"
              />
            </div>

            {/* PHONE */}

            <div className="group w-full">
              <label
                htmlFor="register-phone"
                className="text-[10px] font-black uppercase tracking-[0.2em] ml-2 mb-2 block text-gray-500 group-focus-within:text-black transition-colors"
              >
                Phone Number
              </label>

              <input
                id="register-phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="10-DIGIT MOBILE NUMBER"
                value={formData.phone}
                onChange={(event) =>
                  updateField(
                    "phone",
                    event.target.value
                      .replace(/\D/g, "")
                  )
                }
                maxLength={10}
                pattern="[6-9][0-9]{9}"
                disabled={isBusy}
                required
                className="w-full p-4 sm:p-5 bg-gray-100 rounded-2xl font-bold text-sm outline-none border-2 border-transparent focus:border-black focus:bg-white transition-all duration-300 disabled:opacity-60"
              />
            </div>

            {/* PASSWORD */}

            <div className="group w-full">
              <label
                htmlFor="register-password"
                className="text-[10px] font-black uppercase tracking-[0.2em] ml-2 mb-2 block text-gray-500 group-focus-within:text-black transition-colors"
              >
                Security Password
              </label>

              <div className="relative">
                <input
                  id="register-password"
                  name="password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  autoComplete="new-password"
                  placeholder="MINIMUM 8 CHARACTERS"
                  value={
                    formData.password
                  }
                  onChange={(event) =>
                    updateField(
                      "password",
                      event.target.value
                    )
                  }
                  minLength={
                    MIN_PASSWORD_LENGTH
                  }
                  maxLength={
                    MAX_PASSWORD_LENGTH
                  }
                  disabled={isBusy}
                  required
                  className="w-full p-4 pr-20 sm:p-5 sm:pr-20 bg-gray-100 rounded-2xl font-bold text-sm outline-none border-2 border-transparent focus:border-black focus:bg-white transition-all duration-300 disabled:opacity-60"
                />

                {/* SHOW / HIDE */}

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(
                      (previous) =>
                        !previous
                    )
                  }
                  disabled={isBusy}
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                  aria-pressed={
                    showPassword
                  }
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase text-gray-600 hover:text-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500 rounded disabled:opacity-50"
                >
                  {showPassword
                    ? "HIDE"
                    : "SHOW"}
                </button>
              </div>

              <p className="mt-2 ml-2 text-xs text-gray-500">
                8+ characters with at least one letter and one number.
              </p>
            </div>

            {/* FORM ERROR */}

            {error && (
              <div
                id="register-error"
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
              >
                {error}
              </div>
            )}

            {/* SUBMIT BUTTON */}

            <button
              type="submit"
              disabled={isBusy}
              className="w-full bg-black text-white py-5 sm:py-6 rounded-2xl font-black uppercase tracking-[0.2em] hover:bg-orange-600 transition-all shadow-2xl active:scale-95 disabled:bg-gray-300 disabled:cursor-not-allowed flex justify-center items-center mt-4 text-xs sm:text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
            >
              {isBusy ? (
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
                  />

                  {status === "authenticated"
                    ? "ALREADY SIGNED IN"
                    : "INITIALIZING..."}
                </span>
              ) : (
                "CREATE ACCOUNT"
              )}
            </button>
          </form>

          {/* LOGIN LINK */}

          <div className="mt-10 pt-8 border-t border-gray-100 text-center">
            <p className="text-[10px] sm:text-[11px] font-bold text-gray-500 uppercase tracking-widest leading-relaxed">
              Already part of the crew?
              <br />

              <Link
                href="/auth/login"
                className="text-black font-black underline underline-offset-8 decoration-2 decoration-orange-500 hover:text-orange-500 transition-colors mt-4 inline-block"
              >
                SIGN IN TO DASHBOARD
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
