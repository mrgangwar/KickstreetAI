
import {
  useEffect,
  useRef,
  useState,
} from "react";

import Link from "next/link";

import {
  useRouter,
} from "next/router";

import {
  signOut,
  useSession,
} from "next-auth/react";

import toast from "react-hot-toast";

import {
  useCart,
} from "@/context/CartContext";

/* =========================================
   TYPES
========================================= */

type UserRole =
  | "user"
  | "admin";

interface NavigationItem {
  label: string;
  href: string;
  requiresAuth?: boolean;
}

/* =========================================
   NAVIGATION CONFIGURATION
========================================= */

const NAVIGATION_ITEMS: NavigationItem[] = [
  {
    label: "Home",
    href: "/",
  },
  {
    label: "Shop",
    href: "/shop",
  },
  {
    label: "AI Match",
    href: "/recommendations",
  },
  {
    label: "Compare",
    href: "/compare",
  },
  {
    label: "My Orders",
    href: "/orders",
    requiresAuth: true,
  },
  {
    label: "Profile",
    href: "/profile",
    requiresAuth: true,
  },
];

/* =========================================
   ROLE HELPER
========================================= */

function getUserRole(
  value: unknown
): UserRole {
  return value === "admin"
    ? "admin"
    : "user";
}

/* =========================================
   NAVBAR COMPONENT
========================================= */

