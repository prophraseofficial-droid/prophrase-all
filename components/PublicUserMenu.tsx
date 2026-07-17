"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type PublicUserMenuProps = {
  userEmail?: string;
  userName?: string;
};

function Icon({
  name,
  className = "",
}: {
  name: "settings" | "user" | "log-out";
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={`h-[1em] w-[1em] shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {name === "user" ? (
        <>
          <path d="M20 21a8 8 0 0 0-16 0" />
          <circle cx="12" cy="7" r="4" />
        </>
      ) : name === "log-out" ? (
        <>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="m16 17 5-5-5-5" />
          <path d="M21 12H9" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.1.38.31.73.6 1 .3.28.68.42 1.1.4h.1v4h-.1a1.7 1.7 0 0 0-1.7.6Z" />
        </>
      )}
    </svg>
  );
}

export function PublicUserMenu({
  userEmail = "",
  userName = "",
}: PublicUserMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const profileLabel = userName || userEmail || "ProPhrase user";

  useEffect(() => {
    function closeMenu(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <div className="relative" ref={menuRef}>
      {menuOpen ? (
        <div className="absolute right-0 top-12 z-50 w-72 rounded-2xl border border-border-subtle bg-white p-2 text-left shadow-xl ring-1 ring-black/5">
          <div className="border-b border-border-subtle px-3 py-3">
            <p className="truncate text-sm font-semibold leading-5 text-primary">
              {profileLabel}
            </p>
            {userEmail ? (
              <p className="truncate text-xs leading-5 text-text-muted">
                {userEmail}
              </p>
            ) : null}
          </div>

          <Link
            className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-primary transition-colors hover:bg-surface-container"
            href="/account/billing"
          >
            <Icon className="text-lg" name="user" />
            <span>Manage billing &amp; credits</span>
          </Link>

          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-primary transition-colors hover:bg-surface-container"
            onClick={() => void signOut()}
            type="button"
          >
            <Icon className="text-lg" name="log-out" />
            <span>Logout</span>
          </button>

          <Link
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-primary transition-colors hover:bg-surface-container"
            href="/settings"
          >
            <Icon className="text-lg" name="settings" />
            <span>App Settings</span>
          </Link>
        </div>
      ) : null}

      <button
        aria-expanded={menuOpen}
        aria-label={`Open profile for ${profileLabel}`}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white/70 text-[#11110e] shadow-sm transition-transform hover:scale-105 hover:bg-white active:scale-95"
        onClick={() => setMenuOpen((open) => !open)}
        title={userEmail || profileLabel}
        type="button"
      >
        <Icon className="text-xl" name="user" />
      </button>
    </div>
  );
}
