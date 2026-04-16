import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FamPlan",
  description:
    "A family coordination layer for shared plans, reminders, birthdays, and short-notice activities.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-[var(--background)] text-[var(--foreground)]">
        {children}
      </body>
    </html>
  );
}
