import { motivoRecusa } from "@/lib/acesso";
import { escopoMesa, MSG_SEM_ACESSO_PROTOCOLO, protocoloLegivel } from "@/lib/acesso-mesa";
import { exigirAcesso } from "@/lib/api-auth";
import { detalheSeguro, registrarAuditoria } from "@/lib/auditoria";
import { avisarProtocoloAtualizado, avisarResponsavelProtocolo } from "@/lib/avisos-mesa";
import { getRegrasAvaliacao } from "@/lib/avaliacao";
import { editavelDe } from "@/lib/avaliacao-core";
import { somatorioProcesso } from "@/lib/conferencia-dfd";
import { massaProtocolosSchema } from "@/lib/dfd-validation";
import { getGrupoAtivoId } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { MSG_RESPONSAVEL_NAO, motivoResponsavel, responsavelVedado } from "@/lib/mesa-visao-core";
import { valoresBatem } from "@/lib/normalize";
import { atualizarProtocolo, type CamposProtocolo, detalheEdicaoProtocolo, listarProtocolosPorIds } from "@/lib/protocolo";
import { getSituacao } from "@/lib/situacoes";
import { telaDoRecurso } from "@/lib/papeis-core";
import { pessoaDoGrupo } from "@/lib/usuarios";

export const dynamic = "force-dynamic";

/**
 * EDIÇÃO EM MASSA de PROTOCOLOS gravados (lista da Mesa): UNIDADE, ASSUNTO, VALOR DA CAPA = somatória dos
 * DFDs (conciliação em lote), RESPONSÁVEL ou SITUAÇÃO. Por protocolo: escopo por unidade (origem e
 * destino) e auditoria com o detalhe (antes → depois). A falha de um protocolo não derruba o lote — volta
 * em `falhas` com o motivo; o que já confere é pulado.
 */
export async function POST(req: Request) {
  const a = await exigirAcesso(["dfd", "pca"], "manipular");
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(massaProtocolosSchema, req);
  if ("resp" in p) return p.resp;
  const { ids, acao } = p.data;

  const esc = await escopoMesa();
  if (!esc) return erro("Faça login.", 401);
  const { acessivel } = esc;
  // Quem não vê (ou não altera) o Responsável: o pedido inteiro é recusado ANTES de olhar os protocolos — a resposta
  // por alvo diria quais têm (ou não) a pessoa pedida (um oráculo da coluna oculta).
  if (acao.campo === "responsavel" && responsavelVedado(esc.vis)) return erro(MSG_RESPONSAVEL_NAO, 403);
  if (acao.campo === "reparticao") {
    if (!editavelDe(await getRegrasAvaliacao(), "protocolo.reparticao")) return erro("Campo travado nas Configurações → Avaliação.", 403);
    if (!acessivel(acao.reparticaoId)) return erro("Sem acesso à unidade de destino.", 403);
  }
  const grupoAtivo = await getGrupoAtivoId(a.u);
  if (acao.campo === "responsavel" && acao.responsavelId != null && ((grupoAtivo == null && !a.u.admin) || !(await pessoaDoGrupo(acao.responsavelId, grupoAtivo))))
    return erro("Escolha como responsável uma pessoa ativa do seu grupo.", 422);
  const situacao = acao.campo === "situacao" && acao.situacaoId != null ? await getSituacao(acao.situacaoId) : null;
  if (acao.campo === "situacao" && acao.situacaoId != null && !situacao)
    return erro("Situação não encontrada (Configurações → Situações).", 422);

  let alterados = 0;
  const falhas: { id: number; numero: string; motivo: string }[] = [];
  const designados: Parameters<typeof avisarResponsavelProtocolo>[1] = [];
  const atualizados: Parameters<typeof avisarProtocoloAtualizado>[1] = [];
  for (const pr of await listarProtocolosPorIds(ids)) {
    try {
      // Fora da unidade ou das LINHAS da pessoa ("só os meus"): a MESMA falha genérica, sem o número (não revela o
      // protocolo — a tela usa o número da própria linha).
      if (!acessivel(pr.reparticaoId) || !protocoloLegivel(esc, pr)) {
        falhas.push({ id: pr.id, numero: "", motivo: MSG_SEM_ACESSO_PROTOCOLO });
        continue;
      }
      // O PAPEL manipula na Mesa em que o protocolo está (a do sistema ou a do PCA).
      const semPapel = motivoRecusa(a.acesso, telaDoRecurso(pr.pcaId), "manipular");
      if (semPapel) {
        falhas.push({ id: pr.id, numero: pr.numero, motivo: semPapel });
        continue;
      }
      // O que muda neste protocolo (nada ⇒ pulado).
      let campos: CamposProtocolo | null = null;
      if (acao.campo === "reparticao") campos = pr.reparticaoId === acao.reparticaoId ? null : { reparticaoId: acao.reparticaoId };
      else if (acao.campo === "assunto") campos = (pr.assunto ?? "") === acao.valor ? null : { assunto: acao.valor };
      else if (acao.campo === "responsavel") {
        // O nível do papel (não altera · só assume para si · qualquer pessoa do grupo), protocolo a protocolo.
        const motivo = motivoResponsavel(esc.vis, a.u.id, pr.responsavelId, acao.responsavelId);
        if (motivo) {
          falhas.push({ id: pr.id, numero: pr.numero, motivo });
          continue;
        }
        campos = pr.responsavelId === acao.responsavelId ? null : { responsavelId: acao.responsavelId };
      }
      else if (acao.campo === "situacao") campos = pr.situacaoId === acao.situacaoId ? null : { situacaoId: acao.situacaoId };
      else {
        // Valor da capa = somatória do processo (os DFDs + o rastro dos sobrescritos — a MESMA régua da
        // conciliação do banner e do estado agregado).
        const proc = somatorioProcesso(pr);
        if (proc.dfds === 0) {
          falhas.push({ id: pr.id, numero: pr.numero, motivo: "Protocolo sem DFDs — não há somatória." });
          continue;
        }
        campos = valoresBatem(pr.valorCapa, proc.somatorio) ? null : { valorCapa: proc.somatorio };
      }
      if (!campos) continue;
      // Responsável = trava OTIMISTA (só grava se ainda é o lido — ninguém sobrescreve quem acabou de assumir).
      if (!(await atualizarProtocolo(pr.id, campos, acao.campo === "responsavel" ? pr.responsavelId : undefined))) {
        falhas.push({ id: pr.id, numero: pr.numero, motivo: "O Responsável mudou enquanto isso — atualize a Mesa" });
        continue;
      }
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
      if (acao.campo === "responsavel" && acao.responsavelId != null) designados.push({ responsavelId: acao.responsavelId, protocolo: pr });
      if (acao.campo === "situacao") atualizados.push({ responsavelId: pr.responsavelId, protocolo: pr, oQue: `situação "${situacao?.nome ?? "sem situação"}"` });
    } catch (e) {
      falhas.push({ id: pr.id, numero: pr.numero, motivo: e instanceof Error ? e.message : "falha ao gravar" });
    }
  }
  // O novo responsável recebe UM aviso com os protocolos que passaram a ser dele.
  await avisarResponsavelProtocolo(a.u, designados);
  await avisarProtocoloAtualizado(a.u, atualizados);
  return ok({ alterados, falhas });
}
