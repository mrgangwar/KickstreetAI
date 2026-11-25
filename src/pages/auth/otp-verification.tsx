
import {
  useEffect,
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

interface ApiResponse {
  success?: boolean;
  message?: string;
}

/* =========================================
   CONSTANTS
========================================= */

const OTP_LENGTH = 6;

const RESEND_COOLDOWN_SECONDS = 30;

const RESEND_COOLDOWN_MS =
  RESEND_COOLDOWN_SECONDS * 1000;

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const OTP_REGEX =
  /^\d{6}$/;

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
   SAFE API RESPONSE PARSER
========================================= */

async function readApiResponse(
  response: Response
): Promise<ApiResponse> {
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
   OTP VERIFICATION PAGE
========================================= */

export default function OTPVerification() {
  const router =
    useRouter();

  /* =====================================
     STATE
  ===================================== */

  const [otp, setOtp] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [resending, setResending] =
    useState(false);

  const [verified, setVerified] =
    useState(false);

  const [error, setError] =
    useState("");

  const [
    cooldown,
    setCooldown,
  ] = useState(
    RESEND_COOLDOWN_SECONDS
  );

  /* =====================================
     REFS
  ===================================== */

  const verifyInProgress =
    useRef(false);

  const resendInProgress =
    useRef(false);

  const cooldownDeadline =
    useRef<number | null>(null);

  const activeEmailRef =
    useRef<string | null>(null);

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
     COOLDOWN HELPER
  ===================================== */

  const startCooldown = (
    seconds: number
  ) => {
    const safeSeconds =
      Math.max(
        0,
        Math.ceil(seconds)
      );

    cooldownDeadline.current =
      Date.now() +
      safeSeconds * 1000;

    setCooldown(safeSeconds);
  };

  /* =====================================
     INITIALIZE COOLDOWN
  ===================================== */

  useEffect(() => {
    if (
      !router.isReady ||
      !email
    ) {
      return;
    }

    if (
      activeEmailRef.current ===
      email
    ) {
      return;
    }

    activeEmailRef.current =
      email;

    setOtp("");
    setError("");
    setVerified(false);

    cooldownDeadline.current =
      Date.now() +
      RESEND_COOLDOWN_MS;

    setCooldown(
      RESEND_COOLDOWN_SECONDS
    );
  }, [
    router.isReady,
    email,
  ]);

  /* =====================================
     DEADLINE-BASED COUNTDOWN
  ===================================== */

  useEffect(() => {
    if (
      !router.isReady ||
      !email ||
      verified
    ) {
      return;
    }

    const updateCountdown = () => {
      const deadline =
        cooldownDeadline.current;

      if (deadline === null) {
        return;
      }

      const remaining =
        Math.max(
          0,
          Math.ceil(
            (deadline - Date.now()) /
              1000
          )
        );

      setCooldown(remaining);
    };

    updateCountdown();

    const interval =
      window.setInterval(
        updateCountdown,
        1000
      );

    const handleVisibilityChange =
      () => {
        if (
          document.visibilityState ===
          "visible"
        ) {
          updateCountdown();
        }
      };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      window.clearInterval(
        interval
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [
    router.isReady,
    email,
    verified,
  ]);

  /* =====================================
     VERIFY OTP
  ===================================== */

  const handleVerify = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (
      verifyInProgress.current ||
      resendInProgress.current ||
      loading ||
      resending ||
      verified
    ) {
      return;
    }

    if (!email) {
      const message =
        "Invalid email. Please register again.";

      setError(message);
      toast.error(message);

      return;
    }

    if (!OTP_REGEX.test(otp)) {
      const message =
        "Enter a valid 6-digit code.";

      setError(message);
      toast.error(message);

      return;
    }

    verifyInProgress.current =
      true;

    setLoading(true);
    setError("");

    try {
      /* =================================
         VERIFY REQUEST
      ================================= */

      const response =
        await fetch(
          "/api/auth/verify-otp",
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
          "Invalid or expired verification code.";

        throw new Error(message);
      }

      /* =================================
         VERIFICATION SUCCESS
      ================================= */

      setVerified(true);

      toast.success(
        "Account verified successfully."
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
              verified: "true",
            },
          });

        if (!navigated) {
          toast.error(
            "Please continue to the login page."
          );
        }
      } catch {
        toast.error(
          "Verification succeeded. Please open the login page."
        );
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Verification failed. Please try again.";

      setError(message);
      toast.error(message);
    } finally {
      verifyInProgress.current =
        false;

      setLoading(false);
    }
  };

  /* =====================================
     RESEND OTP
  ===================================== */

  const handleResend =
    async () => {
      if (
        !email ||
        cooldown > 0 ||
        resending ||
        loading ||
        verified ||
        resendInProgress.current ||
        verifyInProgress.current
      ) {
        return;
      }

      resendInProgress.current =
        true;

      setResending(true);
      setError("");

      try {
        /* =================================
           RESEND REQUEST
        ================================= */

        const response =
          await fetch(
            "/api/auth/resend-otp",
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

        /* =================================
           SERVER COOLDOWN
        ================================= */

        if (
          response.status === 429
        ) {
          startCooldown(
            RESEND_COOLDOWN_SECONDS
          );

          const message =
            data.message ||
            "Please wait before requesting another code.";

          setError(message);
          toast.error(message);

          return;
        }

        /* =================================
           HANDLE FAILURE
        ================================= */

        if (
          !response.ok ||
          data.success !== true
        ) {
          const message =
            data.message ||
            "Could not resend verification code.";

          throw new Error(message);
        }

        /* =================================
           SUCCESS
        ================================= */

        setOtp("");

        startCooldown(
          RESEND_COOLDOWN_SECONDS
        );

        /*
         * The resend endpoint can
         * return a generic response
         * without confirming whether
         * a new email was sent.
         */

        toast.success(
          "Request processed. Check your email for a verification code."
        );
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : "Resend failed. Please try again.";

        setError(message);
        toast.error(message);
      } finally {
        resendInProgress.current =
          false;

        setResending(false);
      }
    };

  /* =====================================
     UI STATE
  ===================================== */

  const isBusy =
    loading || resending;

  /* =====================================
     PAGE UI
  ===================================== */

  return (
    <div className="min-h-screen bg-white selection:bg-orange-500 selection:text-white flex flex-col">
      <Head>
        <title>
          Verify Email | KickStreet
        </title>

        <meta
          name="description"
          content="Verify your email address to activate your KickStreet account."
        />

        <meta
          name="robots"
          content="noindex, nofollow"
        />
      </Head>

      <Navbar />

      {/* MAIN LAYOUT */}

      <main className="flex-grow flex flex-col justify-center items-center px-4 py-8 sm:px-6 sm:py-12 lg:pt-24">
        <div className="w-full max-w-[400px] text-center">

          {/* HEADER */}

          <div className="mb-8 sm:mb-10">
            <h1 className="text-[13vw] sm:text-6xl font-black italic uppercase tracking-tighter leading-[0.85] mb-6 break-words">
              Check
              <br />

              <span className="text-orange-500">
                The Inbox.
              </span>
            </h1>

            <div className="text-gray-500 text-[10px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] leading-relaxed px-2">
              <p>
                Enter the 6-digit verification
                code sent to
              </p>

              <p className="text-black break-all mt-2">
                {email ||
                  "EMAIL NOT AVAILABLE"}
              </p>
            </div>
          </div>

          {/* ROUTER LOADING */}

          {!router.isReady ? (
            <p
              role="status"
              className="text-sm text-gray-500 font-bold uppercase"
            >
              Loading verification...
            </p>
          ) : !email ? (

            /* INVALID EMAIL */

            <div className="bg-gray-50 rounded-2xl p-6">
              <p className="text-sm font-bold text-red-600">
                Invalid verification link.
              </p>

              <p className="text-xs text-gray-500 mt-3">
                Please register again using
                your email address.
              </p>

              <Link
                href="/auth/register"
                className="inline-block mt-6 bg-black text-white px-6 py-3 rounded-full text-xs font-black uppercase hover:bg-orange-600 transition-colors"
              >
                Back to Register
              </Link>
            </div>
          ) : verified ? (

            /* VERIFIED */

            <div
              className="bg-green-50 border border-green-200 rounded-2xl p-6"
              role="status"
            >
              <p className="font-black text-green-700 uppercase">
                Email Verified
              </p>

              <p className="text-xs text-gray-600 mt-2">
                Your account is active.
                Continue to login.
              </p>

              <Link
                href="/auth/login"
                className="inline-block mt-5 text-sm font-bold underline"
              >
                Continue to Login
              </Link>
            </div>
          ) : (

            /* VERIFICATION FORM */

            <form
              onSubmit={handleVerify}
              className="space-y-6 w-full"
              noValidate
            >
              <div className="relative w-full">
                <label
                  htmlFor="verification-otp"
                  className="sr-only"
                >
                  Six-digit email verification code
                </label>

                <input
                  id="verification-otp"
                  name="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={
                    OTP_LENGTH
                  }
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
                  placeholder="000000"
                  disabled={isBusy}
                  required
                  aria-invalid={
                    Boolean(error)
                  }
                  aria-describedby={
                    error
                      ? "otp-error"
                      : undefined
                  }
                  className="w-full p-5 sm:p-6 bg-gray-100 rounded-[1.5rem] sm:rounded-[2rem] font-black text-3xl sm:text-4xl tracking-[0.3em] sm:tracking-[0.5em] text-center outline-none border-2 border-transparent focus:border-orange-500 focus:bg-white transition-all duration-300 disabled:opacity-60"
                />

                {/* RESEND */}

                <div className="mt-4 flex justify-between items-center gap-3 px-2 sm:px-4">
                  <span className="text-[10px] font-black uppercase text-gray-500">
                    Enter Code
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      void handleResend()
                    }
                    disabled={
                      cooldown > 0 ||
                      isBusy
                    }
                    className="text-[10px] font-black uppercase text-black hover:text-orange-500 underline underline-offset-4 disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed"
                  >
                    {resending
                      ? "SENDING..."
                      : cooldown > 0
                      ? `RESEND IN ${cooldown}S`
                      : "RESEND CODE"}
                  </button>
                </div>
              </div>

              {/* INLINE ERROR */}

              {error && (
                <div
                  id="otp-error"
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
                >
                  {error}
                </div>
              )}

              {/* VERIFY BUTTON */}

              <button
                type="submit"
                disabled={
                  isBusy ||
                  otp.length !==
                    OTP_LENGTH
                }
                className="w-full bg-black text-white py-5 sm:py-6 rounded-2xl font-black uppercase tracking-[0.2em] hover:bg-orange-600 transition-all shadow-2xl active:scale-95 disabled:bg-gray-200 disabled:text-gray-500 flex justify-center items-center text-xs sm:text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
                    />

                    CHECKING...
                  </span>
                ) : (
                  "ACTIVATE ACCOUNT"
                )}
              </button>
            </form>
          )}

          {/* SECURITY NOTE */}

          <p className="mt-10 sm:mt-12 text-[9px] font-bold text-gray-500 uppercase tracking-widest px-4 sm:px-10 leading-normal">
            Secure verification by KickStreet Guard.
            <br />
            If you did not receive the email,
            check your spam folder.
          </p>

          {/* BACK TO LOGIN */}

          {!verified && (
            <Link
              href="/auth/login"
              className="inline-block mt-5 text-[10px] font-black uppercase text-gray-500 hover:text-orange-500 underline underline-offset-4"
            >
              Back to Login
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
