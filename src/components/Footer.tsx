
import Link from "next/link";

/* =========================================
   TYPES
========================================= */

interface FooterLink {
  label: string;
  href: string;
}

/* =========================================
   FOOTER NAVIGATION
========================================= */

const SHOP_LINKS: FooterLink[] = [
  {
    label: "Shop All Shoes",
    href: "/shop",
  },
  {
    label: "AI Shoe Match",
    href: "/recommendations",
  },
  {
    label: "Compare Shoes",
    href: "/compare",
  },
  {
    label: "Home",
    href: "/",
  },
];

const SUPPORT_LINKS: FooterLink[] = [
  {
    label: "My Orders",
    href: "/orders",
  },
  {
    label: "My Profile",
    href: "/profile",
  },
  {
    label: "Shopping Cart",
    href: "/cart",
  },
];

/* =========================================
   FOOTER LINK COMPONENT
========================================= */

function FooterNavigation({
  title,
  links,
}: {
  title: string;
  links: FooterLink[];
}) {
  return (
    <nav
      aria-label={`${title} links`}
      className="border-t border-white/10 pt-8 sm:border-none sm:pt-0"
    >
      <h3 className="text-xs font-black uppercase tracking-[0.2em] mb-6 text-orange-500">
        {title}
      </h3>

      <ul className="space-y-4 text-sm font-bold uppercase tracking-tight">
        {links.map((link) => (
          <li key={`${title}-${link.label}`}>
            <Link
              href={link.href}
              className="inline-block text-gray-300 hover:text-orange-500 hover:translate-x-1 transition-transform duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-500"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* =========================================
   FOOTER COMPONENT
========================================= */

export default function Footer() {
  const currentYear = 2026;

  return (
    <footer
      className="mt-auto w-full bg-black text-white pt-16 sm:pt-20 pb-8 sm:pb-10"
      aria-label="KickStreet footer"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* MAIN GRID */}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-10 sm:gap-12 mb-12 sm:mb-16">

          {/* BRAND SECTION */}

          <div className="sm:col-span-2 min-w-0">
            <Link
              href="/"
              aria-label="KickStreet home"
              className="inline-block max-w-full"
            >
              <span className="block text-[11vw] sm:text-4xl font-black italic uppercase tracking-tighter mb-6 leading-none break-words">
                KICK
                <span className="text-orange-500">
                  STREET
                </span>
              </span>
            </Link>

            <p className="text-gray-400 max-w-sm font-medium leading-relaxed text-sm sm:text-base">
              Discover sneakers and streetwear
              essentials at KickStreet.
              Explore the latest styles and
              find your next favorite pair.
            </p>

            {/* BRAND TAGLINE */}

            <p className="mt-6 text-[10px] font-black uppercase tracking-[0.25em] text-orange-500">
              Heat For Your Feet.
            </p>

            {/* SOCIAL LINKS NOTE */}

            {/*
              Add social media links here
              after official KickStreet
              profiles are created.

              Do not use href="#"
              as a placeholder.
            */}
          </div>

          {/* SHOP LINKS */}

          <FooterNavigation
            title="Shop"
            links={SHOP_LINKS}
          />

          {/* SUPPORT LINKS */}

          <FooterNavigation
            title="Account & Support"
            links={SUPPORT_LINKS}
          />
        </div>

        {/* BOTTOM BAR */}

        <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-6 text-center md:text-left">

          {/* COPYRIGHT */}

          <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.15em] leading-relaxed">
            © {currentYear} KICKSTREET.
            ALL RIGHTS RESERVED.

            <span className="block mt-1 text-gray-500">
              BUILT FOR THE CULTURE.
            </span>
          </p>

          {/* PAYMENT INFORMATION */}

          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              Payment Options
            </span>

            <div className="flex items-center gap-3">
              <span className="rounded-md border border-white/20 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white">
                Stripe
              </span>

              <span className="rounded-md border border-white/20 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white">
                Cash on Delivery
              </span>
            </div>
          </div>
        </div>

        {/* LEGAL NOTE */}

        <p className="mt-6 text-center md:text-left text-[10px] leading-relaxed text-gray-500">
          Product availability, pricing,
          shipping and payment options
          are subject to checkout confirmation.
        </p>
      </div>
    </footer>
  );
}
