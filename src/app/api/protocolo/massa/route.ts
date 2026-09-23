import { exigirEditor } from "@/lib/api-auth";
import { detalheSeguro, registrarAuditoria } from "@/lib/auditoria";
import { getRegrasAvaliacao } from "@/lib/avaliacao";
import { editavelDe } from "@/lib/avaliacao-core";
import { massaProtocolosSchema } from "@/lib/dfd-validation";
import { getReparticaoContexto } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { valoresBatem } from "@/lib/normalize";
import { atualizarProtocolo, type CamposProtocolo, detalheEdicaoProtocolo, listarProtocolosPorIds } from "@/lib/protocolo";
import { getSituacao } from "@/lib/situacoes";
import { pessoaAtiva } from "@/lib/usuarios";

export const dynamic = "force-dynamic";

/**
 * EDIÇÃO EM MASSA de PROTOCOLOS gravados (lista da Mesa): UNIDADE, ASSUNTO, VALOR DA CAPA = somatória dos
 * DFDs (conciliação em lote), RESPONSÁVEL ou SITUAÇÃO. Por protocolo: escopo por unidade (origem e
 * destino) e auditoria com o detalhe (antes → depois). A falha de um protocolo não derruba o lote — volta
 * em `falhas` com o motivo; o que já confere é pulado.
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
  if (acao.campo === "responsavel" && acao.responsavelId != null && !(await pessoaAtiva(acao.responsavelId)))
    return erro("Escolha um usuário ativo como responsável.", 422);
  if (acao.campo === "situacao" && acao.situacaoId != null && !(await getSituacao(acao.situacaoId)))
    return erro("Situação não encontrada (Configurações → Situações).", 422);

  let alterados = 0;
  const falhas: { id: number; numero: string; motivo: string }[] = [];
  for (const pr of await listarProtocolosPorIds(ids)) {
    try {
      if (!acessivel(pr.reparticaoId)) {
        falhas.push({ id: pr.id, numero: pr.numero, motivo: "Sem acesso à unidade deste protocolo." });
        continue;
      }
      // O que muda neste protocolo (nada ⇒ pulado).
      let campos: CamposProtocolo | null = null;
      if (acao.campo === "reparticao") campos = pr.reparticaoId === acao.reparticaoId ? null : { reparticaoId: acao.reparticaoId };
      else if (acao.campo === "assunto") campos = (pr.assunto ?? "") === acao.valor ? null : { assunto: acao.valor };
      else if (acao.campo === "responsavel") campos = pr.responsavelId === acao.responsavelId ? null : { responsavelId: acao.responsavelId };
      else if (acao.campo === "situacao") campos = pr.situacaoId === acao.situacaoId ? null : { situacaoId: acao.situacaoId };
      else {
        // Valor da capa = somatória dos DFDs (mesma régua da conciliação do banner).
        if (pr.totalDfds === 0) {
          falhas.push({ id: pr.id, numero: pr.numero, motivo: "Protocolo sem DFDs — não há somatória." });
          continue;
        }
        const soma = Math.round(pr.valorTotal * 100) / 100;
        campos = valoresBatem(pr.valorCapa, soma) ? null : { valorCapa: soma };
      }
      if (!campos) continue;
      await atualizarProtocolo(pr.id, campos);
      const detalhe = await detalheSeguro(() => detalheEdicaoProtocolo(pr, campos), {});
      await registrarAuditoria({
        usuario: a.u,
        acao: "editar",
        entidade: "protocolo",
        entidadeId: pr.id,
        resumo: `Protocolo ${pr.numero}: ${detalhe.campos?.map((c) => c.rotulo).join(", ") || acao.campo} (edição em massa)`,
        protocoloId: pr.id,
        origem: "massa",
        detalhe,
      });
      alterados++;
    } catch (e) {
      falhas.push({ id: pr.id, numero: pr.numero, motivo: e instanceof Error ? e.message : "falha ao gravar" });
    }
  }
  return ok({ alterados, falhas });
}
