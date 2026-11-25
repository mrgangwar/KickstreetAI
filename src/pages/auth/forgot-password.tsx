
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

interface ForgotPasswordResponse {
  success?: boolean;
  message?: string;
}

/* =========================================
   CONSTANTS
========================================= */

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_EMAIL_LENGTH = 254;

const GENERIC_SUCCESS_MESSAGE =
  "If an eligible account exists, a password reset code will be sent to your email.";

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
    value.length <= MAX_EMAIL_LENGTH &&
    EMAIL_REGEX.test(value)
  );
}

/* =========================================
   SAFE RESPONSE PARSER
========================================= */

async function readApiResponse(
  response: Response
): Promise<ForgotPasswordResponse> {
  try {
    const data: unknown =
      await response.json();

    if (
      typeof data === "object" &&
      data !== null &&
      !Array.isArray(data)
    ) {
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
    }

    return {};
  } catch {
    return {};
  }
}

/* =========================================
   FORGOT PASSWORD PAGE
========================================= */

export default function ForgotPassword() {
  const router =
    useRouter();

  const {
    status,
  } = useSession();

  /* =====================================
     STATE
  ===================================== */

  const [email, setEmail] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  const [submitted, setSubmitted] =
    useState(false);

  /* DUPLICATE REQUEST PROTECTION */

  const submittingRef =
    useRef(false);

  /* =====================================
     SUBMIT HANDLER
  ===================================== */

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (
      submittingRef.current ||
      loading ||
      submitted ||
      status === "loading"
    ) {
      return;
    }

    setError("");
    setMessage("");

    /* =================================
       NORMALIZE EMAIL
    ================================= */

    const normalizedEmail =
      normalizeEmail(email);

    /* =================================
       VALIDATE EMAIL
    ================================= */

    if (
      !isValidEmail(normalizedEmail)
    ) {
      const validationError =
        "Please enter a valid email address.";

      setError(validationError);
      toast.error(validationError);

      return;
    }

    /* =================================
       START REQUEST
    ================================= */

    submittingRef.current = true;
    setLoading(true);

    try {
      /* =================================
         FORGOT PASSWORD API
      ================================= */

      const response =
        await fetch(
          "/api/auth/forgot-password",
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
                email: normalizedEmail,
              }),
          }
        );

      const data =
        await readApiResponse(
          response
        );

      /* =================================
         HANDLE API FAILURE
      ================================= */

      if (
        !response.ok ||
        data.success !== true
      ) {
        const apiError =
          data.message ||
          "Unable to process your request. Please try again.";

        throw new Error(apiError);
      }

      /* =================================
         SUCCESS
      ================================= */

      setSubmitted(true);

      setMessage(
        GENERIC_SUCCESS_MESSAGE
      );

      toast.success(
        "Request processed. Check your email."
      );

      /* =================================
         NAVIGATE TO RESET PAGE
      ================================= */

      /*
       * Only email is passed in URL.
       *
       * Never place OTP or password
       * in URL query parameters.
       */

      try {
        const navigated =
          await router.push({
            pathname:
              "/auth/reset-password",

            query: {
              email:
                normalizedEmail,
            },
          });

        if (!navigated) {
          setError(
            "Please continue to the password reset page."
          );
        }
      } catch {
        setError(
          "Please continue to the password reset page."
        );
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Connection error. Please try again.";

      setError(errorMessage);
      toast.error(errorMessage);
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
    status === "loading";

  const canSubmit =
    !isBusy &&
    !submitted;

  /* =====================================
     PAGE UI
  ===================================== */

  return (
    <div className="min-h-screen bg-white selection:bg-orange-500 selection:text-white flex flex-col">
      <Head>
        <title>
          Forgot Password | KickStreet
        </title>

        <meta
          name="description"
          content="Request a password reset verification code for your KickStreet account."
        />

        <meta
          name="robots"
          content="noindex, nofollow"
        />
      </Head>

      <Navbar />

      {/* MAIN LAYOUT */}

      <main className="flex-grow flex flex-col justify-center items-center px-4 py-8 sm:px-6 sm:py-12 lg:pt-20">
        <div className="w-full max-w-[400px]">

          {/* HEADER */}

          <div className="text-left mb-8 sm:mb-10">
            <h1 className="text-[13vw] sm:text-6xl font-black italic uppercase tracking-tighter leading-[0.85] mb-4 break-words">
              Reset
              <br />

              <span className="text-orange-500">
                Password.
              </span>
            </h1>

            <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] leading-relaxed">
              Enter your email to receive OTP
            </p>
          </div>

          {/* SUCCESS MESSAGE */}

          {message && (
            <div
              role="status"
              className="bg-green-50 border-l-4 border-green-600 p-4 mb-6 rounded-r-xl"
            >
              <p className="text-green-700 text-xs font-bold leading-relaxed">
                {message}
              </p>

              {submitted && (
                <Link
                  href={{
                    pathname:
                      "/auth/reset-password",

                    query: {
                      email:
                        normalizeEmail(email),
                    },
                  }}
                  className="inline-block mt-3 text-xs font-black uppercase underline underline-offset-4 text-green-800"
                >
                  Continue to Reset Password
                </Link>
              )}
            </div>
          )}

          {/* ERROR MESSAGE */}

          {error && (
            <div
              id="forgot-password-error"
              role="alert"
              className="bg-red-50 border-l-4 border-red-600 p-4 mb-6 rounded-r-xl"
            >
              <p className="text-red-700 text-xs font-bold leading-relaxed">
                {error}
              </p>
            </div>
          )}

          {/* FORM */}

          <form
            onSubmit={handleSubmit}
            className="space-y-4"
            noValidate
          >
            {/* EMAIL */}

            <div className="group">
              <label
                htmlFor="forgot-password-email"
                className="text-[10px] font-black uppercase tracking-[0.2em] ml-2 mb-2 block text-gray-500 group-focus-within:text-black transition-colors"
              >
                Email Address
              </label>

              <input
                id="forgot-password-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="YOUR@EMAIL.COM"
                value={email}
                onChange={(event) => {
                  setEmail(
                    event.target.value
                  );

                  setError("");
                  setMessage("");
                  setSubmitted(false);
                }}
                maxLength={
                  MAX_EMAIL_LENGTH
                }
                disabled={isBusy}
                required
                aria-invalid={
                  Boolean(error)
                }
                aria-describedby={
                  error
                    ? "forgot-password-error"
                    : undefined
                }
                className="w-full p-4 sm:p-5 bg-gray-100 rounded-2xl font-bold text-sm outline-none border-2 border-transparent focus:border-black focus:bg-white transition-all duration-300 disabled:opacity-60"
              />
            </div>

            {/* SUBMIT BUTTON */}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-black text-white py-5 sm:py-6 rounded-2xl font-black uppercase tracking-[0.2em] hover:bg-orange-600 transition-all shadow-2xl active:scale-95 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed flex justify-center items-center text-xs sm:text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
                  />

                  SENDING REQUEST...
                </span>
              ) : submitted ? (
                "REQUEST PROCESSED"
              ) : (
                "SEND OTP"
              )}
            </button>
          </form>

          {/* FOOTER */}

          <div className="mt-10 sm:mt-12 pt-8 border-t border-gray-100 text-center">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest leading-relaxed">
              Remember your password?
              <br />

              <Link
                href="/auth/login"
                className="text-black font-black underline underline-offset-8 decoration-2 decoration-orange-500 hover:text-orange-500 transition-colors mt-4 inline-block"
              >
                SIGN IN
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
