import type { Metadata } from "next";
import "../../public/sistema.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "Staiano | Configuratore HVAC",
  description: "Progettazione preliminare HVAC locale — Termoidraulica Staiano",
  icons: { icon: "/logo.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
