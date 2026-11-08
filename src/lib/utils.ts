import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Escape LIKE/ILIKE wildcards so user text matches literally ("_" and "%" are legal in emails and searches).
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)
