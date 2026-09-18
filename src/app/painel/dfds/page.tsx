import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// A tela "DFD" virou "Mesa" (/painel/mesa). Mantém a rota antiga redirecionando p/ não quebrar links.
export default function DfdsRedirect() {
  redirect("/painel/mesa");
}
