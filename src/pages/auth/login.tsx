
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import Head from "next/head";
import Link from "next/link";

import {
  getSession,
  signIn,
  useSession,
} from "next-auth/react";

import {
  useRouter,
} from "next/router";

import toast from "react-hot-toast";

import Navbar from "@/components/Navbar";

/* =========================================
   CONSTANTS
========================================= */

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;

const LOGIN_ERROR_MESSAGE =
  "Invalid credentials or email not verified.";

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

function getUserRole(
  user: unknown
): "admin" | "user" {
  if (
    user &&
    typeof user === "object" &&
    "role" in user &&
    user.role === "admin"
  ) {
    return "admin";
  }

  return "user";
}

/* =========================================
   SAFE CALLBACK URL
========================================= */

function getSafeCallbackUrl(
  value: unknown
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    return null;
  }

  try {
    const baseOrigin =
      "https://kickstreet.local";

    const parsed =
      new URL(value, baseOrigin);

    if (
      parsed.origin !== baseOrigin
    ) {
      return null;
    }

    const pathname =
      parsed.pathname;

    /*
     * Never redirect to:
     *
     * - Authentication routes
     * - API routes
     */

    if (
      pathname === "/auth" ||
      pathname.startsWith("/auth/") ||
      pathname === "/api" ||
      pathname.startsWith("/api/")
    ) {
      return null;
    }

    return (
      parsed.pathname +
      parsed.search +
      parsed.hash
    );
  } catch {
    return null;
  }
}

/* =========================================
   ROLE-BASED DESTINATION
========================================= */

function getDestination(
  role: "admin" | "user",
  callbackUrl: string | null
): string {
  const defaultDestination =
    role === "admin"
      ? "/admin/dashboard"
      : "/";

  if (!callbackUrl) {
    return defaultDestination;
  }

  /*
   * Prevent regular users from
   * redirecting to admin pages.
   *
   * Actual admin authorization
   * must still be enforced
   * on the server.
   */

  if (
    role !== "admin" &&
    (
      callbackUrl === "/admin" ||
      callbackUrl.startsWith("/admin/")
    )
  ) {
    return defaultDestination;
  }

  return callbackUrl;
}

/* =========================================
   LOGIN PAGE
========================================= */

