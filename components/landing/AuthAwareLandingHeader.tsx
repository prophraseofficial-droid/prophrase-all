"use client";

import { useEffect, useState } from "react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function AuthAwareLandingHeader() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    supabase.auth
      .getUser()
      .then(({ data }) => setIsAuthenticated(Boolean(data.user)))
      .catch(() => setIsAuthenticated(false));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session?.user));
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <LandingHeader
      appHref={isAuthenticated ? "/workspace" : "/login"}
      isAuthenticated={isAuthenticated}
    />
  );
}
