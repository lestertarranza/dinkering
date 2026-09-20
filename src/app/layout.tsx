import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  metadataBase: new URL("https://dinkering.lestertarranza.com"),
  title: {
    default: "Dinkering Pickleball",
    template: "%s · Dinkering",
  },
  description:
    "Court bookings, RSVP, payments, and shared expenses for the Dinkering pickleball team.",
  applicationName: "Dinkering",
  openGraph: {
    type: "website",
    locale: "en_PH",
    siteName: "Dinkering Pickleball",
    title: "Dinkering Pickleball",
    description:
      "Court bookings, RSVP, payments, and shared expenses for the Dinkering pickleball team.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dinkering Pickleball",
    description:
      "Court bookings, RSVP, payments, and shared expenses for the Dinkering pickleball team.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
