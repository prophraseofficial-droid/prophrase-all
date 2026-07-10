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
  name: "user" | "log-out";
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
      ) : (
        <>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="m16 17 5-5-5-5" />
          <path d="M21 12H9" />
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
  const [profileOpen, setProfileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const profileLabel = userName || userEmail || "ProPhrase user";
  const profileInitial = profileLabel.trim().charAt(0).toUpperCase() || "P";

  useEffect(() => {
    function closeMenu(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setProfileOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setProfileOpen(false);
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

          <button
            className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-surface-container"
            onClick={() => setProfileOpen((open) => !open)}
            type="button"
          >
            <Icon className="text-lg" name="user" />
            <span>Profile</span>
          </button>

          {profileOpen ? (
            <div className="mx-3 mb-2 rounded-xl bg-surface-container-low px-3 py-2 text-xs leading-5 text-text-muted">
              <div className="flex items-center justify-between gap-3">
                <span>Account</span>
                <span className="font-semibold text-primary">Active</span>
              </div>
              <Link className="mt-2 inline-flex font-semibold text-primary" href="/workspace">
                Open workspace
              </Link>
            </div>
          ) : null}

          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-surface-container"
            onClick={() => void signOut()}
            type="button"
          >
            <Icon className="text-lg" name="log-out" />
            <span>Logout</span>
          </button>
        </div>
      ) : null}

      <button
        aria-expanded={menuOpen}
        aria-label={`Open profile for ${profileLabel}`}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ffd88e] text-sm font-bold leading-none text-[#261900] shadow-sm ring-1 ring-black/5 transition-transform hover:scale-105 active:scale-95"
        onClick={() => setMenuOpen((open) => !open)}
        title={userEmail || profileLabel}
        type="button"
      >
        {profileInitial}
      </button>
    </div>
  );
}
