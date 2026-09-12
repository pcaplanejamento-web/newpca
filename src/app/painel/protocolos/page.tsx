import { ProtocolosView } from "@/components/ProtocolosView";
import { getUsuarioAtual } from "@/lib/auth";
import { getReparticaoContexto } from "@/lib/grupos";
import {
  SITUACOES,
  getResumoProtocolos,
  listarAnos,
  listarOpcoes,
  listarProtocolos,
} from "@/lib/protocolos";

export const dynamic = "force-dynamic";

const ehGeral = (codigo: string) => codigo.trim().toUpperCase() === "GERAL";

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

  const [inicial, resumo, opcoes, anos, repCtx] = await Promise.all([
    listarProtocolos({ q, situacao, page: 1 }),
    getResumoProtocolos(),
    listarOpcoes(),
    listarAnos(),
    getReparticaoContexto(u),
  ]);

  // Órgão = repartição. "Geral" é sentinela (todas), nunca um órgão selecionável.
  const reparticoes = repCtx.lista.filter((r) => !ehGeral(r.codigo));
  const reparticaoAtiva = repCtx.ativa && !ehGeral(repCtx.ativa.codigo) ? repCtx.ativa : null;

  return (
    <ProtocolosView
      inicial={inicial}
      resumo={resumo}
      opcoes={opcoes}
      situacoes={SITUACOES.map((s) => ({ valor: s.valor, label: s.label }))}
      reparticoes={reparticoes}
      reparticaoAtiva={reparticaoAtiva}
      anos={anos}
      podeEditar={podeEditar}
      buscaInicial={q}
      situacaoInicial={situacao}
    />
  );
}
