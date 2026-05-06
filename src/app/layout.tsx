import type { Metadata } from "next";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { Inter, Montserrat } from "next/font/google";
import Providers from "@/components/Providers";
import { LIFEHUB_LOGO_SRC } from "@/lib/lifehubLogo";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LifeHub",
  description: "Modern Clinic Management System",
  icons: {
    icon: [{ url: LIFEHUB_LOGO_SRC, type: "image/png" }],
    apple: [{ url: LIFEHUB_LOGO_SRC, type: "image/png" }],
    shortcut: [{ url: LIFEHUB_LOGO_SRC, type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${montserrat.variable}`}>
        <AppRouterCacheProvider options={{ enableCssLayer: true }}>
          <Providers>{children}</Providers>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
