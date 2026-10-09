"use client";

import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { IconClose } from "./icons";

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
