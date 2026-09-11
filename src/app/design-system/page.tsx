import type { Metadata } from "next";
import { Catalogo } from "@/components/designsystem/Catalogo";

// Biblioteca de componentes pública (spec §39.25) — validação do design system e
// do Theme Playground. Sem dados sensíveis; a persistência do tema (ADM) fica em
// /painel/aparencia.
export const metadata: Metadata = {
  title: "Design System — Plataforma PCA",
};

export default function DesignSystemPage() {
  return <Catalogo />;
}
