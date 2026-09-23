import { exigirUsuario } from "@/lib/api-auth";
import { getRegrasAvaliacao } from "@/lib/avaliacao";
import { classificarAssunto } from "@/lib/avaliacao-core";
import { avaliarLinhaDfd, avaliarProtocolo } from "@/lib/conferencia-dfd";
import { type DfdDetalhe, listarDfdsCompletosDosProtocolos } from "@/lib/dfd";
import { conferenciaProtocolosSchema } from "@/lib/dfd-validation";
import { getReparticaoContexto } from "@/lib/grupos";
import { ok, parseCorpo } from "@/lib/http";
import { listarOrgaos } from "@/lib/orgaos";
import { listarProtocolosPorIds } from "@/lib/protocolo";
import { unidadesConferencia } from "@/lib/reparticoes";

export const dynamic = "force-dynamic";

/**
 * ESTADO AGREGADO da lista de PROTOCOLOS da Mesa: cada protocolo ACUMULA os problemas de dentro — a
 * conciliação da capa + TODOS os problemas dos seus DFDs e itens (a MESMA conferência por linha da
 * análise, `avaliarLinhaDfd`, sobre os DFDs COMPLETOS e as unidades REAIS). O cliente pede em fatias
 * (lazy); a célula mostra "Conferindo…" até chegar. Leitura escopada por UNIDADE (como `GET
 * /api/protocolo/[id]`): protocolo de unidade sem acesso é ignorado.
 */
export async function POST(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(conferenciaProtocolosSchema, req);
  if ("resp" in p) return p.resp;
  const { lista } = await getReparticaoContexto(a.u);
  const protocolos = (await listarProtocolosPorIds(p.data.ids)).filter(
    (pr) => pr.reparticaoId == null || lista.some((r) => r.id === pr.reparticaoId),
  );
  const ids = protocolos.map((pr) => pr.id);
  const [dfds, regras, orgaos] = await Promise.all([
    ids.length > 0 ? listarDfdsCompletosDosProtocolos(ids) : Promise.resolve([]),
    getRegrasAvaliacao(),
    listarOrgaos(),
  ]);
  const unidades = new Map((await unidadesConferencia(dfds.map((d) => d.reparticaoId))).map((u) => [u.id, u]));
  const porProtocolo = new Map<number, DfdDetalhe[]>();
  for (const d of dfds) {
    if (d.protocoloId == null) continue;
    const arr = porProtocolo.get(d.protocoloId);
    if (arr) arr.push(d);
    else porProtocolo.set(d.protocoloId, [d]);
  }
  const linhas = protocolos.map((pr) => {
    const categoria = classificarAssunto(pr.assunto);
    const doProtocolo = (porProtocolo.get(pr.id) ?? []).map((d) => ({
      numero: d.numero,
      planejamento: d.planejamento,
      mensagens: avaliarLinhaDfd(d, d.reparticaoId != null ? (unidades.get(d.reparticaoId) ?? null) : null, {
        anoPca: d.anoPca ?? pr.anoPca,
        regras,
        categoria,
        orgaos,
      }).mensagens,
    }));
    // A capa foi emitida com os DFDs que o processo TINHA — os sobrescritos depois por outro protocolo (o
    // rastro, com o valor da época) seguem na conciliação.
    const c = avaliarProtocolo(
      { valorCapa: pr.valorCapa, valorTotal: pr.valorTotal, totalDfds: pr.totalDfds, categoria, sobrescritos: pr.sobrescritos, valorSobrescritos: pr.valorSobrescritos },
      doProtocolo,
      regras,
    );
    return { id: pr.id, estado: c.estado, resumo: c.resumo ?? null, dfdsComErro: c.dfdsComErro, dfdsEmAtencao: c.dfdsEmAtencao };
  });
  return ok({ linhas });
}
