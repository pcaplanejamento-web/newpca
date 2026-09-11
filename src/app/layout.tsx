import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/Toast";

// Fontes do design system (self-hosted, sem requisição externa): Geist (texto)
// e Geist Mono (nº de protocolo, datas, contadores, ⌘K). Expõem
// --font-geist-sans / --font-geist-mono, consumidos por --font-sans/--font-mono.

export const metadata: Metadata = {
  title: "Plataforma PCA — Rio Verde",
  description:
    "Plataforma de Planejamento de Contratações Anuais da Prefeitura de Rio Verde.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        {/* Shim: o bundle OpenNext/esbuild injeta chamadas `__name(...)` no
            script inline do next-themes; sem esta definição global o script
            falhava ("__name is not defined") e o tema só era aplicado após a
            hidratação, causando o flash branco→preto. Roda antes do ThemeProvider. */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: shim de 1 linha com conteúdo 100% estático (sem dados do usuário). */}
        <script dangerouslySetInnerHTML={{ __html: "globalThis.__name||=(f)=>f;" }} />
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
