import { clerkMiddleware } from "@clerk/nextjs/server";

// Next.js 16 renamed middleware.ts to proxy.ts. clerkMiddleware() only makes the Clerk
// session available to auth() on the server; it does NOT decide who may see what.
//
// Authorization lives next to the data, as Clerk now recommends (path matching in a proxy
// can drift from how Next routes requests):
//   - (app)/layout.tsx: signed-out -> /sign-in, no active profile -> "Nu ai acces"
//   - every server action: requireProfile()
//   - Postgres RLS on every query made with the user client
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
