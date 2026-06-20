import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg" | "sm";

// Generous defaults: 48px min height (md) so buttons are easy to hit on a
// phone, even for older users. `lg` is for primary screen actions.
const sizes: Record<Size, string> = {
  sm: "min-h-10 px-4 text-sm gap-1.5",
  md: "min-h-12 px-5 text-base gap-2",
  lg: "min-h-14 px-6 text-lg gap-2.5",
};

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-strong)] active:bg-[var(--color-accent-strong)]",
  secondary:
    "bg-[var(--color-surface)] text-fg border border-[var(--color-border)] hover:bg-black/[0.03]",
  ghost: "bg-transparent text-fg hover:bg-black/5",
  danger:
    "bg-transparent text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "primary", size = "md", className = "", ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center rounded-2xl font-medium transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/45 disabled:opacity-50 disabled:pointer-events-none ${sizes[size]} ${variants[variant]} ${className}`}
        {...rest}
      />
    );
  },
);
