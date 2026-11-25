
import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  ReactNode,
} from "react";

import Link from "next/link";
import { useRouter } from "next/router";

import {
  signOut,
  useSession,
} from "next-auth/react";

/* =========================================
   TYPES
========================================= */

interface AdminLayoutProps {
  children: ReactNode;
}

interface MenuItem {
  name: string;
  path: string;
  icon: ReactNode;
}

/* =========================================
   ICON COMPONENT
========================================= */

function MenuIcon({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

/* =========================================
   MENU ITEMS
========================================= */

const MENU_ITEMS: MenuItem[] = [
  {
    name: "Dashboard",
    path: "/admin/dashboard",
    icon: (
      <MenuIcon>
        <rect
          x="3"
          y="3"
          width="7"
          height="7"
          rx="1"
        />
        <rect
          x="14"
          y="3"
          width="7"
          height="7"
          rx="1"
        />
        <rect
          x="3"
          y="14"
          width="7"
          height="7"
          rx="1"
        />
        <rect
          x="14"
          y="14"
          width="7"
          height="7"
          rx="1"
        />
      </MenuIcon>
    ),
  },
  {
    name: "Products",
    path: "/admin/products",
    icon: (
      <MenuIcon>
        <path d="M3 7h18l-2 13H5L3 7Z" />
        <path d="M8 9V6a4 4 0 0 1 8 0v3" />
      </MenuIcon>
    ),
  },
  {
    name: "Sliders",
    path: "/admin/sliders",
    icon: (
      <MenuIcon>
        <rect
          x="3"
          y="4"
          width="18"
          height="16"
          rx="2"
        />
        <circle
          cx="8"
          cy="9"
          r="1.5"
        />
        <path d="m4 17 5-5 4 4 3-3 4 4" />
      </MenuIcon>
    ),
  },
  {
    name: "Orders",
    path: "/admin/orders",
    icon: (
      <MenuIcon>
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
        <path d="M9 8h6M9 12h6" />
      </MenuIcon>
    ),
  },
  {
    name: "Settings",
    path: "/admin/shop-settings",
    icon: (
      <MenuIcon>
        <circle
          cx="12"
          cy="12"
          r="3"
        />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l-1.8 1.8a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6h-2.6a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-1.8-1.8A1.7 1.7 0 0 0 8 15a1.7 1.7 0 0 0-1.6-1H4v-2.6h2.4A1.7 1.7 0 0 0 8 10a1.7 1.7 0 0 0-.3-1.9l1.8-1.8a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6H15a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l1.8 1.8a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h1v2.6h-1a1.7 1.7 0 0 0-1.6 1.4Z" />
      </MenuIcon>
    ),
  },
];

/* =========================================
   HELPERS
========================================= */

function isActiveRoute(
  pathname: string,
  menuPath: string
): boolean {
  if (pathname === menuPath) {
    return true;
  }

  if (menuPath === "/admin/products") {
    return (
      pathname.startsWith(
        "/admin/product/"
      ) ||
      pathname.startsWith(
        "/admin/edit-product/"
      ) ||
      pathname ===
        "/admin/add-product"
    );
  }

  return pathname.startsWith(
    `${menuPath}/`
  );
}

/* =========================================
   ADMIN LAYOUT
========================================= */

export default function AdminLayout({
  children,
}: AdminLayoutProps) {
  const router = useRouter();

  const {
    data: session,
    status,
  } = useSession();

  const [isMobileMenuOpen, setIsMobileMenuOpen] =
    useState(false);

  const [loggingOut, setLoggingOut] =
    useState(false);

  const mobileMenuButtonRef =
    useRef<HTMLButtonElement>(null);

  const sidebarRef =
    useRef<HTMLElement>(null);

  const isAdmin =
    session?.user?.role === "admin";

  /* =====================================
     AUTHENTICATION REDIRECT
  ===================================== */

  useEffect(() => {
    if (status === "loading") {
      return;
    }

    if (
      status === "unauthenticated"
    ) {
      void router.replace(
        `/login?callbackUrl=${encodeURIComponent(
          router.asPath
        )}`
      );

      return;
    }

    if (
      status === "authenticated" &&
      !isAdmin
    ) {
      void router.replace("/");
    }
  }, [
    status,
    isAdmin,
    router,
  ]);

  /* =====================================
     CLOSE MENU ON ROUTE CHANGE
  ===================================== */

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [router.asPath]);

  /* =====================================
     MOBILE MENU KEYBOARD SUPPORT
  ===================================== */

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    const sidebar =
      sidebarRef.current;

    const firstLink =
      sidebar?.querySelector<HTMLElement>(
        "a"
      );

    firstLink?.focus();

    function handleKeyDown(
      event: KeyboardEvent
    ) {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);

        mobileMenuButtonRef.current?.focus();
      }

      if (
        event.key !== "Tab" ||
        !sidebar
      ) {
        return;
      }

      const focusable =
        sidebar.querySelectorAll<HTMLElement>(
          'a:not([tabindex="-1"]), button:not([disabled])'
        );

      if (!focusable.length) {
        return;
      }

      const first =
        focusable[0];

      const last =
        focusable[
          focusable.length - 1
        ];

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
      document.body.style.overflow =
        previousOverflow;

      document.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [isMobileMenuOpen]);

  /* =====================================
     LOGOUT
  ===================================== */

  async function handleLogout() {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);

    try {
      await signOut({
        callbackUrl: "/",
      });
    } catch {
      setLoggingOut(false);
    }
  }

  /* =====================================
     AUTH LOADING
  ===================================== */

  if (
    status === "loading" ||
    !isAdmin
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F9FA]">
        <div
          role="status"
          className="flex flex-col items-center gap-4"
        >
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-orange-600" />

          <p className="text-xs font-black uppercase tracking-widest text-gray-500">
            {status === "loading"
              ? "Verifying Admin..."
              : "Redirecting..."}
          </p>
        </div>
      </div>
    );
  }

  /* =====================================
     MAIN LAYOUT
  ===================================== */

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-[#F8F9FA] lg:flex-row">
      {/* ===================================
          MOBILE HEADER
      =================================== */}

      <header className="sticky top-0 z-[100] flex items-center justify-between border-b border-gray-800 bg-black p-4 text-white lg:hidden">
        <Link
          href="/admin/dashboard"
          className="text-lg font-black uppercase italic tracking-tighter text-white"
        >
          KICK
          <span className="text-orange-500">
            STREET
          </span>
        </Link>

        <button
          ref={mobileMenuButtonRef}
          type="button"
          onClick={() =>
            setIsMobileMenuOpen(
              (previous) => !previous
            )
          }
          aria-expanded={
            isMobileMenuOpen
          }
          aria-controls="admin-sidebar"
          aria-label={
            isMobileMenuOpen
              ? "Close navigation menu"
              : "Open navigation menu"
          }
          className="rounded-xl bg-orange-500 px-4 py-3 text-xs font-black uppercase tracking-widest text-white"
        >
          {isMobileMenuOpen
            ? "Close"
            : "Menu"}
        </button>
      </header>

      {/* ===================================
          MOBILE BACKDROP
      =================================== */}

      {isMobileMenuOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() =>
            setIsMobileMenuOpen(false)
          }
          className="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* ===================================
          ADMIN SIDEBAR
      =================================== */}

      <aside
        id="admin-sidebar"
        ref={sidebarRef}
        aria-label="Admin navigation"
        className={`fixed left-0 top-0 z-[150] flex h-dvh w-72 flex-col bg-black p-6 text-white shadow-2xl transition-transform duration-300 ease-in-out lg:sticky lg:h-screen lg:translate-x-0 lg:p-8 lg:shadow-none ${
          isMobileMenuOpen
            ? "translate-x-0"
            : "-translate-x-full"
        }`}
      >
        {/* DESKTOP LOGO */}

        <div className="mb-10 hidden lg:block">
          <Link
            href="/admin/dashboard"
            className="text-xl font-black uppercase italic tracking-tighter text-white"
          >
            KICK
            <span className="text-orange-500">
              STREET
            </span>
          </Link>

          <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Admin Central
          </p>
        </div>

        {/* MOBILE SIDEBAR HEADER */}

        <div className="mb-8 flex items-center justify-between lg:hidden">
          <span className="text-xs font-black uppercase tracking-widest text-orange-500">
            Admin Central
          </span>

          <button
            type="button"
            onClick={() => {
              setIsMobileMenuOpen(false);
              mobileMenuButtonRef.current?.focus();
            }}
            aria-label="Close sidebar"
            className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-black text-white"
          >
            ×
          </button>
        </div>

        {/* NAVIGATION */}

        <nav
          aria-label="Admin sections"
          className="flex-1 space-y-2 overflow-y-auto"
        >
          {MENU_ITEMS.map((item) => {
            const active =
              isActiveRoute(
                router.pathname,
                item.path
              );

            return (
              <Link
                key={item.path}
                href={item.path}
                aria-current={
                  active
                    ? "page"
                    : undefined
                }
                onClick={() =>
                  setIsMobileMenuOpen(false)
                }
                className={`group flex items-center gap-4 rounded-2xl px-5 py-4 text-xs font-black uppercase tracking-wider transition-all ${
                  active
                    ? "bg-orange-500 text-white shadow-lg"
                    : "text-gray-400 hover:bg-gray-900 hover:text-white"
                }`}
              >
                <span
                  className={
                    active
                      ? "text-white"
                      : "text-gray-500 group-hover:text-orange-500"
                  }
                >
                  {item.icon}
                </span>

                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* SIDEBAR FOOTER */}

        <div className="mt-6 space-y-3 border-t border-gray-800 pt-6">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-400 transition hover:bg-gray-900 hover:text-white"
          >
            <span aria-hidden="true">
              ←
            </span>

            Back to Store
          </Link>

          <button
            type="button"
            onClick={() =>
              void handleLogout()
            }
            disabled={loggingOut}
            className="flex w-full items-center gap-3 rounded-xl bg-red-500/10 px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-red-400 transition hover:bg-red-500 hover:text-white disabled:opacity-50"
          >
            <span aria-hidden="true">
              ↪
            </span>

            {loggingOut
              ? "Signing Out..."
              : "Logout"}
          </button>
        </div>
      </aside>

      {/* ===================================
          MAIN CONTENT
      =================================== */}

      <main
        id="admin-main-content"
        className="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-8 lg:p-10"
      >
        <div className="mx-auto w-full max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}
