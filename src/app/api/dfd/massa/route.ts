import { exigirEditor } from "@/lib/api-auth";
import { registrarAuditoria, rotulosUnidades } from "@/lib/auditoria";
import { getRegrasAvaliacao } from "@/lib/avaliacao";
import { type ChaveAvaliacao, comportamentoNo, editavelDe } from "@/lib/avaliacao-core";
import { compararDfd, type DfdComparavel } from "@/lib/comparar-protocolo";
import { atualizarDfdCampos, listarCamposMassa } from "@/lib/dfd";
import { aplicarMassaDfd, type CampoMassa } from "@/lib/dfd-tratamento";
import { massaDfdsSchema } from "@/lib/dfd-validation";
import { getReparticaoContexto } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import { bloqueiaAssinatura, pdfExigeAssinatura, validarAssinatura } from "@/lib/reparticao-responsaveis";
import { categoriaDoProtocolo } from "@/lib/protocolo";
import { carregarResponsaveis } from "@/lib/reparticoes";

import { mensagemTravaPca } from "@/lib/pca-core";
import { travaDeDfds } from "@/lib/trava-pca";
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
  const travas = await travaDeDfds(dfds.map((d) => d.id));
  // Siglas das unidades (histórico) — UMA consulta para o lote inteiro (≤ 50 DFDs + o destino).
  const rotulo = acao.campo === "reparticao" ? await rotulosUnidades([acao.reparticaoId, ...dfds.map((d) => d.reparticaoId)]) : null;
  let alterados = 0;
  const falhas: { id: number; numero: string; motivo: string }[] = [];
  // Categoria do protocolo de cada DFD (exceções do ADM, a MESMA régua do banner) — só consultada quando a assinatura
  // não confere, com cache por protocolo (poucas consultas por lote).
  const categorias = new Map<number | null, string | null>();
  const categoriaDe = async (pid: number | null) => {
    if (!categorias.has(pid)) categorias.set(pid, await categoriaDoProtocolo(pid));
    return categorias.get(pid) ?? null;
  };
  for (const d of dfds) {
    try {
      if (!acessivel(d.reparticaoId)) {
        falhas.push({ id: d.id, numero: d.numero, motivo: "Sem acesso à unidade deste DFD." });
        continue;
      }
      const trava = travas.get(d.id);
      if (trava) {
        falhas.push({ id: d.id, numero: d.numero, motivo: mensagemTravaPca(trava.nome) });
        continue;
      }
      if (acao.campo === "reparticao") {
        if (d.reparticaoId === acao.reparticaoId || !respDestino || !rotulo) continue; // já está nessa unidade
        const res = validarAssinatura(d.assinaturas, respDestino, { exigeAssinatura: pdfExigeAssinatura(d.nomeArquivo) });
        if (
          res.status === "erro" &&
          bloqueiaAssinatura(res, comportamentoNo(regras, "dfd.assinatura", { dfdTipo: tipoCurtoDfd(d.tipo), categoria: await categoriaDe(d.protocoloId) }))
        ) {
          falhas.push({ id: d.id, numero: d.numero, motivo: res.motivo });
          continue;
        }
        await atualizarDfdCampos(d.id, { reparticaoId: acao.reparticaoId });
        await registrarAuditoria({
          usuario: a.u,
          acao: "editar",
          entidade: "dfd",
          entidadeId: d.id,
          resumo: `DFD ${d.numero}: unidade ${rotulo(d.reparticaoId)} → ${rotulo(acao.reparticaoId)} (edição em massa)`,
          protocoloId: d.protocoloId,
          origem: "massa",
          detalhe: {
            alvo: { numero: d.numero, planejamento: d.planejamento },
            campos: [{ campo: "reparticaoId", rotulo: "Unidade", antes: rotulo(d.reparticaoId), depois: rotulo(acao.reparticaoId) }],
          },
        });
        alterados++;
        continue;
      }
      const novo = aplicarMassaDfd({ tipo: d.tipo, secoes: d.secoes }, acao);
      if (novo.tipo === d.tipo && novo.secoes === d.secoes) continue; // nada muda
      await atualizarDfdCampos(d.id, acao.campo === "tipo" ? { tipo: novo.tipo } : { secoes: novo.secoes });
      // Detalhe = a MESMA comparação do reenvio sobre o que a massa mexe (tipo ou a seção).
      const c = compararDfd(comparavelMassa(d, d.tipo, d.secoes), comparavelMassa(d, novo.tipo, novo.secoes));
      await registrarAuditoria({
        usuario: a.u,
        acao: "editar",
        entidade: "dfd",
        entidadeId: d.id,
        resumo: `DFD ${d.numero}: ${ROTULO_CAMPO[acao.campo]} (edição em massa) — ${acao.valor}`.slice(0, 500),
        protocoloId: d.protocoloId,
        origem: "massa",
        detalhe: { alvo: { numero: d.numero, planejamento: d.planejamento }, campos: c.campos, secoes: c.secoes },
      });
      alterados++;
    } catch (e) {
      // Falha de UM DFD não derruba o lote: vai para `falhas` (os demais seguem).
      falhas.push({ id: d.id, numero: d.numero, motivo: e instanceof Error ? e.message : "falha ao gravar" });
    }
  }
  return ok({ alterados, falhas });
}

/** Forma comparável MÍNIMA do DFD da massa (só tipo e seções variam — o resto fica igual dos dois lados). */
function comparavelMassa(
  d: { numero: string; planejamento: string | null; reparticaoId: number | null },
  tipo: string | null,
  secoes: { titulo: string; texto: string }[],
): DfdComparavel {
  const nada = { objeto: null, orgaoEntidade: null, setorRequisitante: null, responsavel: null, matricula: null, email: null, telefone: null };
  return {
    ...nada,
    numero: d.numero,
    planejamento: d.planejamento,
    tipo,
    numeroContrato: null,
    numeroAta: null,
    numeroLicitacao: null,
    anoPca: null,
    reparticaoId: d.reparticaoId,
    valorTotal: null,
    secoes,
    assinaturas: [],
    itens: [],
  };
}
