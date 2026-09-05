import type { ButtonHTMLAttributes } from "react";
import { cx, ui } from "@pdfdiff/viewer-react/ui";

const BASE = `inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 ${ui.focus} focus-visible:ring-offset-2 focus-visible:ring-offset-background`;

const VARIANTS = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  outline:
    "border border-border bg-card text-muted-foreground hover:border-foreground/30 hover:bg-background hover:text-foreground",
  ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
} as const;

const SIZES = {
  default: "min-h-10 px-4 py-2 text-sm",
  sm: "min-h-8 px-3 text-xs",
  lg: "min-h-12 px-6 text-sm",
  icon: "size-8",
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}

export function Button({ className, variant = "default", size = "default", type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cx(BASE, VARIANTS[variant], SIZES[size], className)} {...props} />;
}
