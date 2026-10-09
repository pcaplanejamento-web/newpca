import { dfdsLegiveisNaMesa, escopoMesa } from "@/lib/acesso-mesa";
import { exigirAcesso } from "@/lib/api-auth";
import { getRegrasAvaliacao } from "@/lib/avaliacao";
import { classificarAssunto } from "@/lib/avaliacao-core";
import { avaliarLinhaDfd, gravacaoIncompleta } from "@/lib/conferencia-dfd";
import { listarDfdsCompletosPorIds } from "@/lib/dfd";
import { conferenciaDfdsSchema } from "@/lib/dfd-validation";
import { erro, ok, parseCorpo } from "@/lib/http";
import { listarOrgaos } from "@/lib/orgaos";
import { unidadesConferencia } from "@/lib/reparticoes";

export const dynamic = "force-dynamic";

/**
 * CONFERÊNCIA da lista de DFDs da Mesa — a MESMA da análise (`avaliarLinhaDfd`: estado + resumo da
 * célula + validação da assinatura), calculada no servidor sobre o DFD COMPLETO (itens/seções/
 * assinaturas) e a unidade REAL de cada um. O cliente pede em fatias de ids (lazy, depois do load),
 * então a lista abre leve e o Estado de cada linha chega em seguida ("Conferindo…").
 * Leitura: só os DFDs que a pessoa LÊ (como `GET /api/dfd/[id]`).
 */
export async function POST(req: Request) {
  const a = await exigirAcesso(["dfd", "pca"], "visualizar");
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(conferenciaDfdsSchema, req);
  if ("resp" in p) return p.resp;
  const [todos, regras, orgaos, esc] = await Promise.all([listarDfdsCompletosPorIds(p.data.ids), getRegrasAvaliacao(), listarOrgaos(), escopoMesa()]);
  if (!esc) return erro("Faça login.", 401);
  // Só os DFDs que a pessoa LÊ (a unidade dele ou a do protocolo no escopo, e as linhas dela) — os demais somem da resposta.
  const dfds = await dfdsLegiveisNaMesa(esc, todos);
  const unidades = new Map((await unidadesConferencia(dfds.map((d) => d.reparticaoId))).map((u) => [u.id, u]));
  const linhas = dfds.map((d) => {
    // O DFD GRAVADO pela metade (gravação em lotes que falhou no meio) é ERRO até reenviar.
    const r = avaliarLinhaDfd({ ...d, gravacaoIncompleta: gravacaoIncompleta(d) }, d.reparticaoId != null ? (unidades.get(d.reparticaoId) ?? null) : null, {
      anoPca: d.anoPca ?? d.protocoloAnoPca,
      regras,
      categoria: classificarAssunto(d.protocoloAssunto),
      orgaos,
    });
    return { id: d.id, estado: r.estado, resumo: r.resumo ?? null, validacao: r.validacao };
  });
  return ok({ linhas });
}
