import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CBE Platform", template: "%s | CBE Platform" },
  description: "A trusted examination management platform for councils, schools and educators.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
