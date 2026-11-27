import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "cbe by Softflix", template: "%s | cbe" },
  description: "A focused CBE assessment workspace for learner marks, review, results and reporting.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
