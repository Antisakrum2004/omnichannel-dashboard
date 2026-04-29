import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Омниканал — Единое окно общения",
  description: "Unified omnichannel messaging dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="antialiased bg-[#0f1117] text-slate-200">
        {children}
      </body>
    </html>
  );
}
