"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const destinations = [
  ["/", "Home"],
  ["/recruiters", "Recruiters"],
  ["/opportunities", "Opportunities"],
  ["/imports", "Imports"],
  ["/review-queue", "Review Queue"],
  ["/data-privacy", "Data & Privacy"],
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <div className="rail header-inner">
          <Link className="wordmark" href="/">
            DontGhostMe
          </Link>
          <span className="mode-stamp">Synthetic mode</span>
          <nav aria-label="Primary">
            <ul className="nav-list">
              {destinations.map(([href, label]) => {
                const current = href === "/" ? pathname === href : pathname.startsWith(href);
                return (
                  <li key={href}>
                    <Link href={href as Route} aria-current={current ? "page" : undefined}>
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </header>
      <main className="rail" id="main-content" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <div className="rail">Local synthetic evidence only. No mailbox or network connection.</div>
      </footer>
    </>
  );
}
