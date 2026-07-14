import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProPhrase - Say it better at work.",
  description:
    "Rewrite work messages, prepare outcome-focused communication, and continue across devices with Universal Copy.",
  applicationName: "ProPhrase",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/prophrase-app-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/prophrase-app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "ProPhrase",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#111111",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
