import { escopoMesa, protocoloLegivel } from "@/lib/acesso-mesa";
import { exigirAcesso } from "@/lib/api-auth";
import { getRegrasAvaliacao } from "@/lib/avaliacao";
import { classificarAssunto } from "@/lib/avaliacao-core";
import { gravarGuardadas, guardadoValido, lerGuardadas } from "@/lib/conferencia-cache";
import { assinaturaDfd, assinaturaProtocolo, type ConfProto, chavesUnidades, chaveContexto } from "@/lib/conferencia-cache-core";
import { avaliarLinhaDfd, avaliarProtocolo, gravacaoIncompleta } from "@/lib/conferencia-dfd";
import { type DfdDetalhe, listarDfdsCompletosDosProtocolos } from "@/lib/dfd";
import { conferenciaProtocolosSchema } from "@/lib/dfd-validation";
import { erro, ok, parseCorpo } from "@/lib/http";
import { listarOrgaos } from "@/lib/orgaos";
import { listarProtocolosPorIds } from "@/lib/protocolo";
import { unidadesConferencia } from "@/lib/reparticoes";
import { contarTentativa, respostaLimite } from "@/lib/seguranca-acesso";

export const dynamic = "force-dynamic";

/**
 * ESTADO AGREGADO da lista de PROTOCOLOS da Mesa: cada protocolo ACUMULA os problemas de dentro — a
 * conciliação da capa + TODOS os problemas dos seus DFDs e itens (a MESMA conferência por linha da
 * análise, `avaliarLinhaDfd`, sobre os DFDs COMPLETOS e as unidades REAIS). O cliente pede em fatias
 * (lazy); a célula mostra "Conferindo…" até chegar. Leitura escopada por UNIDADE (como `GET
 * /api/protocolo/[id]`): protocolo de unidade sem acesso é ignorado. O resultado fica GUARDADO com a assinatura de entrada
 * (`conferencias`) — sem mudança, não recalcula; `fresco` recalcula (o "Reverificar tudo", com limite de ritmo).
 */
export async function POST(req: Request) {
  const a = await exigirAcesso(["dfd", "pca"], "visualizar");
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(conferenciaProtocolosSchema, req);
  if ("resp" in p) return p.resp;
  const esc = await escopoMesa();
  if (!esc) return erro("Faça login.", 401);
  if (p.data.fresco) {
    const esperar = await contarTentativa("conferenciaFresca", String(a.u.id));
    if (esperar > 0) return respostaLimite(esperar);
  }
  // Só os protocolos LEGÍVEIS (a unidade no escopo e as linhas da pessoa — "só os meus").
  const protocolos = (await listarProtocolosPorIds(p.data.ids)).filter((pr) => protocoloLegivel(esc, pr));
  const ids = protocolos.map((pr) => pr.id);
  const [dfds, regras, orgaos] = await Promise.all([
    ids.length > 0 ? listarDfdsCompletosDosProtocolos(ids) : Promise.resolve([]),
    getRegrasAvaliacao(),
    listarOrgaos(),
  ]);
  const [lista, ctx, guardadas] = await Promise.all([
    unidadesConferencia(dfds.map((d) => d.reparticaoId)),
    chaveContexto(regras, orgaos),
    p.data.fresco ? Promise.resolve(new Map()) : lerGuardadas("protocolo", ids),
  ]);
  const unidades = new Map(lista.map((u) => [u.id, u]));
  const hashes = await chavesUnidades(lista);
  const porProtocolo = new Map<number, DfdDetalhe[]>();
  for (const d of dfds) {
    if (d.protocoloId == null) continue;
    const arr = porProtocolo.get(d.protocoloId);
    if (arr) arr.push(d);
    else porProtocolo.set(d.protocoloId, [d]);
  }
  const gravar: { alvoId: number; assinatura: string; resultado: string }[] = [];
  const linhas = await Promise.all(
    protocolos.map(async (pr): Promise<ConfProto> => {
    const dfdsDele = porProtocolo.get(pr.id) ?? [];
    const assinatura = await assinaturaProtocolo(
      pr,
      ctx,
      dfdsDele.map((d) => assinaturaDfd(d, ctx, hashes)),
    );
    const guardado = guardadoValido<ConfProto>(guardadas.get(pr.id), assinatura);
    if (guardado) return { ...guardado, id: pr.id };
    const categoria = classificarAssunto(pr.assunto);
    const doProtocolo = dfdsDele.map((d) => ({
      numero: d.numero,
      planejamento: d.planejamento,
      mensagens: avaliarLinhaDfd({ ...d, gravacaoIncompleta: gravacaoIncompleta(d) }, d.reparticaoId != null ? (unidades.get(d.reparticaoId) ?? null) : null, {
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
    const linha: ConfProto = { id: pr.id, estado: c.estado, resumo: c.resumo ?? null, dfdsComErro: c.dfdsComErro, dfdsEmAtencao: c.dfdsEmAtencao };
    gravar.push({ alvoId: pr.id, assinatura, resultado: JSON.stringify(linha) });
    return linha;
    }),
  );
  await gravarGuardadas("protocolo", gravar);
  return ok({ linhas });
}
