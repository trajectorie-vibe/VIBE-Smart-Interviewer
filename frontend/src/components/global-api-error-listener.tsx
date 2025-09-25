"use client";

import { useEffect } from "react";
import { toast } from "@/hooks/use-toast";

/**
 * Listens for CustomEvent<'global-api-error'> dispatched by api-service.ts and shows a toast.
 * This keeps error surfacing consistent across the app without per-page plumbing.
 */
export default function GlobalApiErrorListener() {
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ status: number; message: string; endpoint: string }>;
      const { status, message, endpoint } = ce.detail || { status: 0, message: "Request failed", endpoint: "" };

      // Choose toast variant
      const isAuth = endpoint?.includes("/auth/");
      const variant = status >= 500 ? "destructive" : (status >= 400 ? "default" : undefined);

      // Compose a concise title/description
      const title = status ? `Error ${status}` : "Network error";
      const description = message || (status === 0 ? "Network unreachable. Please check your connection." : "An error occurred.");

      // Avoid noisy toasts for 401s when refresh flow will redirect to login; still inform briefly
      if (status === 401 && isAuth) {
        toast({
          variant: "default",
          title: "Session expired",
          description: "Please log in again.",
        });
        return;
      }

      toast({
        variant: variant as any,
        title,
        description,
      });
    };

    window.addEventListener("global-api-error", handler as EventListener);
    return () => window.removeEventListener("global-api-error", handler as EventListener);
  }, []);

  return null;
}
