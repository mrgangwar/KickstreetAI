
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

import toast from "react-hot-toast";

import Navbar from "@/components/Navbar";

/* =========================================
   TYPES
========================================= */

interface ResetPasswordResponse {
  success?: boolean;
  message?: string;
}

/* =========================================
   CONSTANTS
========================================= */

const OTP_LENGTH = 6;

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const OTP_REGEX =
  /^\d{6}$/;

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const MAX_PASSWORD_BYTES = 72;

/* =========================================
   HELPERS
========================================= */

function getValidEmail(
  value: unknown
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const email =
    value.trim().toLowerCase();

  if (
    email.length === 0 ||
    email.length > 254 ||
    !EMAIL_REGEX.test(email)
  ) {
    return null;
  }

  return email;
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
   PASSWORD VALIDATION
========================================= */

function validatePassword(
  password: string,
  confirmation: string
): string | null {
  if (
    password.length <
      MIN_PASSWORD_LENGTH ||
    password.length >
      MAX_PASSWORD_LENGTH
  ) {
    return "Password must contain 8 to 128 characters.";
  }

  if (
    !/[A-Za-z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    return "Password must contain at least one letter and one number.";
  }

  if (
    getPasswordByteLength(
      password
    ) > MAX_PASSWORD_BYTES
  ) {
    return "Password must not exceed 72 UTF-8 bytes.";
  }

  if (
    password !== confirmation
  ) {
    return "Passwords do not match.";
  }

  return null;
}

/* =========================================
   SAFE API RESPONSE PARSER
========================================= */

async function readApiResponse(
  response: Response
): Promise<ResetPasswordResponse> {
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
   RESET PASSWORD PAGE
========================================= */

export default function ResetPassword() {
  const router =
    useRouter();

  /* =====================================
     FORM STATE
  ===================================== */

  const [otp, setOtp] =
    useState("");

  const [
    newPassword,
    setNewPassword,
  ] = useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  const [
    showPassword,
    setShowPassword,
  ] = useState(false);

  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] = useState(false);

  const [loading, setLoading] =
    useState(false);

  const [success, setSuccess] =
    useState(false);

  const [error, setError] =
    useState("");

  /* DUPLICATE REQUEST PROTECTION */

  const submittingRef =
    useRef(false);

  /* =====================================
     EMAIL FROM QUERY
  ===================================== */

  const email =
    router.isReady
      ? getValidEmail(
          router.query.email
        )
      : null;

  /* =====================================
     FORM VALIDATION
  ===================================== */

  const validateForm =
    (): string | null => {
      if (!email) {
        return "Invalid email address. Please request a new reset code.";
      }

      if (!OTP_REGEX.test(otp)) {
        return "Enter a valid 6-digit OTP.";
      }

      return validatePassword(
        newPassword,
        confirmPassword
      );
    };

  /* =====================================
     RESET PASSWORD HANDLER
  ===================================== */

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (
      submittingRef.current ||
      loading ||
      success ||
      !router.isReady
    ) {
      return;
    }

    setError("");

    /* =================================
       VALIDATE FORM
    ================================= */

    const validationError =
      validateForm();

    if (validationError) {
      setError(validationError);
      toast.error(validationError);

      return;
    }

    if (!email) {
      return;
    }

    /* =================================
       START REQUEST
    ================================= */

    submittingRef.current = true;
    setLoading(true);

    try {
      /* =================================
         RESET PASSWORD API
      ================================= */

      const response =
        await fetch(
          "/api/auth/reset-password",
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
                otp,
                newPassword,
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
        const message =
          data.message ||
          "Password reset failed. Please try again.";

        throw new Error(message);
      }

      /* =================================
         SUCCESS
      ================================= */

      setSuccess(true);

      /*
       * Clear sensitive fields
       * after successful reset.
       */

      setOtp("");
      setNewPassword("");
      setConfirmPassword("");

      toast.success(
        "Password reset successful."
      );

      /* =================================
         REDIRECT TO LOGIN
      ================================= */

      try {
        const navigated =
          await router.replace({
            pathname:
              "/auth/login",

            query: {
              reset: "true",
            },
          });

        if (!navigated) {
          toast.error(
            "Please continue to the login page."
          );
        }
      } catch {
        toast.error(
          "Password reset succeeded. Please open the login page."
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
    loading || success;

  /* =====================================
     PAGE UI
  ===================================== */

  return (
    <div className="min-h-screen bg-white selection:bg-orange-500 selection:text-white overflow-x-hidden flex flex-col">
      <Head>
        <title>
          Reset Password | KickStreet
        </title>

        <meta
          name="description"
          content="Reset your KickStreet account password securely using an email verification code."
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
              Enter
              <br />

              <span className="text-orange-500">
                New Password.
              </span>
            </h1>

            <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] leading-relaxed">
              Enter OTP and set your new password
            </p>
          </div>

          {/* ROUTER LOADING */}

          {!router.isReady ? (
            <p
              role="status"
              className="text-sm font-bold text-gray-500"
            >
              Loading password reset...
            </p>
          ) : !email ? (

            /* INVALID EMAIL */

            <div className="rounded-2xl bg-gray-50 p-6">
              <p className="text-sm font-bold text-red-600">
                Invalid password reset link.
              </p>

              <p className="mt-3 text-sm text-gray-600">
                Please request a new password reset code.
              </p>

              <Link
                href="/auth/forgot-password"
                className="inline-block mt-6 rounded-xl bg-black px-6 py-3 text-xs font-black uppercase text-white hover:bg-orange-600 transition-colors"
              >
                Request Reset Code
              </Link>
            </div>
          ) : success ? (

            /* SUCCESS */

            <div
              role="status"
              className="rounded-2xl border border-green-200 bg-green-50 p-6"
            >
              <p className="font-black uppercase text-green-700">
                Password Reset Successful
              </p>

              <p className="mt-3 text-sm text-gray-600">
                Your password has been updated.
                You can now sign in with your
                new password.
              </p>

              <Link
                href="/auth/login"
                className="inline-block mt-5 text-sm font-black underline underline-offset-4"
              >
                Continue to Login
              </Link>
            </div>
          ) : (

            /* RESET FORM */

            <form
              onSubmit={handleSubmit}
              className="space-y-4 w-full"
              noValidate
            >

              {/* EMAIL */}

              <div className="group w-full">
                <label
                  htmlFor="reset-email"
                  className="text-[10px] font-black uppercase tracking-[0.2em] ml-2 mb-2 block text-gray-500"
                >
                  Email Address
                </label>

                <input
                  id="reset-email"
                  name="email"
                  type="email"
                  value={email}
                  readOnly
                  autoComplete="email"
                  className="w-full p-4 sm:p-5 bg-gray-100 rounded-2xl font-bold text-sm text-gray-600 border-2 border-transparent"
                />
              </div>

              {/* OTP */}

              <div className="group w-full">
                <label
                  htmlFor="reset-otp"
                  className="text-[10px] font-black uppercase tracking-[0.2em] ml-2 mb-2 block text-gray-500 group-focus-within:text-black transition-colors"
                >
                  OTP Code
                </label>

                <input
                  id="reset-otp"
                  name="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  placeholder="000000"
                  value={otp}
                  onChange={(event) => {
                    setOtp(
                      event.target.value
                        .replace(/\D/g, "")
                        .slice(
                          0,
                          OTP_LENGTH
                        )
                    );

                    setError("");
                  }}
                  maxLength={
                    OTP_LENGTH
                  }
                  disabled={isBusy}
                  required
                  className="w-full p-4 sm:p-5 bg-gray-100 rounded-2xl font-bold text-sm tracking-[0.3em] outline-none border-2 border-transparent focus:border-black focus:bg-white transition-all duration-300 disabled:opacity-60"
                />
              </div>

              {/* NEW PASSWORD */}

              <div className="group w-full">
                <label
                  htmlFor="reset-new-password"
                  className="text-[10px] font-black uppercase tracking-[0.2em] ml-2 mb-2 block text-gray-500 group-focus-within:text-black transition-colors"
                >
                  New Password
                </label>

                <div className="relative">
                  <input
                    id="reset-new-password"
                    name="newPassword"
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    autoComplete="new-password"
                    placeholder="MINIMUM 8 CHARACTERS"
                    value={newPassword}
                    onChange={(event) => {
                      setNewPassword(
                        event.target.value
                      );

                      setError("");
                    }}
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
                        ? "Hide new password"
                        : "Show new password"
                    }
                    aria-pressed={
                      showPassword
                    }
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase text-gray-600 hover:text-orange-500 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500 disabled:opacity-50"
                  >
                    {showPassword
                      ? "HIDE"
                      : "SHOW"}
                  </button>
                </div>
              </div>

              {/* CONFIRM PASSWORD */}

              <div className="group w-full">
                <label
                  htmlFor="reset-confirm-password"
                  className="text-[10px] font-black uppercase tracking-[0.2em] ml-2 mb-2 block text-gray-500 group-focus-within:text-black transition-colors"
                >
                  Confirm Password
                </label>

                <div className="relative">
                  <input
                    id="reset-confirm-password"
                    name="confirmPassword"
                    type={
                      showConfirmPassword
                        ? "text"
                        : "password"
                    }
                    autoComplete="new-password"
                    placeholder="CONFIRM NEW PASSWORD"
                    value={
                      confirmPassword
                    }
                    onChange={(event) => {
                      setConfirmPassword(
                        event.target.value
                      );

                      setError("");
                    }}
                    maxLength={
                      MAX_PASSWORD_LENGTH
                    }
                    disabled={isBusy}
                    required
                    className="w-full p-4 pr-20 sm:p-5 sm:pr-20 bg-gray-100 rounded-2xl font-bold text-sm outline-none border-2 border-transparent focus:border-black focus:bg-white transition-all duration-300 disabled:opacity-60"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowConfirmPassword(
                        (previous) =>
                          !previous
                      )
                    }
                    disabled={isBusy}
                    aria-label={
                      showConfirmPassword
                        ? "Hide confirmation password"
                        : "Show confirmation password"
                    }
                    aria-pressed={
                      showConfirmPassword
                    }
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase text-gray-600 hover:text-orange-500 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500 disabled:opacity-50"
                  >
                    {showConfirmPassword
                      ? "HIDE"
                      : "SHOW"}
                  </button>
                </div>
              </div>

              {/* PASSWORD REQUIREMENTS */}

              <p className="text-xs text-gray-500 ml-2">
                Use at least 8 characters,
                including one letter and one number.
              </p>

              {/* ERROR MESSAGE */}

              {error && (
                <div
                  id="reset-password-error"
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
                >
                  {error}
                </div>
              )}

              {/* SUBMIT BUTTON */}

              <button
                type="submit"
                disabled={
                  isBusy ||
                  otp.length !==
                    OTP_LENGTH
                }
                className="w-full bg-black text-white py-5 sm:py-6 rounded-2xl font-black uppercase tracking-[0.2em] hover:bg-orange-600 transition-all shadow-2xl active:scale-95 disabled:bg-gray-200 disabled:text-gray-500 flex justify-center items-center mt-2 text-xs sm:text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
                    />

                    RESETTING...
                  </span>
                ) : (
                  "RESET PASSWORD"
                )}
              </button>
            </form>
          )}

          {/* FOOTER */}

          <div className="mt-10 sm:mt-12 pt-8 border-t border-gray-100 text-center">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest leading-relaxed">
              Didn't receive OTP?
              <br />

              <Link
                href="/auth/forgot-password"
                className="text-black font-black underline underline-offset-8 decoration-2 decoration-orange-500 hover:text-orange-500 transition-colors mt-4 inline-block"
              >
                REQUEST NEW CODE
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
