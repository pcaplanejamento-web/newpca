import type { Metadata } from "next";
import { AcessoRestrito } from "@/components/AcessoRestrito";
import { Catalogo } from "@/components/designsystem/Catalogo";
import { getUsuarioAtual } from "@/lib/auth";

// Biblioteca de componentes — SÓ o ADM, dentro do sistema (a única tela pública é a consulta do PCA em "/").
export const metadata: Metadata = {
  title: "Biblioteca de componentes — Plataforma PCA",
};

export const dynamic = "force-dynamic";

export default async function DesignSystemPage() {
  const u = await getUsuarioAtual();
  if (!u?.admin) return <AcessoRestrito mensagem="Somente administradores podem acessar a biblioteca de componentes." />;
  return <Catalogo />;
}
