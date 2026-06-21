import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Assessore Lerici",
  description: "Gestione deleghe assessorili — Comune di Lerici",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Assessore Lerici",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className="h-full">
      <body className="min-h-full bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
