import { exigirEditor, exigirUsuario, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { diffCampos } from "@/lib/auditoria-core";
import { getRegrasAvaliacao } from "@/lib/avaliacao";
import { nivelDe } from "@/lib/avaliacao-core";
import { atualizarDfdCampos, excluirDfd, getDfd, getDfdAssinaturas, getDfdReparticao, reescreverDfdItens } from "@/lib/dfd";
import { editarDfdSchema } from "@/lib/dfd-validation";
import { getReparticaoContexto } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import { getProtocoloReparticao, vincularDfd } from "@/lib/protocolo";
import { bloqueiaAssinatura, pdfExigeAssinatura, validarAssinatura } from "@/lib/reparticao-responsaveis";
import { carregarResponsaveis } from "@/lib/reparticoes";

export const dynamic = "force-dynamic";

/** DFD completo (para o banner de visualização). Leitura segue o escopo da LISTA
 * (que em "Geral" mostra tudo) — o aperto de segurança é nas ESCRITAS, abaixo. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const dfd = await getDfd(id);
  if (!dfd) return erro("DFD não encontrado.", 404);
  return ok({ dfd });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const dfd = await getDfdReparticao(id);
  if (!dfd) return erro("DFD não encontrado.", 404);
  const { lista } = await getReparticaoContexto(a.u);
  if (dfd.reparticaoId != null && !lista.some((r) => r.id === dfd.reparticaoId)) {
    return erro("Sem acesso a este DFD.", 403);
  }
  const alvo = await getDfd(id); // snapshot p/ o log antes de apagar
  const r = await excluirDfd(id);
  if (!r.ok) return erro(r.erro, 409);
  await registrarAuditoria({
    usuario: a.u,
    acao: "excluir",
    entidade: "dfd",
    entidadeId: id,
    resumo: `DFD ${alvo?.numero ?? id} excluído`,
    antes: alvo ? { numero: alvo.numero, tipo: alvo.tipo, valorTotal: alvo.valorTotal, totalItens: alvo.itens.length } : null,
  });
  return ok();
}

/**
 * Edita um DFD já gravado: vincular a protocolo (rule 4) e/ou editar unidade e
 * seções (tratamento, banner destravado). Escopo por unidade em toda escrita.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(editarDfdSchema, req);
  if ("resp" in p) return p.resp;

  const { lista } = await getReparticaoContexto(a.u);
  const acessivel = (rid: number | null) => rid == null || lista.some((r) => r.id === rid);

  const dfd = await getDfdReparticao(id);
  if (!dfd) return erro("DFD não encontrado.", 404);
  if (!acessivel(dfd.reparticaoId)) return erro("Sem acesso a este DFD.", 403);

  // Vincular/desvincular a um protocolo (unidade do protocolo tem de ser acessível).
  if (p.data.protocoloId !== undefined) {
    if (p.data.protocoloId != null) {
      const proto = await getProtocoloReparticao(p.data.protocoloId);
      if (!proto) return erro("Protocolo não encontrado.", 404);
      if (!acessivel(proto.reparticaoId)) return erro("Sem acesso ao protocolo de destino.", 403);
    }
    await vincularDfd(id, p.data.protocoloId);
    await registrarAuditoria({
      usuario: a.u,
      acao: "editar",
      entidade: "dfd",
      entidadeId: id,
      resumo: p.data.protocoloId != null ? `DFD vinculado ao protocolo #${p.data.protocoloId}` : "DFD desvinculado do protocolo",
    });
  }

  // Editar unidade, seções (tratamento) e/ou referências de renovação (DFD-R). Não
  // move p/ unidade inacessível.
  const editaCampos =
    p.data.reparticaoId !== undefined ||
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
  if (editaCampos) {
    if (p.data.reparticaoId != null && !acessivel(p.data.reparticaoId)) {
      return erro("Sem acesso à unidade de destino.", 403);
    }
    // Ao mudar a unidade, reconfere a assinatura já gravada contra o responsável
    // da NOVA unidade (regra 6: não salvar com assinatura não permitida).
    if (p.data.reparticaoId != null) {
      const ass = await getDfdAssinaturas(id);
      const res = validarAssinatura(ass?.assinaturas ?? [], await carregarResponsaveis(p.data.reparticaoId), {
        exigeAssinatura: pdfExigeAssinatura(ass?.nomeArquivo),
      });
      // Respeita o nível `dfd.assinatura` do ADM COM a exceção por tipo de DFD (igual ao cliente
      // e ao POST) — `antes` (getDfd) traz o tipo.
      const regras = await getRegrasAvaliacao();
      if (res.status === "erro" && bloqueiaAssinatura(res, nivelDe(regras, "dfd.assinatura", { dfdTipo: tipoCurtoDfd(antes?.tipo) })))
        return erro(res.motivo, 422);
    }
    await atualizarDfdCampos(id, {
      reparticaoId: p.data.reparticaoId,
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
    // Log: diff só dos campos ENVIADOS (undefined = não editado, não entra no diff).
    const cs = (
      [
        "reparticaoId",
        "numeroContrato",
        "numeroAta",
        "numeroLicitacao",
        "objeto",
        "orgaoEntidade",
        "setorRequisitante",
        "responsavel",
        "matricula",
        "email",
        "telefone",
      ] as const
    ).filter((c) => p.data[c] !== undefined);
    const dd = diffCampos(antes as Record<string, unknown>, p.data as Record<string, unknown>, cs, {
      reparticaoId: "unidade",
      numeroContrato: "contrato",
      numeroAta: "ata",
      numeroLicitacao: "licitação",
      objeto: "objeto",
      orgaoEntidade: "órgão/entidade",
      setorRequisitante: "setor requisitante",
      responsavel: "responsável",
      matricula: "matrícula",
      email: "e-mail",
      telefone: "telefone",
    });
    const partes = [dd.resumo, p.data.secoes !== undefined ? "tratamento/seções atualizados" : ""].filter(Boolean);
    await registrarAuditoria({
      usuario: a.u,
      acao: "editar",
      entidade: "dfd",
      entidadeId: id,
      resumo: `DFD ${antes?.numero ?? id}: ${partes.join("; ") || "editado"}`,
      antes: dd.antes,
      depois: dd.depois,
    });
  }

  // Editar ITENS (banner do item destravado): reescreve `dfd_itens` + recomputa o
  // `valorTotal` do cabeçalho. Escopo por unidade já garantido acima. Mesma regra do
  // import: todo item precisa de valor unitário (> 0).
  if (p.data.itens !== undefined) {
    if (p.data.itens.length === 0) return erro("O DFD precisa ter ao menos um item.", 422);
    if (!p.data.itens.every((r) => r.valorUnitario != null && r.valorUnitario > 0)) {
      return erro("Todos os itens precisam de valor unitário.", 422);
    }
    await reescreverDfdItens(id, p.data.itens);
    // Log: por item, o que mudou (descrição só sinaliza "alterada" p/ manter o resumo curto).
    const antesItens = antes?.itens ?? [];
    const linhas: string[] = [];
    p.data.itens.forEach((d2, i) => {
      const a2 = antesItens[i];
      if (!a2) return;
      const dd = diffCampos(
        a2 as Record<string, unknown>,
        d2 as Record<string, unknown>,
        ["codigo", "unidade", "quantidade", "valorUnitario", "valorTotal"],
        { codigo: "código", unidade: "unidade", quantidade: "quantidade", valorUnitario: "valor unit.", valorTotal: "valor total" },
      );
      const partes = [dd.resumo, (a2.descricao ?? null) !== (d2.descricao ?? null) ? "descrição alterada" : ""].filter(Boolean);
      if (partes.length) linhas.push(`Item ${d2.item ?? i + 1}: ${partes.join("; ")}`);
    });
    await registrarAuditoria({
      usuario: a.u,
      acao: "editar",
      entidade: "dfd",
      entidadeId: id,
      resumo: `DFD ${antes?.numero ?? id}: ${(linhas.length ? linhas.join(" · ") : "itens salvos").slice(0, 1500)}`,
      depois: { itensAlterados: linhas.length },
    });
  }

  return ok();
}
