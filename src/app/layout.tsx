import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/providers";

// Fonts are bundled (latin variable woff2 from Fontsource, OFL) so builds never fetch Google Fonts.
const manrope = localFont({
  variable: "--font-heading",
  src: "./fonts/manrope-latin-wght-normal.woff2",
  weight: "200 800",
});

const inter = localFont({
  variable: "--font-body",
  src: "./fonts/inter-latin-wght-normal.woff2",
  weight: "100 900",
});

const jetbrainsMono = localFont({
  variable: "--font-mono",
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  weight: "100 800",
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://sous-chef-website.vercel.app"),
  icons: { icon: [{ url: "/brand/icon.svg", type: "image/svg+xml" }] },
  openGraph: { images: [{ url: "/brand/social.png", width: 1200, height: 630, alt: "Sous Chef" }] },
  twitter: { card: "summary_large_image", images: ["/brand/social.png"] },
  title: "Sous Chef",
  description: "Open-source, self-hostable personal kitchen assistant",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sous Chef",
  },
};

export const viewport: Viewport = { themeColor: "#009966", width: "device-width", initialScale: 1 };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${manrope.variable} ${inter.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  for (var r of registrations) { r.unregister(); }
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
