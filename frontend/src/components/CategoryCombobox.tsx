"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import api from "@/lib/axios";

export type CategoryKind =
  | "business"
  | "service"
  | "product"
  | "specialty"
  | "discover";

export type CategoryOption = {
  value: string;
  label: string;
  source: "shop" | "catalog" | string;
};

type Props = {
  kind: CategoryKind;
  value: string;
  onChange: (value: string, option?: CategoryOption) => void;
  businessId?: string | null;
  label?: string;
  placeholder?: string;
  allowCustom?: boolean;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  inputClassName?: string;
};

async function fetchOptions(params: {
  kind: CategoryKind;
  businessId?: string | null;
  q: string;
}): Promise<{ options: CategoryOption[]; allowCustom: boolean }> {
  const query: Record<string, string | number> = {
    kind: params.kind,
    q: params.q.slice(0, 100),
    limit: 30,
  };
  if (
    params.businessId &&
    (params.kind === "service" ||
      params.kind === "product" ||
      params.kind === "specialty")
  ) {
    query.businessId = params.businessId;
  }
  const response = await api.get("/category-options", { params: query });
  const data = response.data?.data ?? response.data;
  return {
    options: Array.isArray(data?.options) ? data.options : [],
    allowCustom: data?.allowCustom !== false,
  };
}

export default function CategoryCombobox({
  kind,
  value,
  onChange,
  businessId,
  label,
  placeholder = "Search or type a category",
  allowCustom,
  disabled,
  required,
  className,
  inputClassName,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<CategoryOption[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [customAllowed, setCustomAllowed] = useState(allowCustom ?? true);

  const load = useCallback(
    async (q: string, openMenu = false) => {
      const id = ++requestId.current;
      const shop = businessId || null;
      setLoading(true);
      setError(null);
      try {
        const result = await fetchOptions({ kind, businessId: shop, q });
        if (id !== requestId.current) return;
        setOptions(result.options);
        setCustomAllowed(allowCustom ?? result.allowCustom);
        setActiveIndex(result.options.length ? 0 : -1);
        if (openMenu) setOpen(true);
      } catch (err: unknown) {
        if (id !== requestId.current) return;
        const status =
          typeof err === "object" &&
          err &&
          "response" in err &&
          (err as { response?: { status?: number } }).response?.status;
        setOptions([]);
        setError(
          status === 403
            ? "You do not have access to these suggestions"
            : "Could not load suggestions",
        );
        if (openMenu) setOpen(true);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [allowCustom, businessId, kind],
  );

  useEffect(() => {
    requestId.current += 1;
    setOptions([]);
    setError(null);
    setOpen(false);
  }, [businessId, kind]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(() => void load(value, true), 250);
    return () => window.clearTimeout(handle);
  }, [value, open, load]);

  const select = (option: CategoryOption) => {
    onChange(option.label, option);
    setOpen(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) void load(value, true);
      else setActiveIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) select(option);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={className ?? "relative"}>
      {label ? (
        <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-400">
          {label}
        </span>
      ) : null}
      <div className="relative">
        <input
          ref={inputRef}
          value={value}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (!open) void load(value, true);
          }}
          onKeyDown={onKeyDown}
          className={
            inputClassName
              ? `${inputClassName} pr-10`
              : "w-full rounded-lg border border-slate-200 bg-white px-4 py-3 pr-10 text-slate-900 outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:bg-slate-50"
          }
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Show category suggestions"
          onClick={() => {
            if (open) setOpen(false);
            else {
              inputRef.current?.focus();
              void load(value, true);
            }
          }}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500 hover:text-slate-800 disabled:opacity-40"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {loading ? (
            <p className="px-3 py-2 text-sm text-slate-500">Loading…</p>
          ) : error ? (
            <p className="px-3 py-2 text-sm text-rose-600">{error}</p>
          ) : options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">
              {customAllowed
                ? "No matches. You can keep a custom category."
                : "No matching categories."}
            </p>
          ) : (
            options.map((option, index) => (
              <button
                key={`${option.source}-${option.value}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={`flex w-full flex-col px-3 py-2 text-left text-sm ${
                  index === activeIndex ? "bg-teal-50" : "hover:bg-slate-50"
                }`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(option)}
              >
                <span className="font-medium text-slate-900">{option.label}</span>
                <span className="text-xs text-slate-500">
                  {option.source === "shop" ? "Used in this shop" : "Suggested"}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
