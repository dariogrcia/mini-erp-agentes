"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { logout } from "@/lib/actions/auth";

type NavItem = { href: string; label: string; icon: ReactNode };

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Panel",
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/clientes",
    label: "Clientes",
    icon: (
      <svg {...iconProps}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" />
        <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
        <path d="M18 14.8c1.8.7 3 2.5 3.5 5.2" />
      </svg>
    ),
  },
  {
    href: "/productos",
    label: "Productos",
    icon: (
      <svg {...iconProps}>
        <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
        <path d="m3 8 9 5 9-5" />
        <path d="M12 13v8" />
      </svg>
    ),
  },
  {
    href: "/facturas",
    label: "Facturas",
    icon: (
      <svg {...iconProps}>
        <path d="M6 2.5h9l4 4V21.5l-2.5-1.5-2.5 1.5-2.5-1.5-2.5 1.5-2.5-1.5-2.5 1.5V4A1.5 1.5 0 0 1 6 2.5Z" />
        <path d="M9 9h6M9 13h6M9 17h3" />
      </svg>
    ),
  },
];

const logoutIcon = (
  <svg {...iconProps}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
    <path d="M10 17l-5-5 5-5" />
    <path d="M5 12h11" />
  </svg>
);

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 rounded-md">
      <span
        aria-hidden="true"
        className="flex size-8 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white"
      >
        G
      </span>
      <span className="text-lg font-semibold tracking-tight text-ink">Gestia</span>
    </Link>
  );
}

/**
 * App navigation: sidebar on desktop (md+), top bar + bottom tab bar on mobile.
 * `user` is a server-rendered slot (e.g. the signed-in email behind Suspense).
 */
export function AppNav({ user }: { user?: ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:flex md:w-60 md:flex-col md:border-r md:border-line md:bg-surface print:hidden">
        <div className="flex h-16 items-center px-5">
          <Brand />
        </div>
        <nav aria-label="Principal" className="flex-1 px-3 py-2">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      active
                        ? "bg-brand-50 text-brand-700"
                        : "text-muted hover:bg-canvas hover:text-ink"
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-line p-3">
          {user ? <div className="truncate px-3 pb-2 text-xs text-muted">{user}</div> : null}
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-canvas hover:text-ink"
            >
              {logoutIcon}
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur md:hidden print:hidden">
        <Brand />
        <form action={logout}>
          <button
            type="submit"
            aria-label="Cerrar sesión"
            className="flex size-10 items-center justify-center rounded-lg text-muted transition hover:bg-canvas hover:text-ink"
          >
            {logoutIcon}
          </button>
        </form>
      </header>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden"
      >
        <ul className="grid grid-cols-4">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition ${
                    active ? "text-brand-700" : "text-muted hover:text-ink"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
