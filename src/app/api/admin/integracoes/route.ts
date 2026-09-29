import { eq, sql } from "drizzle-orm";
import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { configuracoes } from "@/db/schema";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { invalidarIntegracoes } from "@/lib/integracoes";
import { coerceIntegracoes, dominioDoRemetente, type Integracoes, RESEND_VAZIO, TRELLO_VAZIO, toView, URL_SISTEMA_PADRAO } from "@/lib/integracoes-core";
import { integracoesSchema } from "@/lib/integracoes-validation";
import { cifrarSegredo, temChaveMestra } from "@/lib/integracoes-segredos";

export const dynamic = "force-dynamic";

// Config de integrações do ADM. Chave `integracoes` do blob `configuracoes` id=1 (preserva
// as irmãs — aparência/avaliação). SEGREDOS são cifrados e NUNCA devolvidos (só `definido`).

async function lerBlob(): Promise<Record<string, unknown>> {
  const [row] = await getDb()
    .select({ dados: configuracoes.dados })
    .from(configuracoes)
    .where(eq(configuracoes.id, 1))
    .limit(1);
  try {
    return row?.dados ? (JSON.parse(row.dados) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const atual = coerceIntegracoes((await lerBlob()).integracoes);
  return ok({ integracoes: toView(atual, temChaveMestra()) });
}

export async function PATCH(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const corpo = await parseCorpo(integracoesSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const entrada = corpo.data;

  const blob = await lerBlob();
  const atual = coerceIntegracoes(blob.integracoes);

  // Segredo novo (não-vazio) é cifrado; vazio = mantém o atual. Só exige a chave mestra
  // quando há segredo novo para cifrar (só o Turnstile guarda segredo cifrado aqui).
  if (entrada.turnstile.secret.length > 0 && !temChaveMestra()) {
    return erro("Defina a chave mestra (INTEGRACOES_CHAVE) no Cloudflare antes de salvar segredos.", 400);
  }
  const turnstileSecret =
    entrada.turnstile.secret.length > 0 ? await cifrarSegredo(entrada.turnstile.secret) : atual.turnstile.secret;

  // TRELLO: token e segredo novos são cifrados (vazio = mantém); trocar a chave ou o token esquece a conta confirmada
  // (o "Testar conexão" a confirma de novo).
  const tr = entrada.trello;
  if ((tr.token || tr.segredo) && !temChaveMestra()) {
    return erro("Defina a chave mestra (INTEGRACOES_CHAVE) no Cloudflare antes de salvar segredos.", 400);
  }
  // RESEND: a chave nova é cifrada (vazio = mantém); trocar a chave ou o DOMÍNIO do remetente esquece a verificação (o
  // "Testar" confere de novo).
  const re = entrada.resend;
  if (re.apiKey && !temChaveMestra()) {
    return erro("Defina a chave mestra (INTEGRACOES_CHAVE) no Cloudflare antes de salvar segredos.", 400);
  }
  const antesRe = atual.resend ?? RESEND_VAZIO;
  const mudouDominio = !!re.apiKey || dominioDoRemetente(re.remetente) !== dominioDoRemetente(antesRe.remetente);
  const antesTr = atual.trello ?? TRELLO_VAZIO;
  const mudouConta = tr.apiKey !== antesTr.apiKey || !!tr.token;
  const novoInteg: Integracoes = {
    turnstile: { ativo: entrada.turnstile.ativo, siteKey: entrada.turnstile.siteKey, secret: turnstileSecret },
    monitoramento: { ativo: entrada.monitoramento.ativo },
    trello: {
      ativo: tr.ativo,
      apiKey: tr.apiKey,
      token: tr.token ? await cifrarSegredo(tr.token) : antesTr.token,
      segredo: tr.segredo ? await cifrarSegredo(tr.segredo) : antesTr.segredo,
      membroId: mudouConta ? "" : antesTr.membroId,
      usuario: mudouConta ? "" : antesTr.usuario,
      nome: mudouConta ? "" : antesTr.nome,
    },
    resend: {
      ativo: re.ativo,
      apiKey: re.apiKey ? await cifrarSegredo(re.apiKey) : antesRe.apiKey,
      remetente: re.remetente,
      urlSistema: re.urlSistema.replace(/\/+$/, "") || URL_SISTEMA_PADRAO,
      dominio: mudouDominio ? "" : antesRe.dominio,
      verificado: mudouDominio ? false : antesRe.verificado,
    },
  };

  const novo = { ...blob, integracoes: novoInteg };
  await getDb()
    .update(configuracoes)
    .set({ dados: JSON.stringify(novo), atualizadoPor: g.u.id, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(configuracoes.id, 1));
  invalidarIntegracoes(); // loader tem cache de 60s
  // Só o FATO da alteração — NUNCA os valores/segredos das integrações.
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "configuracao", entidadeId: 1, resumo: "Integrações atualizadas" });
  return ok({ integracoes: toView(novoInteg, temChaveMestra()) });
}

export async function DELETE() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const blob = await lerBlob();
  const novo = { ...blob, integracoes: {} };
  await getDb()
    .update(configuracoes)
    .set({ dados: JSON.stringify(novo), atualizadoPor: g.u.id, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(configuracoes.id, 1));
  invalidarIntegracoes();
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "configuracao", entidadeId: 1, resumo: "Integrações removidas" });
  return ok({ integracoes: toView(coerceIntegracoes(undefined), temChaveMestra()) });
}