export default function Navbar() {
  const router =
    useRouter();

  const {
    cartCount,
  } = useCart();

  const {
    data: session,
    status,
  } = useSession();

  /* =====================================
     STATE
  ===================================== */

  const [
    mounted,
    setMounted,
  ] = useState(false);

  const [
    isOpen,
    setIsOpen,
  ] = useState(false);

  const [
    loggingOut,
    setLoggingOut,
  ] = useState(false);

  /* =====================================
     REFS
  ===================================== */

  const menuButtonRef =
    useRef<HTMLButtonElement>(null);

  const mobileMenuRef =
    useRef<HTMLDivElement>(null);

  const firstMenuLinkRef =
    useRef<HTMLAnchorElement>(null);

  const wasMenuOpenRef =
    useRef(false);

  const logoutInProgress =
    useRef(false);

  /* =====================================
     AUTH STATE
  ===================================== */

  const isAuthenticated =
    status === "authenticated" &&
    Boolean(session?.user);

  const isAdmin =
    isAuthenticated &&
    getUserRole(
      session?.user?.role
    ) === "admin";

  const firstName =
    session?.user?.name
      ?.trim()
      .split(/\s+/)[0] ||
    "Member";

  /* =====================================
     HYDRATION
  ===================================== */

  useEffect(() => {
    setMounted(true);
  }, []);

  /* =====================================
     CLOSE MENU ON ROUTE CHANGE
  ===================================== */

  useEffect(() => {
    setIsOpen(false);
  }, [router.asPath]);

  /* =====================================
     ESCAPE KEY HANDLING
  ===================================== */

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (
      event: KeyboardEvent
    ) => {
      if (
        event.key === "Escape"
      ) {
        setIsOpen(false);

        menuButtonRef.current?.focus();
      }
    };

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [isOpen]);

  /* =====================================
     MOBILE MENU FOCUS
  ===================================== */

  useEffect(() => {
    if (isOpen) {
      firstMenuLinkRef.current?.focus();

      wasMenuOpenRef.current =
        true;

      return;
    }

    if (
      wasMenuOpenRef.current
    ) {
      wasMenuOpenRef.current =
        false;

      /*
       * Do not force focus back
       * after navigation.
       *
       * Escape handling already
       * restores focus to toggle.
       */
    }
  }, [isOpen]);

  /* =====================================
     CLOSE MENU ON DESKTOP RESIZE
  ===================================== */

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const mediaQuery =
      window.matchMedia(
        "(min-width: 768px)"
      );

    const handleChange = (
      event: MediaQueryListEvent
    ) => {
      if (event.matches) {
        setIsOpen(false);
      }
    };

    mediaQuery.addEventListener(
      "change",
      handleChange
    );

    return () => {
      mediaQuery.removeEventListener(
        "change",
        handleChange
      );
    };
  }, [isOpen]);

  /* =====================================
     ACTIVE LINK HELPER
  ===================================== */

  const isActive = (
    path: string
  ): boolean => {
    if (path === "/") {
      return router.pathname === "/";
    }

    return (
      router.pathname === path ||
      router.pathname.startsWith(
        `${path}/`
      )
    );
  };

  /* =====================================
     LOGOUT HANDLER
  ===================================== */

  const handleLogout =
    async () => {
      if (
        logoutInProgress.current
      ) {
        return;
      }

      logoutInProgress.current =
        true;

      setLoggingOut(true);
      setIsOpen(false);

      try {
        await signOut({
          callbackUrl: "/",
        });
      } catch {
        toast.error(
          "Unable to sign out. Please try again."
        );

        logoutInProgress.current =
          false;

        setLoggingOut(false);
      }
    };

  /* =====================================
     NAVIGATION ITEMS
  ===================================== */

  const visibleItems =
    NAVIGATION_ITEMS.filter(
      (item) =>
        !item.requiresAuth ||
        isAuthenticated
    );

  /* =====================================
     CART COUNT
  ===================================== */

  const displayCartCount =
    mounted &&
    Number.isFinite(cartCount) &&
    cartCount > 0
      ? cartCount
      : 0;

  /* =====================================
     RENDER
  ===================================== */

  return (
    <header className="sticky top-0 z-[100] w-full bg-white/95 backdrop-blur-xl border-b border-gray-100">

      {/* MAIN NAVIGATION */}

      <nav
        aria-label="Main navigation"
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-6 md:px-12 py-4 sm:py-5"
      >

        {/* LOGO */}

        <Link
          href="/#hero"
          aria-label="KickStreet home"
          className="shrink-0 text-lg sm:text-2xl font-black italic uppercase tracking-tighter text-black whitespace-nowrap"
        >
          KICK
          <span className="text-orange-600">
            STREET
          </span>
        </Link>

        {/* DESKTOP NAVIGATION */}

        <div className="hidden md:flex items-center gap-5 lg:gap-10 font-black uppercase text-[10px] tracking-[0.15em] lg:tracking-[0.2em]">

          {visibleItems.map(
            (item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={
                  isActive(item.href)
                    ? "page"
                    : undefined
                }
                className={`transition-colors hover:text-orange-600 ${
                  isActive(item.href)
                    ? "text-orange-600"
                    : "text-black"
                }`}
              >
                {item.label}
              </Link>
            )
          )}

          {/* ADMIN PANEL */}

          {isAdmin && (
            <Link
              href="/admin/dashboard"
              className="rounded-full bg-black px-4 lg:px-5 py-2 text-white hover:bg-orange-600 transition-colors shadow-lg whitespace-nowrap"
            >
              Admin Panel
            </Link>
          )}
        </div>

        {/* RIGHT ACTIONS */}

        <div className="flex shrink-0 items-center gap-2 sm:gap-4 md:gap-5">

          {/* AUTH SECTION */}

          {status === "loading" ? (
            <div
              role="status"
              aria-label="Checking authentication"
              className="h-8 w-14 sm:w-20 animate-pulse rounded-lg bg-gray-100"
            />
          ) : isAuthenticated ? (
            <div className="flex items-center gap-2 sm:gap-4 border-r border-gray-100 pr-2 sm:pr-4">

              {/* USER NAME */}

              <div className="hidden lg:flex flex-col items-end">
                <span className="text-[8px] font-black uppercase tracking-tighter text-orange-600 leading-none mb-1">
                  Authenticated
                </span>

                <span className="text-xs font-black uppercase italic leading-none max-w-[100px] truncate">
                  {firstName}
                </span>
              </div>

              {/* LOGOUT */}

              <button
                type="button"
                onClick={() =>
                  void handleLogout()
                }
                disabled={loggingOut}
                aria-label="Sign out"
                className="text-[9px] font-black uppercase tracking-widest bg-gray-50 px-3 sm:px-4 py-2 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors whitespace-nowrap disabled:opacity-50"
              >
                {loggingOut
                  ? "WAIT..."
                  : "EXIT"}
              </button>
            </div>
          ) : (
            <Link
              href="/auth/login"
              className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest hover:text-orange-600 transition-colors border-r border-gray-100 pr-2 sm:pr-4 whitespace-nowrap"
            >
              Log In
            </Link>
          )}

          {/* CART */}

          <Link
            href="/cart"
            aria-label={
              displayCartCount > 0
                ? `Shopping cart with ${displayCartCount} items`
                : "Shopping cart"
            }
            className="relative p-1.5 sm:p-2 group rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
              aria-hidden="true"
              className="w-5 h-5 sm:w-6 sm:h-6 group-hover:scale-110 transition-transform"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z"
              />
            </svg>

            {/* CART BADGE */}

            {displayCartCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute -top-1 -right-1 bg-orange-600 text-white text-[9px] font-black min-w-5 h-5 px-1 flex items-center justify-center rounded-full border-2 border-white shadow-md"
              >
                {displayCartCount > 99
                  ? "99+"
                  : displayCartCount}
              </span>
            )}
          </Link>

          {/* MOBILE MENU TOGGLE */}

          <button
            ref={menuButtonRef}
            type="button"
            onClick={() =>
              setIsOpen(
                (previous) =>
                  !previous
              )
            }
            aria-label={
              isOpen
                ? "Close navigation menu"
                : "Open navigation menu"
            }
            aria-expanded={isOpen}
            aria-controls="mobile-navigation"
            className="md:hidden flex flex-col justify-center items-center gap-[5px] w-9 h-9 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600"
          >
            <span
              aria-hidden="true"
              className={`block w-6 h-0.5 bg-black transition-transform duration-300 ${
                isOpen
                  ? "translate-y-[7px] rotate-45"
                  : ""
              }`}
            />

            <span
              aria-hidden="true"
              className={`block w-6 h-0.5 bg-black transition-opacity duration-300 ${
                isOpen
                  ? "opacity-0"
                  : ""
              }`}
            />

            <span
              aria-hidden="true"
              className={`block w-6 h-0.5 bg-black transition-transform duration-300 ${
                isOpen
                  ? "-translate-y-[7px] -rotate-45"
                  : ""
              }`}
            />
          </button>
        </div>
      </nav>

      {/* MOBILE MENU */}

      {isOpen && (
        <div className="md:hidden">

          {/* BACKDROP */}

          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() =>
              setIsOpen(false)
            }
            className="fixed inset-x-0 top-full h-[100dvh] bg-black/50 cursor-default"
          />

          {/* MOBILE DRAWER */}

          <div
            id="mobile-navigation"
            ref={mobileMenuRef}
            className="absolute top-full left-0 w-full max-h-[calc(100dvh-5rem)] overflow-y-auto bg-white shadow-xl animate-slide-down"
          >
            <div className="flex flex-col p-6 gap-2">

              {visibleItems.map(
                (item, index) => (
                  <Link
                    key={item.href}
                    ref={
                      index === 0
                        ? firstMenuLinkRef
                        : undefined
                    }
                    href={item.href}
                    aria-current={
                      isActive(item.href)
                        ? "page"
                        : undefined
                    }
                    onClick={() =>
                      setIsOpen(false)
                    }
                    className={`font-black uppercase text-xl sm:text-2xl tracking-tight transition-colors py-3 ${
                      isActive(item.href)
                        ? "text-orange-600"
                        : "text-black hover:text-orange-600"
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              )}

              {/* ADMIN LINK */}

              {isAdmin && (
                <Link
                  href="/admin/dashboard"
                  onClick={() =>
                    setIsOpen(false)
                  }
                  className="bg-orange-600 text-white py-4 px-4 rounded-xl font-black uppercase text-center shadow-lg mt-2"
                >
                  Admin Panel
                </Link>
              )}

              {/* MOBILE ACCOUNT INFO */}

              {isAuthenticated && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs font-black uppercase text-gray-500">
                    Signed in as
                  </p>

                  <p className="mt-1 text-sm font-black text-black break-words">
                    {session?.user?.name ||
                      session?.user?.email ||
                      "KickStreet Member"}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
