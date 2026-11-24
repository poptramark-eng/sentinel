import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "CBE | Assessment Management", template: "%s | CBE" },
  description: "CBE is an assessment management platform connecting examination councils, schools and educators. A Softflix product.",
  applicationName: "CBE Assessment Management",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
