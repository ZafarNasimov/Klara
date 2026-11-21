import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DomTranslationGuard } from "@/components/dom-translation-guard";
import { Toaster } from "@/components/ui/sonner";
import { RoleProvider } from "@/lib/role";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Klara", template: "%s – Klara" },
  description: "Baustellenmeldungen in jeder Sprache, deutsche Schreiben nach VOB/B.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // The on-screen keyboard shrinks the layout, so the chat composer stays above it.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <DomTranslationGuard />
        <RoleProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </RoleProvider>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
