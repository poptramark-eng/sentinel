import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "cbe by Softflix", template: "%s | cbe" },
  description: "A focused CBE assessment and learner management workspace for schools and educators.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
