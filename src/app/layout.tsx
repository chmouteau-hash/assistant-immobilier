import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Assistant immobilier",
  description: "Dossier privé de projet immobilier — local, sans compte, sans serveur distant.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Immobilier", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#171717",
  width: "device-width",
  initialScale: 1,
  // `viewport-fit=cover` : la barre de navigation collante tient compte de l'encoche du téléphone.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">{children}</body>
    </html>
  );
}
