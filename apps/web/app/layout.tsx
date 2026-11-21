import type { Metadata, Viewport } from "next";
import "./globals.css";
import InscricaoNotificacoes from "@/components/InscricaoNotificacoes";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://radarbv.com.br"),
  title: {
    default: "Radar BV — Informação em tempo real, de Boa Vista para o mundo",
    template: "%s | Radar BV",
  },
  description:
    "Notícias de Boa Vista e Roraima apuradas e redigidas por uma redação de inteligência artificial, com crédito sempre à fonte original.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Radar BV",
  },
};

export const viewport: Viewport = {
  themeColor: "#0F172A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="font-sans text-slate-700 antialiased flex flex-col min-h-screen">
        {children}
        <InscricaoNotificacoes />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('/sw.js').catch(function () {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
