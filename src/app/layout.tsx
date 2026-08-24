import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ECOD — Enterprise Capability on Demand",
  description:
    "Assess, gap-map, enrich and validate technology professionals into an enterprise-ready talent pool.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
