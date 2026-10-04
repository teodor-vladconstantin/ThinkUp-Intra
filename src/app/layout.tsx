import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { roRO } from "@clerk/localizations";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"], // latin-ext covers ă, â, î, ș, ț
});

// Only the italic cut, only for the dashboard title (PRD section 9).
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin", "latin-ext"],
  style: "italic",
});

export const metadata: Metadata = {
  title: "ThinkUp Intranet",
  description: "Intranetul ThinkUp Academy",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ro" className={`${inter.variable} ${playfair.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ClerkProvider localization={roRO}>
          <TooltipProvider>{children}</TooltipProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
