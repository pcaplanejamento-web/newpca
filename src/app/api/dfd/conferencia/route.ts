import { exigirUsuario } from "@/lib/api-auth";
import { getRegrasAvaliacao } from "@/lib/avaliacao";
import { classificarAssunto } from "@/lib/avaliacao-core";
import { avaliarLinhaDfd } from "@/lib/conferencia-dfd";
import { listarDfdsCompletosPorIds } from "@/lib/dfd";
import { conferenciaDfdsSchema } from "@/lib/dfd-validation";
import { ok, parseCorpo } from "@/lib/http";
import { listarOrgaos } from "@/lib/orgaos";
import { unidadesConferencia } from "@/lib/reparticoes";

export const dynamic = "force-dynamic";

/**
 * CONFERÊNCIA da lista de DFDs da Mesa — a MESMA da análise (`avaliarLinhaDfd`: estado + resumo da
 * célula + validação da assinatura), calculada no servidor sobre o DFD COMPLETO (itens/seções/
 * assinaturas) e a unidade REAL de cada um. O cliente pede em fatias de ids (lazy, depois do load),
 * então a lista abre leve e o Estado de cada linha chega em seguida ("Conferindo…").
 * Leitura: segue o escopo da lista (como `GET /api/dfd/[id]`).
 */
export async function POST(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(conferenciaDfdsSchema, req);
  if ("resp" in p) return p.resp;
  const [dfds, regras, orgaos] = await Promise.all([listarDfdsCompletosPorIds(p.data.ids), getRegrasAvaliacao(), listarOrgaos()]);
  const unidades = new Map((await unidadesConferencia(dfds.map((d) => d.reparticaoId))).map((u) => [u.id, u]));
  const linhas = dfds.map((d) => {
    const r = avaliarLinhaDfd(d, d.reparticaoId != null ? (unidades.get(d.reparticaoId) ?? null) : null, {
      anoPca: d.anoPca ?? d.protocoloAnoPca,
      regras,
      categoria: classificarAssunto(d.protocoloAssunto),
      orgaos,
    });
    return { id: d.id, estado: r.estado, resumo: r.resumo ?? null, validacao: r.validacao };
  });
  return ok({ linhas });
}
