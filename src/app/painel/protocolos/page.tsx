import { ProtocolosView } from "@/components/ProtocolosView";
import { getUsuarioAtual } from "@/lib/auth";
import {
  SITUACOES,
  getResumoProtocolos,
  listarOpcoes,
  listarProtocolos,
} from "@/lib/protocolos";

export const dynamic = "force-dynamic";

export default async function ProtocolosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = (await searchParams).q?.trim() || "";
  const u = await getUsuarioAtual();
  const podeEditar = u?.role === "admin" || u?.role === "gestor";

  const [inicial, resumo, opcoes] = await Promise.all([
    listarProtocolos({ q, page: 1 }),
    getResumoProtocolos(),
    listarOpcoes(),
  ]);

  return (
    <ProtocolosView
      inicial={inicial}
      resumo={resumo}
      opcoes={opcoes}
      situacoes={SITUACOES.map((s) => ({ valor: s.valor, label: s.label }))}
      podeEditar={podeEditar}
      buscaInicial={q}
    />
  );
}
