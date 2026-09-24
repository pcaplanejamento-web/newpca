import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// A tela Protocolos legada saiu: os protocolos vivem na Mesa. Mantém a rota antiga redirecionando p/ não quebrar links.
export default function ProtocolosRedirect() {
  redirect("/painel/mesa");
}
