import { exigirEditor } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getRegrasAvaliacao } from "@/lib/avaliacao";
import { editavelDe } from "@/lib/avaliacao-core";
import { massaProtocolosSchema } from "@/lib/dfd-validation";
import { brl } from "@/lib/format";
import { getReparticaoContexto } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { valoresBatem } from "@/lib/normalize";
import { atualizarProtocolo, listarProtocolosPorIds } from "@/lib/protocolo";

export const dynamic = "force-dynamic";

/**
 * EDIÇÃO EM MASSA de PROTOCOLOS gravados (lista da Mesa): UNIDADE, ASSUNTO ou VALOR DA CAPA = somatória
 * dos DFDs (conciliação em lote). Por protocolo: escopo por unidade (origem e destino) e auditoria. A
 * falha de um protocolo não derruba o lote — volta em `falhas` com o motivo; o que já confere é pulado.
 */
export async function POST(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(massaProtocolosSchema, req);
  if ("resp" in p) return p.resp;
  const { ids, acao } = p.data;

  const { lista } = await getReparticaoContexto(a.u);
  const acessivel = (rid: number | null) => rid == null || lista.some((r) => r.id === rid);
  if (acao.campo === "reparticao") {
    if (!editavelDe(await getRegrasAvaliacao(), "protocolo.reparticao")) return erro("Campo travado nas Configurações → Avaliação.", 403);
    if (!acessivel(acao.reparticaoId)) return erro("Sem acesso à unidade de destino.", 403);
  }

  let alterados = 0;
  const falhas: { id: number; numero: string; motivo: string }[] = [];
  for (const pr of await listarProtocolosPorIds(ids)) {
    try {
      if (!acessivel(pr.reparticaoId)) {
        falhas.push({ id: pr.id, numero: pr.numero, motivo: "Sem acesso à unidade deste protocolo." });
        continue;
      }
      if (acao.campo === "reparticao") {
        if (pr.reparticaoId === acao.reparticaoId) continue;
        await atualizarProtocolo(pr.id, { reparticaoId: acao.reparticaoId });
        await registrarAuditoria({
          usuario: a.u,
          acao: "editar",
          entidade: "protocolo",
          entidadeId: pr.id,
          resumo: `Protocolo ${pr.numero}: unidade alterada em massa (#${pr.reparticaoId ?? "—"} → #${acao.reparticaoId})`,
          antes: { reparticaoId: pr.reparticaoId },
          depois: { reparticaoId: acao.reparticaoId },
        });
      } else if (acao.campo === "assunto") {
        if ((pr.assunto ?? "") === acao.valor) continue;
        await atualizarProtocolo(pr.id, { assunto: acao.valor });
        await registrarAuditoria({
          usuario: a.u,
          acao: "editar",
          entidade: "protocolo",
          entidadeId: pr.id,
          resumo: `Protocolo ${pr.numero}: assunto alterado em massa`.slice(0, 500),
          antes: { assunto: pr.assunto },
          depois: { assunto: acao.valor },
        });
      } else {
        // Valor da capa = somatória dos DFDs (mesma régua da conciliação do banner).
        if (pr.totalDfds === 0) {
          falhas.push({ id: pr.id, numero: pr.numero, motivo: "Protocolo sem DFDs — não há somatória." });
          continue;
        }
        const soma = Math.round(pr.valorTotal * 100) / 100;
        if (valoresBatem(pr.valorCapa, soma)) continue;
        await atualizarProtocolo(pr.id, { valorCapa: soma });
        await registrarAuditoria({
          usuario: a.u,
          acao: "editar",
          entidade: "protocolo",
          entidadeId: pr.id,
          resumo: `Protocolo ${pr.numero}: valor da capa substituído pela somatória (${brl(soma)}) em massa`,
          antes: { valorCapa: pr.valorCapa },
          depois: { valorCapa: soma },
        });
      }
      alterados++;
    } catch (e) {
      falhas.push({ id: pr.id, numero: pr.numero, motivo: e instanceof Error ? e.message : "falha ao gravar" });
    }
  }
  return ok({ alterados, falhas });
}
