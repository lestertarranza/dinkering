"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { inputClass } from "@/components/ui";

export type SearchOption = {
  value: string;
  label: string;
  group?: string;
};

export function filterSearchOptions(
  options: SearchOption[],
  query: string,
): SearchOption[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return options;
  return options.filter((option) =>
    option.label.toLowerCase().includes(needle),
  );
}

function labelFor(options: SearchOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? "";
}

/** Decide whether a search menu opens above the field and how tall it can be. */
export function searchMenuFrame(input: {
  inputTop: number;
  inputBottom: number;
  viewTop: number;
  viewBottom: number;
  reserveBottom: number;
}): { above: boolean; maxHeight: number } {
  const gap = 4;
  const spaceBelow =
    input.viewBottom - input.reserveBottom - input.inputBottom - gap;
  const spaceAbove = input.inputTop - input.viewTop - gap;
  const above = spaceBelow < 160 && spaceAbove > spaceBelow;
  const available = above ? spaceAbove : spaceBelow;
  return { above, maxHeight: Math.max(96, Math.min(240, available)) };
}

function FloatingMenu({
  open,
  anchorRef,
  id,
  children,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  id: string;
  children: ReactNode;
}) {
  const [frame, setFrame] = useState<{
    above: boolean;
    maxHeight: number;
    left: number;
    width: number;
    top: number;
    bottom: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewTop = viewport?.offsetTop ?? 0;
      const viewBottom = viewTop + (viewport?.height ?? window.innerHeight);
      const reserveBottom = window.innerWidth < 768 ? 128 : 12;
      const decision = searchMenuFrame({
        inputTop: rect.top,
        inputBottom: rect.bottom,
        viewTop,
        viewBottom,
        reserveBottom,
      });
      const width = Math.min(rect.width, window.innerWidth - 16);
      let left = rect.left;
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - 8 - width);
      }
      setFrame({
        above: decision.above,
        maxHeight: decision.maxHeight,
        left,
        width,
        top: rect.bottom + 4,
        bottom: window.innerHeight - rect.top + 4,
      });
    }
    place();
    const viewport = window.visualViewport;
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    viewport?.addEventListener("resize", place);
    viewport?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      viewport?.removeEventListener("resize", place);
      viewport?.removeEventListener("scroll", place);
    };
  }, [open, anchorRef]);

  if (!open || !frame || typeof document === "undefined") return null;
  return createPortal(
    <ul
      id={id}
      role="listbox"
      style={{
        position: "fixed",
        left: frame.left,
        width: frame.width,
        maxHeight: frame.maxHeight,
        zIndex: 60,
        ...(frame.above ? { bottom: frame.bottom } : { top: frame.top }),
      }}
      className="overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
    >
      {children}
    </ul>,
    document.body,
  );
}

/**
 * A short searchable dropdown. The chosen value is submitted with `name`.
 * Typing filters the menu instead of scrolling a page-long native select.
 */
