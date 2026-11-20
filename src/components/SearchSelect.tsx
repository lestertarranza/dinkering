"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
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
    <div className={`relative ${className}`}>
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
      {open && !disabled ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-400">No matches</li>
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
                    className={`block w-full px-3 py-2 text-left text-sm ${
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
        </ul>
      ) : null}
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
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-400">No matches</li>
          ) : (
            matches.map((option, index) => (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className={`block w-full px-3 py-2 text-left text-sm ${
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
        </ul>
      ) : null}
    </div>
  );
}
