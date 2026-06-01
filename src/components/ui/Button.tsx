import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const styles: Record<Variant, string> = {
  primary:
    "bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50",
  secondary: "bg-black/5 text-fg hover:bg-black/10 disabled:opacity-50",
  ghost: "bg-transparent text-fg hover:bg-black/5 disabled:opacity-50",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ variant = "primary", className = "", ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${styles[variant]} ${className}`}
        {...rest}
      />
    );
  },
);
