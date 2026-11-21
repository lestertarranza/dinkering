"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { buttonClass } from "@/components/ui";

export type BookingPhoneTab = "roster" | "money" | "edit";

const BookingPhoneContext = createContext<{
  tab: BookingPhoneTab;
  setTab: (tab: BookingPhoneTab) => void;
} | null>(null);

function useBookingPhone() {
  const ctx = useContext(BookingPhoneContext);
  if (!ctx) {
    throw new Error("Booking phone tabs are missing their provider.");
  }
  return ctx;
}

const TABS: { id: BookingPhoneTab; label: string }[] = [
  { id: "roster", label: "Roster" },
  { id: "money", label: "Money" },
  { id: "edit", label: "Edit" },
];

/** On a phone, show one booking section at a time. Wider screens show all of them. */
export function BookingPhoneTabs({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<BookingPhoneTab>("roster");

  return (
    <BookingPhoneContext.Provider value={{ tab, setTab }}>
      <div className="sticky top-[3.25rem] z-20 -mx-4 mb-4 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur md:hidden">
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
          {TABS.map((item) => {
            const selected = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(item.id)}
                className={`min-h-11 rounded-md text-sm font-semibold ${
                  selected
                    ? "bg-white text-emerald-800 shadow-sm"
                    : "text-slate-600"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
      {children}
    </BookingPhoneContext.Provider>
  );
}

export function BookingSection({
  tab,
  className = "",
  children,
}: {
  tab: BookingPhoneTab;
  className?: string;
  children: ReactNode;
}) {
  const { tab: active } = useBookingPhone();
  return (
    <div className={`${active === tab ? "" : "max-md:hidden"} ${className}`}>
      {children}
    </div>
  );
}

export function BookingActionBar({
  code,
  statusLabel,
  markPlayed,
}: {
  code: string;
  statusLabel: string;
  markPlayed: ReactNode;
}) {
  const { setTab } = useBookingPhone();
  const [open, setOpen] = useState(false);

  function jump(tab: BookingPhoneTab, targetId: string) {
    setOpen(false);
    setTab(tab);
    window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 60);
  }

  return (
    <div className="admin-action-bar fixed inset-x-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-6px_16px_rgba(15,23,42,0.08)] backdrop-blur md:left-60">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 md:flex-row md:items-center">
        <div className="flex items-center justify-between gap-2 md:mr-auto">
          <p className="min-w-0 truncate text-sm font-medium capitalize text-slate-600">
            {code} · {statusLabel}
          </p>
          <button
            type="button"
            className={`${buttonClass("primary")} md:hidden`}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Close" : "Actions"}
          </button>
        </div>
        <div
          className={`${open ? "flex" : "hidden"} flex-col gap-2 md:flex md:flex-row md:flex-wrap md:items-center [&_a]:justify-center [&_button]:w-full md:[&_button]:w-auto`}
        >
          {markPlayed}
          <button
            type="button"
            className={buttonClass("secondary")}
            onClick={() => jump("edit", "edit-booking")}
          >
            Save / edit
          </button>
          <button
            type="button"
            className={buttonClass("secondary")}
            onClick={() => jump("money", "add-court")}
          >
            Add court
          </button>
        </div>
      </div>
    </div>
  );
}
