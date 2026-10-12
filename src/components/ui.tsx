"use client";

import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ComponentType,
  type InputHTMLAttributes,
  type ReactNode,
  type SVGProps,
} from "react";
import { IconClose, IconMinus, IconPlus } from "./icons";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "primary",
  className,
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100",
        size === "sm" && "h-9 px-3 text-sm",
        size === "md" && "h-11 px-4",
        size === "lg" && "h-14 px-5 text-lg",
        variant === "primary" && "bg-accent text-accent-text",
        variant === "secondary" && "bg-surface-2 text-text",
        variant === "ghost" && "text-accent",
        variant === "danger" && "bg-danger text-white",
        className,
      )}
    />
  );
}

export function Input({ label, hint, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return (
    <label className={cx("block", className)}>
      {label && <span className="text-muted mb-1 block text-sm">{label}</span>}
      <input
        {...props}
        className="border-border bg-surface text-text placeholder:text-muted/70 focus:border-accent h-11 w-full rounded-xl border px-3 outline-none"
      />
      {hint && <span className="text-muted mt-1 block text-xs">{hint}</span>}
    </label>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      {label && <span className="text-muted mb-1 block text-sm">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-border bg-surface text-text focus:border-accent h-11 w-full rounded-xl border px-3 outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("border-border bg-surface rounded-2xl border", className)}>{children}</section>;
}

/** Bottom sheet modal, thumb-reachable. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="border-border bg-surface text-text m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-3xl border p-0 backdrop:bg-black/50 sm:mx-auto sm:mb-auto sm:max-w-lg sm:rounded-3xl"
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
            <div className="min-w-0 flex-1 text-lg font-semibold">{title}</div>
            <button onClick={onClose} className="text-muted -mr-2 rounded-full p-2" aria-label="Close">
              <IconClose width={20} height={20} />
            </button>
          </div>
          <div className="pb-safe overflow-y-auto px-4 pb-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx("inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent", className)}
      aria-label="Loading"
    />
  );
}

export function PageHeader({ title, right, left }: { title: ReactNode; right?: ReactNode; left?: ReactNode }) {
  return (
    <header className="pt-safe bg-bg/90 sticky top-0 z-20 backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-4">
        {left}
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">{title}</h1>
        {right}
      </div>
    </header>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-muted px-4 py-6 text-center text-sm">{children}</p>;
}

type IconType = ComponentType<SVGProps<SVGSVGElement>>;
type Option<T> = { value: T; label: string; icon?: IconType; hint?: string };

/** A row of mutually exclusive buttons for 2–4 short options. */
export function Segmented<T extends string | number | null>({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label?: string;
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  className?: string;
}) {
  return (
    <div className={className}>
      {label && <span className="text-muted mb-1 block text-sm">{label}</span>}
      <div className="bg-surface-2 flex rounded-xl p-1" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={cx(
                "flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-sm transition",
                on ? "bg-surface text-text font-medium shadow-sm" : "text-muted",
              )}
            >
              {o.icon && <o.icon width={16} height={16} className="shrink-0" />}
              <span className="truncate">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Large tappable cards with an icon and a one-line description. */
export function ChoiceCards<T extends string>({
  label,
  value,
  onChange,
  options,
  columns = 1,
}: {
  label?: string;
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  columns?: 1 | 2 | 3;
}) {
  return (
    <div>
      {label && <span className="text-muted mb-1 block text-sm">{label}</span>}
      <div
        role="radiogroup"
        aria-label={label}
        className={cx("grid gap-2", columns === 2 && "grid-cols-2", columns === 3 && "grid-cols-3")}
      >
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={cx(
                "flex items-center gap-3 rounded-xl border p-3 text-left transition active:scale-[0.98]",
                columns > 1 && !o.hint && "flex-col justify-center gap-1.5 text-center",
                on ? "border-accent bg-accent-soft/60" : "border-border bg-surface",
              )}
            >
              {o.icon && (
                <span
                  className={cx(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    on ? "bg-accent text-accent-text" : "bg-surface-2 text-muted",
                  )}
                >
                  <o.icon width={18} height={18} />
                </span>
              )}
              <span className="min-w-0">
                <span className={cx("block text-sm", on && "font-medium")}>{o.label}</span>
                {o.hint && <span className="text-muted block text-xs">{o.hint}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A row of small pills, e.g. 0–7 days or quick amounts. */
export function Pills<T extends string | number>({
  label,
  value,
  onChange,
  options,
  format = String,
}: {
  label?: string;
  value: T | null;
  onChange: (v: T) => void;
  options: readonly T[];
  format?: (v: T) => string;
}) {
  return (
    <div>
      {label && <span className="text-muted mb-1 block text-sm">{label}</span>}
      <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={o === value}
            onClick={() => onChange(o)}
            className={cx(
              "tabular h-10 min-w-0 flex-1 rounded-lg border text-sm transition",
              o === value ? "border-accent bg-accent text-accent-text font-medium" : "border-border bg-surface",
            )}
          >
            {format(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** An on/off switch with a label and optional description. */
export function Toggle({
  label,
  hint,
  checked,
  onChange,
  icon: Icon,
}: {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon?: IconType;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      {Icon && (
        <span className="bg-surface-2 text-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
          <Icon width={18} height={18} />
        </span>
      )}
      <span className="min-w-0 flex-1 text-sm">
        {label}
        {hint && <span className="text-muted block text-xs">{hint}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className={cx(
          "relative h-7 w-12 shrink-0 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent)]",
          checked ? "bg-accent" : "bg-border",
        )}
      >
        <span className={cx("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-6" : "left-1")} />
      </span>
    </label>
  );
}

/** Number field with − and + buttons either side. Empty means "not set". */
export function Stepper({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  max = 100000,
  unit,
  decimals = 0,
  start,
}: {
  label?: string;
  /** Where − / + start from when the field is empty. */
  start?: number;
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  decimals?: number;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n * 10 ** decimals) / 10 ** decimals));
  const bump = (d: number) => onChange(value == null && start != null ? start : clamp((value ?? min) + d));
  return (
    <div>
      {label && <span className="text-muted mb-1 block text-sm">{label}</span>}
      <div className="border-border bg-surface focus-within:border-accent flex h-11 items-center rounded-xl border">
        <button type="button" onClick={() => bump(-step)} className="text-muted h-full px-3" aria-label={`Less${label ? ` ${label}` : ""}`}>
          <IconMinus width={18} height={18} />
        </button>
        <input
          type="number"
          inputMode="decimal"
          aria-label={label}
          min={min}
          max={max}
          step="any"
          value={value ?? ""}
          placeholder={start != null ? String(start) : undefined}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          onFocus={(e) => e.target.select()}
          className="tabular placeholder:text-muted/50 h-full w-full min-w-0 flex-1 bg-transparent text-center outline-none"
        />
        {unit && <span className="text-muted pr-1 text-sm">{unit}</span>}
        <button type="button" onClick={() => bump(step)} className="text-muted h-full px-3" aria-label={`More${label ? ` ${label}` : ""}`}>
          <IconPlus width={18} height={18} />
        </button>
      </div>
    </div>
  );
}

/** Small uppercase heading with an icon, used above cards. */
export function SectionTitle({ icon: Icon, children, right }: { icon?: IconType; children: ReactNode; right?: ReactNode }) {
  return (
    <h2 className="text-muted mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
      {Icon && <Icon width={14} height={14} />}
      <span className="flex-1">{children}</span>
      {right}
    </h2>
  );
}
