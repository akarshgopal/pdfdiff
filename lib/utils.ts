import { twMerge } from "tailwind-merge";

export type TailwindClass = string | false | null | undefined;

export function cn(...inputs: TailwindClass[]) {
  return twMerge(inputs.filter(Boolean).join(" "));
}

export const styleProps = (...values: TailwindClass[]) => ({ className: cn(...values) });
