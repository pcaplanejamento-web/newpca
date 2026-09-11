import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

// Fonte padrão do sistema (self-hosted via next/font — sem requisição externa).
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Plataforma PCA — Rio Verde",
  description:
    "Plataforma de Planejamento de Contratações Anuais da Prefeitura de Rio Verde.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={inter.variable} suppressHydrationWarning>
      <body>
        {/* Shim: o bundle OpenNext/esbuild injeta chamadas `__name(...)` no
            script inline do next-themes; sem esta definição global o script
            falhava ("__name is not defined") e o tema só era aplicado após a
            hidratação, causando o flash branco→preto. Roda antes do ThemeProvider. */}
        <script dangerouslySetInnerHTML={{ __html: "globalThis.__name||=(f)=>f;" }} />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
