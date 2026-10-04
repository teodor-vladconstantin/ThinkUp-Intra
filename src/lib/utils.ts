export { cn } from "cn"

// Escape LIKE/ILIKE wildcards so user text matches literally ("_" and "%" are legal in emails and searches).
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)
