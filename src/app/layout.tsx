import type { Metadata, Viewport } from "next";
import { Manrope, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const manrope = Manrope({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
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
