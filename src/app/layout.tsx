import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Hostel Kitchen OS",
  description: "Secure multi-campus kitchen inventory and operations.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
