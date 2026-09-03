"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Power-admin shortcuts:
 *   n  new booking
 *   /  jump to the first search box
 *   g then b/p/e/c  go to bookings / players / expenses / collections
 */
export function AdminHotkeys() {
  const router = useRouter();

  useEffect(() => {
    let awaitingG = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;

    function isTypingTarget(el: EventTarget | null) {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      );
    }

    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      if (awaitingG) {
        awaitingG = false;
        if (gTimer) clearTimeout(gTimer);
        const map: Record<string, string> = {
          b: "/admin/bookings",
          p: "/admin/players",
          e: "/admin/expenses",
          c: "/admin/collections",
          d: "/admin",
        };
        const href = map[e.key.toLowerCase()];
        if (href) {
          e.preventDefault();
          router.push(href);
        }
        return;
      }

      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        router.push("/admin/bookings#new-booking");
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        const el = document.querySelector<HTMLInputElement>(
          "[data-admin-search]",
        );
        if (el) {
          el.focus();
          el.select();
        } else {
          router.push("/admin/players");
        }
        return;
      }
      if (e.key === "g" || e.key === "G") {
        awaitingG = true;
        gTimer = setTimeout(() => {
          awaitingG = false;
        }, 800);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (gTimer) clearTimeout(gTimer);
    };
  }, [router]);

  return null;
}
