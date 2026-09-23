import { exigirEditor, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getReparticaoContexto } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { acaoSugerida, coerceAcao, motivosNaoMover, ROTULO_ACAO } from "@/lib/pca-core";
import { definirAcaoDfds, desvincularDfds, dfdsDosProtocolos, dfdsEmOutroPca, getPcaEspaco, vincularDfds } from "@/lib/pca-espaco";
import { acaoDfdsPcaSchema, moverParaPcaSchema, retirarDoPcaSchema } from "@/lib/pca-espaco-validation";
import { listarProtocolosPorIds } from "@/lib/protocolo";
import { listarSituacoes } from "@/lib/situacoes";

export const dynamic = "force-dynamic";

async function alvo(ctx: { params: Promise<{ id: string }> }) {
  const id = intId((await ctx.params).id);
  if (!id) return { resp: erro("ID inválido.") } as const;
  const pca = await getPcaEspaco(id);
  if (!pca) return { resp: erro("PCA não encontrado.", 404) } as const;
  if (pca.fonte !== "protocolo") return { resp: erro("Este PCA é de lista pronta — não recebe protocolos.", 409) } as const;
  return { pca } as const;
}

/**
 * MOVER protocolos para o PCA = VINCULAR os DFDs deles (o que entra no PCA é o DFD). Travas por
 * protocolo (`motivosNaoMover`): situação que permite mover, `ano_pca` = ano do PCA, ter DFD e um DFD só
 * em UM PCA (os que já estão em outro são pulados). A ação de cada DFD vem de `acoes` ou é sugerida pelo
 * assunto do protocolo. A falha de um protocolo não derruba os demais (`falhas`).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const t = await alvo(ctx);
  if ("resp" in t) return t.resp;
  const { pca } = t;
  const p = await parseCorpo(moverParaPcaSchema, req);
  if ("resp" in p) return p.resp;

  const [{ lista }, protocolos, situacoes, dfds] = await Promise.all([
    getReparticaoContexto(a.u),
    listarProtocolosPorIds(p.data.protocoloIds),
    listarSituacoes(),
    dfdsDosProtocolos(p.data.protocoloIds),
  ]);
  const sit = new Map(situacoes.map((s) => [s.id, s]));
  const emOutro = await dfdsEmOutroPca(
    dfds.map((d) => d.id),
    pca.id,
  );
  const acessivel = (rid: number | null) => rid == null || lista.some((r) => r.id === rid);

  let vinculados = 0;
  const falhas: { id: number; numero: string; motivo: string }[] = [];
  for (const pr of protocolos) {
    if (!acessivel(pr.reparticaoId)) {
      falhas.push({ id: pr.id, numero: pr.numero, motivo: "Sem acesso à unidade deste protocolo." });
      continue;
    }
    const doProto = dfds.filter((d) => d.protocoloId === pr.id);
    const s = pr.situacaoId != null ? sit.get(pr.situacaoId) : undefined;
    const motivos = motivosNaoMover({
      situacaoPermite: s ? s.permiteMoverPca : null,
      situacaoNome: s?.nome,
      anoProtocolo: pr.anoPca,
      anoPca: pca.ano,
      totalDfds: doProto.length,
      dfdsEmOutroPca: doProto.filter((d) => emOutro.has(d.id)).length,
      fonteProtocolo: true,
    });
    if (motivos.length) {
      falhas.push({ id: pr.id, numero: pr.numero, motivo: motivos.join("; ") });
      continue;
    }
    const sugerida = acaoSugerida(pr.assunto);
    const entradas = doProto
      .filter((d) => !emOutro.has(d.id))
      .map((d) => ({ dfdId: d.id, acao: p.data.acoes?.[String(d.id)] ? coerceAcao(p.data.acoes[String(d.id)]) : sugerida }));
    try {
      await vincularDfds(pca.id, entradas, a.u.id);
      vinculados += entradas.length;
      const pulados = doProto.length - entradas.length;
      await registrarAuditoria({
        usuario: a.u,
        acao: "editar",
        entidade: "pca",
        entidadeId: pca.id,
        resumo: `Protocolo ${pr.numero} movido para o PCA "${pca.nome}" — ${entradas.length} DFD(s) (${ROTULO_ACAO[sugerida]})${pulados ? `; ${pulados} já em outro PCA` : ""}`,
        protocoloId: pr.id,
        depois: { dfds: entradas },
      });
    } catch (e) {
      falhas.push({ id: pr.id, numero: pr.numero, motivo: e instanceof Error ? e.message : "falha ao gravar" });
    }
  }
  return ok({ vinculados, falhas });
}

/** RETIRAR do PCA: DFDs avulsos e/ou todos os DFDs dos protocolos dados. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const t = await alvo(ctx);
  if ("resp" in t) return t.resp;
  const p = await parseCorpo(retirarDoPcaSchema, req);
  if ("resp" in p) return p.resp;
  const ids = new Set(p.data.dfdIds ?? []);
  if (p.data.protocoloIds?.length) for (const d of await dfdsDosProtocolos(p.data.protocoloIds)) ids.add(d.id);
  await desvincularDfds(t.pca.id, [...ids]);
  await registrarAuditoria({
    usuario: a.u,
    acao: "editar",
    entidade: "pca",
    entidadeId: t.pca.id,
    resumo: `${ids.size} DFD(s) retirado(s) do PCA "${t.pca.nome}"${p.data.protocoloIds?.length ? ` (${p.data.protocoloIds.length} protocolo(s))` : ""}`,
    antes: { dfdIds: [...ids] },
  });
  return ok({ retirados: ids.size });
}

/** Troca a AÇÃO (incorporar/substituir/excluir) de DFDs já no PCA. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const t = await alvo(ctx);
  if ("resp" in t) return t.resp;
  const p = await parseCorpo(acaoDfdsPcaSchema, req);
  if ("resp" in p) return p.resp;
  await definirAcaoDfds(t.pca.id, p.data.dfdIds, p.data.acao);
  await registrarAuditoria({
    usuario: a.u,
    acao: "editar",
    entidade: "pca",
    entidadeId: t.pca.id,
    resumo: `${p.data.dfdIds.length} DFD(s) do PCA "${t.pca.nome}" → ${ROTULO_ACAO[p.data.acao]}`,
    depois: p.data,
  });
  return ok();
}
