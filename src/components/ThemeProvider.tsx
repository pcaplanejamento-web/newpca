"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";
import { TemaPessoal } from "./TemaPessoal";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      value={{ light: "light", dark: "dark" }}
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <TemaPessoal />
      {children}
    </NextThemesProvider>
  );
}