export function SearchSelect({
  name,
  options,
  placeholder = "Search…",
  required = false,
  disabled = false,
  value: valueProp,
  defaultValue = "",
  onChange,
  className = "",
}: {
  name: string;
  options: SearchOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  className?: string;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const isControlled = valueProp !== undefined;
  const [innerValue, setInnerValue] = useState(defaultValue);
  const selected = isControlled ? valueProp : innerValue;
  const selectedLabel = labelFor(options, selected);
  const [seen, setSeen] = useState(selected);
  const [text, setText] = useState(selectedLabel);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  if (selected !== seen) {
    setSeen(selected);
    if (selected) setText(labelFor(options, selected));
  }

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const typed = text.trim().toLowerCase();
    const matchesSelection =
      selected !== "" && typed === selectedLabel.trim().toLowerCase();
    if (required && !matchesSelection) {
      input.setCustomValidity("Choose a name from the list.");
    } else {
      input.setCustomValidity("");
    }
  }, [required, selected, selectedLabel, text]);

  const matches = useMemo(
    () => filterSearchOptions(options, text === selectedLabel ? "" : text),
    [options, text, selectedLabel],
  );

  function commit(value: string) {
    if (!isControlled) setInnerValue(value);
    onChange?.(value);
  }

  function choose(option: SearchOption) {
    commit(option.value);
    setText(option.label);
    setOpen(false);
  }

  function onTextChange(next: string) {
    setText(next);
    setOpen(true);
    setActive(0);
    const exact = options.filter(
      (option) => option.label.toLowerCase() === next.trim().toLowerCase(),
    );
    if (exact.length === 1) {
      commit(exact[0].value);
      return;
    }
    if (selected) commit("");
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, Math.max(matches.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open && matches[active]) {
      event.preventDefault();
      choose(matches[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setText(selectedLabel);
    }
  }

  let previousGroup = "";

  return (
    <div ref={anchorRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={text}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        className={inputClass}
        onFocus={() => {
          if (!disabled) setOpen(true);
        }}
        onChange={(event) => onTextChange(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          setOpen(false);
          const exact = options.filter(
            (option) =>
              option.label.toLowerCase() === text.trim().toLowerCase(),
          );
          if (exact.length === 1) {
            choose(exact[0]);
            return;
          }
          if (!text.trim()) {
            commit("");
            return;
          }
          setText(selectedLabel);
          if (selected) commit(selected);
        }}
      />
      <input type="hidden" name={name} value={selected} />
      <FloatingMenu
        open={open && !disabled}
        anchorRef={anchorRef}
        id={listId}
      >
        {matches.length === 0 ? (
          <li className="px-3 py-3 text-sm text-slate-400">No matches</li>
        ) : (
          matches.map((option, index) => {
            const showGroup = option.group && option.group !== previousGroup;
            if (option.group) previousGroup = option.group;
            return (
              <li key={option.value}>
                {showGroup ? (
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {option.group}
                  </p>
                ) : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === selected}
                  className={`block min-h-11 w-full px-3 py-2.5 text-left text-sm ${
                    index === active
                      ? "bg-emerald-50 text-emerald-900"
                      : "text-slate-800 hover:bg-slate-50"
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(option)}
                >
                  {option.label}
                </button>
              </li>
            );
          })
        )}
      </FloatingMenu>
    </div>
  );
}

/** Search, then add several names. Each choice is submitted under `name`. */
export function SearchMultiSelect({
  name,
  options,
  placeholder = "Search and add…",
}: {
  name: string;
  options: SearchOption[];
  placeholder?: string;
}) {
  const listId = useId();
  const anchorRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const chosen = new Set(selected);
  const matches = filterSearchOptions(
    options.filter((option) => !chosen.has(option.value)),
    text,
  );
  const labelByValue = new Map(options.map((option) => [option.value, option.label]));

  function add(option: SearchOption) {
    setSelected((current) =>
      current.includes(option.value) ? current : [...current, option.value],
    );
    setText("");
    setActive(0);
    setOpen(true);
  }

  return (
    <div className="relative">
      {selected.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
      {selected.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((value) => (
            <button
              key={value}
              type="button"
              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200"
              onClick={() =>
                setSelected((current) => current.filter((id) => id !== value))
              }
            >
              {labelByValue.get(value) ?? value}
              <span aria-hidden="true">×</span>
              <span className="sr-only">Remove</span>
            </button>
          ))}
        </div>
      ) : null}
      <input
        ref={anchorRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={text}
        placeholder={placeholder}
        className={inputClass}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((index) =>
              Math.min(index + 1, Math.max(matches.length - 1, 0)),
            );
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter" && open && matches[active]) {
            event.preventDefault();
            add(matches[active]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      <FloatingMenu open={open} anchorRef={anchorRef} id={listId}>
        {matches.length === 0 ? (
          <li className="px-3 py-3 text-sm text-slate-400">No matches</li>
        ) : (
          matches.map((option, index) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className={`block min-h-11 w-full px-3 py-2.5 text-left text-sm ${
                  index === active
                    ? "bg-emerald-50 text-emerald-900"
                    : "text-slate-800 hover:bg-slate-50"
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => add(option)}
              >
                {option.label}
              </button>
            </li>
          ))
        )}
      </FloatingMenu>
    </div>
  );
}
