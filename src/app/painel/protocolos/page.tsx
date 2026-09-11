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
  searchParams: Promise<{ q?: string; situacao?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() || "";
  // Só aceita situações válidas (evita filtro inválido vindo da URL).
  const situacao = SITUACOES.some((s) => s.valor === sp.situacao) ? sp.situacao! : "";
  const u = await getUsuarioAtual();
  const podeEditar = u?.role === "admin" || u?.role === "gestor";

  const [inicial, resumo, opcoes] = await Promise.all([
    listarProtocolos({ q, situacao, page: 1 }),
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
      situacaoInicial={situacao}
    />
  );
}
