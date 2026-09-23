import { exigirEditor } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getRegrasAvaliacao } from "@/lib/avaliacao";
import { type ChaveAvaliacao, comportamentoNo, editavelDe } from "@/lib/avaliacao-core";
import { atualizarDfdCampos, listarCamposMassa } from "@/lib/dfd";
import { aplicarMassaDfd, type CampoMassa } from "@/lib/dfd-tratamento";
import { massaDfdsSchema } from "@/lib/dfd-validation";
import { getReparticaoContexto } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import { bloqueiaAssinatura, pdfExigeAssinatura, validarAssinatura } from "@/lib/reparticao-responsaveis";
import { carregarResponsaveis } from "@/lib/reparticoes";

export const dynamic = "force-dynamic";

const CHAVE_CAMPO: Record<CampoMassa, ChaveAvaliacao> = {
  reparticao: "dfd.reparticao",
  tipo: "dfd.tipo",
  prioridade: "dfd.prioridade",
  previsao: "dfd.previsao",
  fundamentacao: "dfd.fundamentacao",
};
const ROTULO_CAMPO: Record<CampoMassa, string> = {
  reparticao: "unidade",
  tipo: "tipo",
  prioridade: "prioridade",
  previsao: "previsão de entrega",
  fundamentacao: "fundamentação legal",
};

/**
 * EDIÇÃO EM MASSA de DFDs GRAVADOS (lista da Mesa) — a MESMA ação da barra de massa da análise
 * (`aplicarMassaDfd`; a unidade troca como no PATCH). Por DFD: escopo por unidade (origem e destino),
 * campo travado pelo ADM recusado, e ao trocar a UNIDADE a assinatura é reconferida contra os
 * responsáveis do destino (o nível `dfd.assinatura` decide). Cada alteração vai para a auditoria.
 * Devolve quantos mudaram + as falhas (com o motivo) — os demais seguem.
 */
export async function POST(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(massaDfdsSchema, req);
  if ("resp" in p) return p.resp;
  const { ids, acao } = p.data;

  const regras = await getRegrasAvaliacao();
  if (!editavelDe(regras, CHAVE_CAMPO[acao.campo])) return erro("Campo travado nas Configurações → Avaliação.", 403);
  const { lista } = await getReparticaoContexto(a.u);
  const acessivel = (rid: number | null) => rid == null || lista.some((r) => r.id === rid);
  if (acao.campo === "reparticao" && !acessivel(acao.reparticaoId)) return erro("Sem acesso à unidade de destino.", 403);
  const respDestino = acao.campo === "reparticao" ? await carregarResponsaveis(acao.reparticaoId) : null;

  const dfds = await listarCamposMassa(ids);
  let alterados = 0;
  const falhas: { id: number; numero: string; motivo: string }[] = [];
  for (const d of dfds) {
    try {
      if (!acessivel(d.reparticaoId)) {
        falhas.push({ id: d.id, numero: d.numero, motivo: "Sem acesso à unidade deste DFD." });
        continue;
      }
      if (acao.campo === "reparticao") {
        if (d.reparticaoId === acao.reparticaoId || !respDestino) continue; // já está nessa unidade
        const res = validarAssinatura(d.assinaturas, respDestino, { exigeAssinatura: pdfExigeAssinatura(d.nomeArquivo) });
        if (res.status === "erro" && bloqueiaAssinatura(res, comportamentoNo(regras, "dfd.assinatura", { dfdTipo: tipoCurtoDfd(d.tipo) }))) {
          falhas.push({ id: d.id, numero: d.numero, motivo: res.motivo });
          continue;
        }
        await atualizarDfdCampos(d.id, { reparticaoId: acao.reparticaoId });
        await registrarAuditoria({
          usuario: a.u,
          acao: "editar",
          entidade: "dfd",
          entidadeId: d.id,
          resumo: `DFD ${d.numero}: unidade alterada em massa (#${d.reparticaoId ?? "—"} → #${acao.reparticaoId})`,
          antes: { reparticaoId: d.reparticaoId },
          depois: { reparticaoId: acao.reparticaoId },
        });
        alterados++;
        continue;
      }
      const novo = aplicarMassaDfd({ tipo: d.tipo, secoes: d.secoes }, acao);
      if (novo.tipo === d.tipo && novo.secoes === d.secoes) continue; // nada muda
      await atualizarDfdCampos(d.id, acao.campo === "tipo" ? { tipo: novo.tipo } : { secoes: novo.secoes });
      await registrarAuditoria({
        usuario: a.u,
        acao: "editar",
        entidade: "dfd",
        entidadeId: d.id,
        resumo: `DFD ${d.numero}: ${ROTULO_CAMPO[acao.campo]} (edição em massa) — ${acao.valor}`.slice(0, 500),
        ...(acao.campo === "tipo" ? { antes: { tipo: d.tipo }, depois: { tipo: novo.tipo } } : {}),
      });
      alterados++;
    } catch (e) {
      // Falha de UM DFD não derruba o lote: vai para `falhas` (os demais seguem).
      falhas.push({ id: d.id, numero: d.numero, motivo: e instanceof Error ? e.message : "falha ao gravar" });
    }
  }
  return ok({ alterados, falhas });
}
