import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const BASE = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50";

const VARIANTS = {
  default: "bg-primary text-primary-foreground shadow-[0_8px_20px_hsl(var(--primary)/.18)] hover:bg-primary/90",
  outline: "border border-border bg-transparent text-muted-foreground hover:border-foreground/30 hover:bg-card hover:text-foreground",
  ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
} as const;

const SIZES = {
  default: "min-h-10 px-4 py-2",
  sm: "min-h-8 rounded-md px-3 text-xs",
  lg: "min-h-12 rounded-xl px-6 text-sm",
  icon: "size-8 rounded-md",
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}

export function Button({ className, variant = "default", size = "default", type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...props} />;
}
