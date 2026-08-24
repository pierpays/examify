import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AccountStatusGuard from "@/components/auth/account-status-guard";
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
  title: {
    default: "Examtify — Learn. Connect. Achieve.",
    template: "%s | Examtify",
  },
  description:
    "An academic community for students, teachers, parents, and verified institutions to connect, practice, share resources, and celebrate learning achievements.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AccountStatusGuard />
        {children}
      </body>
    </html>
  );
}
