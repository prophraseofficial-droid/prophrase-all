"use client";

import { useEffect, useState } from "react";
import { PublicHeader } from "@/components/PublicHeader";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthAwarePublicHeaderProps = {
  active?: "product" | "pricing" | "legal";
  ctaLabel?: string;
};

export function AuthAwarePublicHeader({
  active,
  ctaLabel,
}: AuthAwarePublicHeaderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    supabase.auth
      .getUser()
      .then(({ data }) => {
        const user = data.user;
        const metadata = user?.user_metadata ?? {};
        setIsAuthenticated(Boolean(user));
        setUserEmail(user?.email ?? "");
        setUserName(
          typeof metadata.full_name === "string"
            ? metadata.full_name
            : typeof metadata.name === "string"
              ? metadata.name
              : user?.email?.split("@")[0] || "",
        );
      })
      .catch(() => {
        setIsAuthenticated(false);
        setUserEmail("");
        setUserName("");
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      const metadata = user?.user_metadata ?? {};
      setIsAuthenticated(Boolean(user));
      setUserEmail(user?.email ?? "");
      setUserName(
        typeof metadata.full_name === "string"
          ? metadata.full_name
          : typeof metadata.name === "string"
            ? metadata.name
            : user?.email?.split("@")[0] || "",
      );
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <PublicHeader
      active={active}
      ctaLabel={isAuthenticated ? "Workspace" : ctaLabel}
      isAuthenticated={isAuthenticated}
      userEmail={userEmail}
      userName={userName}
    />
  );
}
