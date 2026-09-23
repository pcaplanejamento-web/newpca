import { exigirEditor, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getReparticaoContexto } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { acessivelNaLista } from "@/lib/mesa-dados";
import { acaoSugerida, motivoNaoDevolver, motivosNaoEnviar, motivosNaoIncorporar, ROTULO_ACAO } from "@/lib/pca-core";
import {
  devolverProtocolo,
  dfdsDosProtocolos,
  dfdsEmOutroPca,
  enviarProtocolo,
  getPcaEspaco,
  incorporarProtocolo,
} from "@/lib/pca-espaco";
import { acaoProtocolosPcaSchema } from "@/lib/pca-espaco-validation";
import { listarProtocolosPorIds } from "@/lib/protocolo";

export const dynamic = "force-dynamic";

const ROTULO: Record<"enviar" | "devolver" | "incorporar", string> = {
  enviar: "enviado ao",
  devolver: "devolvido à Mesa principal pelo",
  incorporar: "incorporado ao",
};

/**
 * Ações da MESA DO PCA sobre protocolos (≤ 50 por requisição), cada uma com as suas travas (`pca-core`):
 * ENVIAR (Mesa principal → Mesa do PCA: ano do PCA, ter DFD, não estar em outro PCA — a situação NÃO
 * interfere), DEVOLVER (só o não incorporado) e INCORPORAR (PERMANENTE: os DFDs entram no PCA com a ação por
 * protocolo e cada item ganha o sequencial único do PCA; um DFD já em OUTRO PCA fica de fora; a partir daqui
 * protocolo/DFDs/itens TRAVAM). Escopo por unidade em TODAS; a falha de um protocolo não derruba os demais (`falhas`); auditoria por protocolo com a ação REAL.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const pcaId = intId((await ctx.params).id);
  if (!pcaId) return erro("ID inválido.");
  const pca = await getPcaEspaco(pcaId);
  if (!pca) return erro("PCA não encontrado.", 404);
  if (pca.fonte !== "protocolo") return erro("Este PCA é de lista pronta — não recebe protocolos.", 409);
  const p = await parseCorpo(acaoProtocolosPcaSchema, req);
  if ("resp" in p) return p.resp;
  const corpo = p.data;

  const [{ lista }, protocolos, dfds] = await Promise.all([
    getReparticaoContexto(a.u),
    listarProtocolosPorIds(corpo.ids),
    corpo.acao === "incorporar" ? dfdsDosProtocolos(corpo.ids) : Promise.resolve([]),
  ]);
  const acessivel = acessivelNaLista(lista);
  const emOutro = corpo.acao === "incorporar" ? await dfdsEmOutroPca(dfds.map((d) => d.id), pca.id) : new Map<number, number>();

  let alterados = 0;
  const falhas: { id: number; numero: string; motivo: string }[] = [];
  for (const pr of protocolos) {
    const falha = (motivo: string) => falhas.push({ id: pr.id, numero: pr.numero, motivo });
    if (!acessivel(pr.reparticaoId)) {
      falha("Sem acesso à unidade deste protocolo.");
      continue;
    }
    try {
      let resumo = "";
      let depois: unknown = null;
      if (corpo.acao === "enviar") {
        const m = motivosNaoEnviar({
          anoProtocolo: pr.anoPca,
          anoPca: pca.ano,
          totalDfds: pr.totalDfds,
          fonteProtocolo: true,
          jaEmPca: pr.pcaId != null ? (pr.pcaNome ?? "outro PCA") : null,
        });
        if (m.length) {
          falha(m.join("; "));
          continue;
        }
        await enviarProtocolo(pca.id, pr.id, a.u.id);
      } else if (corpo.acao === "devolver") {
        const m = motivoNaoDevolver(pr, pca.id);
        if (m) {
          falha(m);
          continue;
        }
        await devolverProtocolo(pca.id, pr.id);
      } else {
        const doProto = dfds.filter((d) => d.protocoloId === pr.id);
        const m = motivosNaoIncorporar({
          enviadoAEste: pr.pcaId === pca.id,
          incorporado: pr.pcaIncorporadoEm != null,
          totalDfds: doProto.length,
          dfdsEmOutroPca: doProto.filter((d) => emOutro.has(d.id)).length,
        });
        if (m.length) {
          falha(m.join("; "));
          continue;
        }
        const acao = corpo.acoes?.[String(pr.id)] ?? acaoSugerida(pr.assunto);
        const entradas = doProto.filter((d) => !emOutro.has(d.id)).map((d) => ({ dfdId: d.id, acao }));
        await incorporarProtocolo(pca.id, pr.id, entradas, a.u.id);
        const fora = doProto.length - entradas.length;
        resumo = ` — ${entradas.length} DFD(s) como "${ROTULO_ACAO[acao]}"${fora ? `; ${fora} já em outro PCA (fora)` : ""}`;
        depois = { acao, dfds: entradas.map((e) => e.dfdId) };
      }
      alterados++;
      await registrarAuditoria({
        usuario: a.u,
        acao: "editar",
        entidade: "pca",
        entidadeId: pca.id,
        resumo: `Protocolo ${pr.numero} ${ROTULO[corpo.acao]} ${pca.nome}${resumo}`.slice(0, 500),
        protocoloId: pr.id,
        depois,
      });
    } catch (e) {
      falha(e instanceof Error ? e.message : "falha ao gravar");
    }
  }
  return ok({ alterados, falhas });
}