export default function Login() {
  const router =
    useRouter();

  const {
    data: session,
    status,
  } = useSession();

  /* FORM STATE */

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [
    showPassword,
    setShowPassword,
  ] = useState(false);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  /* DUPLICATE REQUEST PROTECTION */

  const submittingRef =
    useRef(false);

  const redirectingRef =
    useRef(false);

  /* =====================================
     CALLBACK URL
  ===================================== */

  const callbackUrl =
    router.isReady
      ? getSafeCallbackUrl(
          router.query.callbackUrl
        )
      : null;

  /* =====================================
     REDIRECT AUTHENTICATED USERS
  ===================================== */

  useEffect(() => {
    if (
      !router.isReady ||
      status !== "authenticated" ||
      !session?.user ||
      redirectingRef.current
    ) {
      return;
    }

    redirectingRef.current = true;

    const role =
      getUserRole(session.user);

    const destination =
      getDestination(
        role,
        callbackUrl
      );

    void router
      .replace(destination)
      .then((navigated) => {
        if (!navigated) {
          redirectingRef.current =
            false;
        }
      })
      .catch(() => {
        redirectingRef.current =
          false;

        toast.error(
          "Unable to redirect. Please try again."
        );
      });
  }, [
    router,
    router.isReady,
    status,
    session,
    callbackUrl,
  ]);

  /* =====================================
     LOGIN HANDLER
  ===================================== */

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (
      submittingRef.current ||
      loading ||
      !router.isReady ||
      status === "loading" ||
      status === "authenticated"
    ) {
      return;
    }

    setError("");

    const normalizedEmail =
      normalizeEmail(email);

    /* EMAIL VALIDATION */

    if (
      !isValidEmail(normalizedEmail)
    ) {
      const message =
        "Please enter a valid email address.";

      setError(message);
      toast.error(message);

      return;
    }

    /* PASSWORD VALIDATION */

    if (
      password.length === 0 ||
      password.length >
        MAX_PASSWORD_LENGTH
    ) {
      const message =
        "Please enter a valid password.";

      setError(message);
      toast.error(message);

      return;
    }

    submittingRef.current = true;
    setLoading(true);

    try {
      /* =================================
         NEXTAUTH SIGN IN
      ================================= */

      const result =
        await signIn(
          "credentials",
          {
            redirect: false,

            email:
              normalizedEmail,

            password,
          }
        );

      /* AUTHENTICATION FAILURE */

      if (
        !result ||
        result.error ||
        result.ok !== true
      ) {
        setError(
          LOGIN_ERROR_MESSAGE
        );

        toast.error(
          LOGIN_ERROR_MESSAGE
        );

        return;
      }

      /* =================================
         REFRESH SESSION
      ================================= */

      const updatedSession =
        await getSession();

      if (!updatedSession?.user) {
        setError(
          "Login succeeded, but the session could not be confirmed. Please refresh the page."
        );

        toast.error(
          "Unable to confirm session."
        );

        return;
      }

      /* =================================
         SUCCESS
      ================================= */

      toast.success(
        "ACCESS GRANTED. WELCOME BACK."
      );

      const role =
        getUserRole(
          updatedSession.user
        );

      const destination =
        getDestination(
          role,
          callbackUrl
        );

      if (
        !redirectingRef.current
      ) {
        redirectingRef.current =
          true;

        const navigated =
          await router.replace(
            destination
          );

        if (!navigated) {
          redirectingRef.current =
            false;
        }
      }
    } catch (error: unknown) {
      console.error(
        "LOGIN_ERROR:",
        error instanceof Error
          ? error.name
          : "UnknownError"
      );

      const message =
        "Server error. Please try again later.";

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
          Login | KickStreet
        </title>

        <meta
          name="description"
          content="Sign in to your KickStreet account."
        />

        <meta
          name="robots"
          content="noindex, nofollow"
        />
      </Head>

      <Navbar />

      {/* MAIN LAYOUT */}

      <main className="flex-grow flex items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
        <div className="w-full max-w-[400px]">

          {/* HEADER */}

          <div className="text-left mb-8 sm:mb-10">
            <h1 className="text-[13vw] sm:text-6xl lg:text-7xl font-black italic uppercase tracking-tighter leading-[0.85] mb-4 break-words">
              Enter
              <br />

              <span className="text-orange-500">
                The Club.
              </span>
            </h1>

            <p className="text-gray-500 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] leading-relaxed">
              Premium Access to KickStreet Heat
            </p>
          </div>

          {/* LOGIN FORM */}

          <form
            onSubmit={handleSubmit}
            className="space-y-4 w-full"
            noValidate
          >

            {/* EMAIL */}

            <div className="group w-full">
              <label
                htmlFor="login-email"
                className="text-[10px] font-black uppercase tracking-[0.2em] ml-2 mb-2 block text-gray-500 group-focus-within:text-black transition-colors"
              >
                Email Address
              </label>

              <input
                id="login-email"
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

                  if (error) {
                    setError("");
                  }
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
                    ? "login-error"
                    : undefined
                }
                className="w-full p-4 sm:p-5 bg-gray-100 rounded-2xl font-bold text-sm outline-none border-2 border-transparent focus:border-black focus:bg-white transition-all duration-300 disabled:opacity-60"
              />
            </div>

            {/* PASSWORD */}

            <div className="group w-full">
              <label
                htmlFor="login-password"
                className="text-[10px] font-black uppercase tracking-[0.2em] ml-2 mb-2 block text-gray-500 group-focus-within:text-black transition-colors"
              >
                Secret Password
              </label>

              <div className="relative">
                <input
                  id="login-password"
                  name="password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => {
                    setPassword(
                      event.target.value
                    );

                    if (error) {
                      setError("");
                    }
                  }}
                  maxLength={
                    MAX_PASSWORD_LENGTH
                  }
                  disabled={isBusy}
                  required
                  aria-invalid={
                    Boolean(error)
                  }
                  aria-describedby={
                    error
                      ? "login-error"
                      : undefined
                  }
                  className="w-full p-4 pr-20 sm:p-5 sm:pr-20 bg-gray-100 rounded-2xl font-bold text-sm outline-none border-2 border-transparent focus:border-black focus:bg-white transition-all duration-300 disabled:opacity-60"
                />

                {/* PASSWORD TOGGLE */}

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

              <div className="text-right mt-3">
                <Link
                  href="/auth/forgot-password"
                  className="text-[10px] font-black uppercase hover:text-orange-500 transition-colors tracking-tighter"
                >
                  Forgot Credentials?
                </Link>
              </div>
            </div>

            {/* ERROR MESSAGE */}

            {error && (
              <div
                id="login-error"
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
                !router.isReady
              }
              className="w-full bg-black text-white py-5 sm:py-6 rounded-2xl font-black uppercase tracking-[0.2em] hover:bg-orange-600 transition-all shadow-xl active:scale-95 disabled:bg-gray-200 disabled:text-gray-500 flex justify-center items-center mt-2 text-xs sm:text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
            >
              {isBusy ? (
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
                  />

                  {status ===
                  "authenticated"
                    ? "REDIRECTING..."
                    : "VERIFYING..."}
                </span>
              ) : (
                "SIGN IN"
              )}
            </button>
          </form>

          {/* REGISTER LINK */}

          <div className="mt-10 sm:mt-12 pt-8 border-t border-gray-100 text-center">
            <p className="text-[10px] sm:text-[11px] font-bold text-gray-500 uppercase tracking-widest leading-relaxed">
              No Heat in your collection?
              <br />

              <Link
                href="/auth/register"
                className="text-black font-black underline underline-offset-8 decoration-2 decoration-orange-500 hover:text-orange-500 transition-colors mt-4 inline-block"
              >
                CREATE AN ACCOUNT
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
