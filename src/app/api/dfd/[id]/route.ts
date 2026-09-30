import { dfdLegivelNaMesa, escopoMesa, MSG_SEM_ACESSO_DFD, protocoloLegivel } from "@/lib/acesso-mesa";
import { exigirAcesso, exigirSessao, intId, recusa } from "@/lib/api-auth";
import { detalheSeguro, registrarAuditoria, rotulosUnidades } from "@/lib/auditoria";
import { getRegrasAvaliacao } from "@/lib/avaliacao";
import { comportamentoNo } from "@/lib/avaliacao-core";
import { compararDfd, type DfdComparavel } from "@/lib/comparar-protocolo";
import { atualizarDfdCampos, type DfdDetalhe, excluirDfd, getDfd, getDfdAssinaturas, getDfdReparticao, reescreverDfdItens } from "@/lib/dfd";
import { semValorUnitario } from "@/lib/dfd-tratamento";
import { editarDfdSchema, type EditarDfdPayload } from "@/lib/dfd-validation";
import { erro, ok, parseCorpo } from "@/lib/http";
import { redigirDfdDetalhe } from "@/lib/mesa-redacao";
import { type Assinatura, juntarRefs, tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import { telaDoRecurso } from "@/lib/papeis-core";
import { gravacaoParcial, motivoNaoExcluirDfd } from "@/lib/pca-core";
import { categoriaDoProtocolo, getProtocoloReparticao, vincularDfd } from "@/lib/protocolo";
import { bloqueiaAssinatura, carimbarValidacao, pdfExigeAssinatura, validarAssinatura } from "@/lib/reparticao-responsaveis";
import { carregarResponsaveis, unidadesConferencia } from "@/lib/reparticoes";
import { pcaDeProtocolos, respostaTravado, travaDeProtocolos } from "@/lib/trava-pca";

export const dynamic = "force-dynamic";

/** DFD completo (para o banner) + a sua UNIDADE com os responsáveis (a conferência usa a unidade real do DFD). Só para
 * quem o LÊ: a unidade do DFD ou a do protocolo dele no escopo (antes qualquer um lia, pelo id, a matrícula, o e-mail, o
 * telefone e as assinaturas de qualquer DFD). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso(["dfd", "pca"], "visualizar");
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const dfd = await getDfd(id);
  if (!dfd) return erro("DFD não encontrado.", 404);
  // A unidade (a do DFD ou a do protocolo dele) E as LINHAS da pessoa ("só os meus").
  const esc = await escopoMesa();
  if (!esc || !(await dfdLegivelNaMesa(esc, dfd))) return erro(MSG_SEM_ACESSO_DFD, 403);
  const [unidade] = await unidadesConferencia([dfd.reparticaoId]);
  return ok({ dfd: redigirDfdDetalhe(dfd, esc.vis), unidade: unidade ?? null });
}

/** Exclui o DFD — EXCLUIR na Mesa em que ele está. `?origem=reenvio` = excluído pelo reenvio do protocolo (não veio no
 * PDF) — Importar + Excluir; `?origem=desfazer` = o rollback da importação que falhou no meio (`apagarDfd`,
 * `importar-dfd`) — só Importar, e só a gravação nova e parcial da própria pessoa. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirSessao();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const dfd = await getDfdReparticao(id);
  if (!dfd) return erro("DFD não encontrado.", 404);
  const esc = await escopoMesa();
  if (!esc) return erro(MSG_SEM_ACESSO_DFD, 403);
  // Excluir exige a unidade do PRÓPRIO DFD no escopo (não basta a do protocolo) e as linhas da pessoa.
  if (!esc.acessivel(dfd.reparticaoId) || !(await dfdLegivelNaMesa(esc, { ...dfd, id }))) return erro(MSG_SEM_ACESSO_DFD, 403);
  const alvo = await getDfd(id); // snapshot p/ o log antes de apagar (e os itens GRAVADOS, p/ o desfazer)
  const origem = new URL(req.url).searchParams.get("origem");
  // DESFAZER da importação que falhou no meio: só a gravação NOVA deste usuário que ficou pela metade.
  const desfeita =
    origem === "desfazer" &&
    !!alvo &&
    gravacaoParcial({
      criadoPor: dfd.criadoPor,
      usuarioId: a.u.id,
      totalItens: alvo.totalItens,
      itensGravados: alvo.itens.length,
      criadoEm: dfd.criadoEm,
      agora: Date.now(),
    });
  // O PAPEL, na Mesa em que o DFD está: o desfazer é da IMPORTAÇÃO; o reenvio importa E exclui; o resto, Excluir.
  const tela = telaDoRecurso(dfd.pcaId);
  const negado = desfeita
    ? recusa(a.acesso, tela, "importar")
    : (recusa(a.acesso, tela, "excluir") ?? (origem === "reenvio" ? recusa(a.acesso, tela, "importar") : null));
  if (negado) return negado;
  // DFD de protocolo em um PCA (enviado ou incorporado) NÃO é excluído — salvo esse desfazer num protocolo enviado:
  // 423 incorporado, 409 enviado.
  const noPca = (await pcaDeProtocolos([dfd.protocoloId])).get(dfd.protocoloId ?? 0);
  if (noPca) {
    const motivo = motivoNaoExcluirDfd(noPca, noPca.nome, desfeita);
    if (motivo) return erro(motivo, noPca.pcaIncorporadoEm ? 423 : 409);
  }
  const r = await excluirDfd(id);
  if (!r.ok) return erro(r.erro, 409);
  const reenvio = origem === "reenvio";
  await registrarAuditoria({
    usuario: a.u,
    acao: "excluir",
    entidade: "dfd",
    entidadeId: id,
    resumo: `DFD ${alvo?.numero ?? id} excluído${reenvio ? " (fora do envio do PDF reenviado)" : desfeita ? " (gravação desfeita após falha)" : ""}`,
    antes: alvo ? { numero: alvo.numero, tipo: alvo.tipo, valorTotal: alvo.valorTotal, totalItens: alvo.itens.length } : null,
    protocoloId: dfd.protocoloId,
    origem: reenvio ? "reenvio" : "exclusao",
    detalhe: alvo ? { alvo: { numero: alvo.numero, planejamento: alvo.planejamento } } : null,
  });
  return ok();
}

/**
 * Edita um DFD já gravado: vincular a protocolo (rule 4) e/ou editar unidade e
 * seções (tratamento, banner destravado). Escopo por unidade em toda escrita.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso(["dfd", "pca"], "manipular");
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(editarDfdSchema, req);
  if ("resp" in p) return p.resp;

  const esc = await escopoMesa();
  if (!esc) return erro("Faça login.", 401);
  const { acessivel } = esc;

  const dfd = await getDfdReparticao(id);
  if (!dfd) return erro("DFD não encontrado.", 404);
  if (!acessivel(dfd.reparticaoId) || !(await dfdLegivelNaMesa(esc, { ...dfd, id }))) return erro(MSG_SEM_ACESSO_DFD, 403);
  // O PAPEL manipula na Mesa em que o DFD está (a do sistema ou a do PCA).
  const negado = recusa(a.acesso, telaDoRecurso(dfd.pcaId), "manipular");
  if (negado) return negado;
  // TRAVA do PCA: DFD de protocolo INCORPORADO (ou vínculo PARA um protocolo incorporado) não se edita.
  const travas = await travaDeProtocolos([dfd.protocoloId, p.data.protocoloId]);
  const trava = [...travas.values()][0];
  if (trava) return respostaTravado(trava);
  // Itens validados ANTES de qualquer escrita (o banner envia campos + itens juntos: nada é gravado
  // pela metade). Mesma régua do import: ao menos um item e — quando o ADM mantém o valor unitário
  // BLOQUEANTE (padrão) — todo item com valor unitário (> 0).
  if (p.data.itens !== undefined) {
    if (p.data.itens.length === 0) return erro("O DFD precisa ter ao menos um item.", 422);
    if (p.data.itens.some((r) => semValorUnitario(r.valorUnitario))) {
      // A MESMA régua do banner: tipo do DFD + a categoria do protocolo em que ele está (exceções do ADM).
      const ctxItens = { dfdTipo: tipoCurtoDfd(p.data.tipo !== undefined ? p.data.tipo : dfd.tipo), categoria: await categoriaDoProtocolo(dfd.protocoloId) };
      if (comportamentoNo(await getRegrasAvaliacao(), "item.valorUnitario", ctxItens) === "bloqueia")
        return erro("Todos os itens precisam de valor unitário.", 422);
    }
  }

  // Vincular/desvincular a um protocolo (unidade do protocolo tem de ser acessível).
  if (p.data.protocoloId !== undefined) {
    let destino: { numero: string } | null = null;
    if (p.data.protocoloId != null) {
      const proto = await getProtocoloReparticao(p.data.protocoloId);
      if (!proto) return erro("Protocolo não encontrado.", 404);
      if (!protocoloLegivel(esc, { id: p.data.protocoloId, reparticaoId: proto.reparticaoId })) return erro("Sem acesso ao protocolo de destino.", 403);
      // Mover o DFD PARA um protocolo de outra Mesa: o papel também manipula lá.
      const negadoDestino = recusa(a.acesso, telaDoRecurso(proto.pcaId), "manipular");
      if (negadoDestino) return negadoDestino;
      destino = proto;
    }
    await vincularDfd(id, p.data.protocoloId, dfd.numero);
    // Histórico nos DOIS protocolos (o de onde saiu e o para onde foi) — cada um mostra o seu lado.
    if (p.data.protocoloId !== dfd.protocoloId) {
      const alvo = { numero: dfd.numero, planejamento: dfd.planejamento };
      const de = dfd.protocoloId;
      const numDe = de == null ? "—" : await detalheSeguro(async () => (await getProtocoloReparticao(de))?.numero ?? `#${de}`, `#${de}`);
      const numPara = destino?.numero ?? "—";
      const detalhe = { alvo, campos: [{ campo: "protocolo", rotulo: "Protocolo", antes: numDe, depois: numPara }] };
      for (const pid of [dfd.protocoloId, p.data.protocoloId]) {
        if (pid == null) continue;
        await registrarAuditoria({
          usuario: a.u,
          acao: "editar",
          entidade: "dfd",
          entidadeId: id,
          resumo: `DFD ${alvo.numero}: protocolo ${numDe} → ${numPara}`,
          protocoloId: pid,
          origem: "vinculo",
          detalhe,
        });
      }
    }
  }

  // Editar unidade, seções (tratamento) e/ou referências de renovação (DFD-R). Não
  // move p/ unidade inacessível.
  const editaCampos =
    p.data.reparticaoId !== undefined ||
    p.data.tipo !== undefined ||
    p.data.assinaturas !== undefined ||
    p.data.secoes !== undefined ||
    p.data.numeroContrato !== undefined ||
    p.data.numeroAta !== undefined ||
    p.data.numeroLicitacao !== undefined ||
    p.data.objeto !== undefined ||
    p.data.orgaoEntidade !== undefined ||
    p.data.setorRequisitante !== undefined ||
    p.data.responsavel !== undefined ||
    p.data.matricula !== undefined ||
    p.data.email !== undefined ||
    p.data.telefone !== undefined;
  // Snapshot "antes" (para o diff do log) — buscado 1× quando há edição de campos ou itens.
  const antes = editaCampos || p.data.itens !== undefined ? await getDfd(id) : null;
  let assinaturasGravadas: Assinatura[] | undefined;
  if (editaCampos) {
    if (p.data.reparticaoId != null && !acessivel(p.data.reparticaoId)) {
      return erro("Sem acesso à unidade de destino.", 403);
    }
    // Assinaturas (validação pela EQUIPE / desfazer): quem/quando vêm da SESSÃO — uma validação já
    // gravada idêntica mantém o carimbo original.
    const gravadas = await getDfdAssinaturas(id);
    const assinaturas =
      p.data.assinaturas !== undefined
        ? carimbarValidacao(p.data.assinaturas, gravadas?.assinaturas ?? [], a.u.nome, new Date().toISOString())
        : undefined;
    // Reconfere a assinatura contra o responsável da unidade SÓ quando a unidade OU as assinaturas
    // MUDAM de fato (regra 6: não salvar com assinatura não permitida). Salvar outra correção (seções,
    // cabeçalho…) de um DFD cuja assinatura já não confere não fica travado por isso.
    const repAlvo = p.data.reparticaoId !== undefined ? p.data.reparticaoId : dfd.reparticaoId;
    const mudouUnidade = p.data.reparticaoId !== undefined && p.data.reparticaoId !== dfd.reparticaoId;
    // Comparação CANÔNICA (só o que muda a conferência) — ordem de chaves/campos default não conta.
    const chaveAss = (l: { nome: string; eCpf: string; data: string; codigo: string; fonte: string; ocr?: boolean; validacao?: { responsavel: string } }[]) =>
      JSON.stringify(l.map((x) => [x.nome, x.eCpf, x.data, x.codigo, x.fonte, !!x.ocr, x.validacao?.responsavel ?? ""]));
    const mudouAssinaturas = assinaturas !== undefined && chaveAss(assinaturas) !== chaveAss(gravadas?.assinaturas ?? []);
    if (repAlvo != null && (mudouUnidade || mudouAssinaturas)) {
      const ass = gravadas;
      const res = validarAssinatura(assinaturas ?? ass?.assinaturas ?? [], await carregarResponsaveis(repAlvo), {
        exigeAssinatura: pdfExigeAssinatura(ass?.nomeArquivo),
      });
      // Respeita o nível `dfd.assinatura` do ADM COM as exceções por tipo de DFD e por categoria do protocolo (igual
      // ao banner e ao POST) — o tipo novo (se editado) ou o gravado (`antes`).
      if (res.status === "erro") {
        const ctxAss = { dfdTipo: tipoCurtoDfd(p.data.tipo !== undefined ? p.data.tipo : antes?.tipo), categoria: await categoriaDoProtocolo(dfd.protocoloId) };
        if (bloqueiaAssinatura(res, comportamentoNo(await getRegrasAvaliacao(), "dfd.assinatura", ctxAss))) return erro(res.motivo, 422);
      }
    }
    await atualizarDfdCampos(id, {
      reparticaoId: p.data.reparticaoId,
      tipo: p.data.tipo,
      assinaturas,
      secoes: p.data.secoes,
      numeroContrato: p.data.numeroContrato,
      numeroAta: p.data.numeroAta,
      numeroLicitacao: p.data.numeroLicitacao,
      objeto: p.data.objeto,
      orgaoEntidade: p.data.orgaoEntidade,
      setorRequisitante: p.data.setorRequisitante,
      responsavel: p.data.responsavel,
      matricula: p.data.matricula,
      email: p.data.email,
      telefone: p.data.telefone,
    });
    assinaturasGravadas = assinaturas;
  }

  // Editar ITENS (banner do item destravado): reescreve `dfd_itens` + recomputa o
  // `valorTotal` do cabeçalho. Escopo por unidade já garantido acima. Mesma regra do
  // import: todo item precisa de valor unitário (> 0).
  if (p.data.itens !== undefined) await reescreverDfdItens(id, p.data.itens);

  // HISTÓRICO: UMA linha com TUDO o que mudou (cabeçalho, seções, assinaturas e itens — a MESMA régua da
  // comparação do reenvio), com o protocolo do DFD como origem.
  if (antes && (editaCampos || p.data.itens !== undefined)) {
    // Montado com segurança: a gravação já foi feita (uma falha aqui nunca vira 500).
    const c = await detalheSeguro(async () => {
      const depois = comparavelDepois(antes, p.data, assinaturasGravadas);
      return compararDfd(antes, depois, await rotulosUnidades([antes.reparticaoId, depois.reparticaoId]));
    }, null);
    const alvo = { numero: antes.numero, planejamento: antes.planejamento };
    const partes = c ? [...c.campos.map((x) => x.rotulo), ...c.secoes.map((x) => x.rotulo), ...(c.assinaturas ? ["assinaturas"] : [])] : ["editado"];
    if (c && c.itens.length > 0) partes.push(`${c.itens.length} item(ns)`);
    await registrarAuditoria({
      usuario: a.u,
      acao: "editar",
      entidade: "dfd",
      entidadeId: id,
      // Sem diferença de CONTEÚDO (a comparação ignora espaços e quebras): o que mudou foi a formatação do texto — ex.: as
      // seções em parágrafos pela revisão do botão Atualizar (o cliente só envia o que mudou).
      resumo: `DFD ${antes.numero}: ${partes.join(", ") || "formatação do texto (espaços e quebras de linha)"}`.slice(0, 500),
      protocoloId: antes.protocoloId,
      origem: "banner",
      detalhe: c ? { alvo, campos: c.campos, secoes: c.secoes, assinaturas: c.assinaturas, itens: c.itens } : { alvo },
    });
  }

  return ok();
}

/** O DFD DEPOIS do PATCH (para o histórico): o gravado com os campos enviados, as seções/assinaturas
 * novas e os itens reescritos (o total volta a ser a Σ dos itens, como em `reescreverDfdItens`). */
function comparavelDepois(antes: DfdDetalhe, d: EditarDfdPayload, assinaturas: Assinatura[] | undefined): DfdComparavel {
  const t = (v: string | null | undefined, atual: string | null) => (v === undefined ? atual : v || null);
  const itens = d.itens?.map((it) => ({
    item: it.item ?? null,
    codigo: it.codigo ?? null,
    descricao: it.descricao ?? null,
    unidade: it.unidade ?? null,
    quantidade: it.quantidade ?? null,
    valorUnitario: it.valorUnitario ?? null,
    valorTotal: it.valorTotal ?? null,
  }));
  const soma = itens?.reduce((s, it) => s + (it.valorTotal ?? 0), 0) ?? 0;
  return {
    ...antes,
    reparticaoId: d.reparticaoId !== undefined ? d.reparticaoId : antes.reparticaoId,
    tipo: t(d.tipo, antes.tipo),
    numeroContrato: d.numeroContrato !== undefined ? juntarRefs([d.numeroContrato]) : antes.numeroContrato,
    numeroAta: d.numeroAta !== undefined ? juntarRefs([d.numeroAta]) : antes.numeroAta,
    numeroLicitacao: d.numeroLicitacao !== undefined ? juntarRefs([d.numeroLicitacao]) : antes.numeroLicitacao,
    objeto: t(d.objeto, antes.objeto),
    orgaoEntidade: t(d.orgaoEntidade, antes.orgaoEntidade),
    setorRequisitante: t(d.setorRequisitante, antes.setorRequisitante),
    responsavel: t(d.responsavel, antes.responsavel),
    matricula: t(d.matricula, antes.matricula),
    email: t(d.email, antes.email),
    telefone: t(d.telefone, antes.telefone),
    secoes: d.secoes ?? antes.secoes,
    assinaturas: assinaturas ?? antes.assinaturas,
    itens: itens ?? antes.itens,
    valorTotal: itens ? (soma > 0 ? Math.round(soma * 100) / 100 : null) : antes.valorTotal,
  };
}
