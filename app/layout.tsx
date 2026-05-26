import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job Pls",
  description: "Fast, free, legal job alerts for target companies.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-background">
      <body className="antialiased">{children}</body>
    </html>
  );
}
