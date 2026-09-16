import { exigirEditor, exigirUsuario, intId } from "@/lib/api-auth";
import { getRegrasAvaliacao } from "@/lib/avaliacao";
import { nivelDe } from "@/lib/avaliacao-core";
import { atualizarDfdCampos, excluirDfd, getDfd, getDfdAssinaturas, getDfdReparticao } from "@/lib/dfd";
import { editarDfdSchema } from "@/lib/dfd-validation";
import { getReparticaoContexto } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
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
  const r = await excluirDfd(id);
  if (!r.ok) return erro(r.erro, 409);
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
  }

  // Editar unidade, seções (tratamento) e/ou referências de renovação (DFD-R). Não
  // move p/ unidade inacessível.
  const editaCampos =
    p.data.reparticaoId !== undefined ||
    p.data.secoes !== undefined ||
    p.data.numeroContrato !== undefined ||
    p.data.numeroAta !== undefined ||
    p.data.numeroLicitacao !== undefined;
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
      // Respeita o nível `dfd.assinatura` do ADM (global aqui — o tipo do DFD não está em escopo).
      const regras = await getRegrasAvaliacao();
      if (res.status === "erro" && bloqueiaAssinatura(res, nivelDe(regras, "dfd.assinatura")))
        return erro(res.motivo, 422);
    }
    await atualizarDfdCampos(id, {
      reparticaoId: p.data.reparticaoId,
      secoes: p.data.secoes,
      numeroContrato: p.data.numeroContrato,
      numeroAta: p.data.numeroAta,
      numeroLicitacao: p.data.numeroLicitacao,
    });
  }

  return ok();
}
