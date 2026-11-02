import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tasklane — Your personal task workspace",
  description:
    "A calm, private workspace to capture tasks, find your focus, and make progress.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
