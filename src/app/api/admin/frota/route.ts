import { asc } from "drizzle-orm";
import { orgaos, reparticoes } from "@/db/schema";
import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { configFrotaView, credencialDefinida, lerConfigFrota } from "@/lib/frota-config-core";
import { getConfigFrota, gravarConfigFrota, listarContratos, listarCursores, listarLeituras, listarUnidadesFrota, ultimasLeituras } from "@/lib/frota";
import { configFrotaSchema } from "@/lib/frota-validation";
import { erro, ok, parseCorpo } from "@/lib/http";
import { cifrarSegredo, temChaveMestra } from "@/lib/integracoes-segredos";

export const dynamic = "force-dynamic";

/** A integração da FROTA (Configurações → Importações → Frotas — só o ADM): a configuração (sem o segredo), os contratos,
 * as unidades da Vólus, os cursores da automática, as últimas leituras e as listas para os vínculos. */
export async function GET() {
  const a = await exigirAdmin();
  if ("erro" in a) return a.erro;
  const db = getDb();
  const [cfg, contratos, unidades, cursores, leituras, ultimas, listaOrgaos, listaUnidades] = await Promise.all([
    getConfigFrota(),
    listarContratos(),
    listarUnidadesFrota(),
    listarCursores(),
    listarLeituras(100),
    ultimasLeituras(),
    db.select({ id: orgaos.id, nome: orgaos.nome, sigla: orgaos.sigla }).from(orgaos).orderBy(asc(orgaos.nome)),
    db.select({ id: reparticoes.id, codigo: reparticoes.codigo, nome: reparticoes.nome, orgaoId: reparticoes.orgaoId }).from(reparticoes).orderBy(asc(reparticoes.codigo)),
  ]);
  return ok({ config: configFrotaView(cfg), temChaveMestra: temChaveMestra(), contratos, unidades, cursores, leituras, ultimas, orgaos: listaOrgaos, reparticoes: listaUnidades.filter((u) => u.codigo !== "GERAL") });
}

/** Grava a credencial (o segredo novo é CIFRADO — vazio = mantém), a automática e os limites dos alertas. */
export async function PATCH(req: Request) {
  const a = await exigirAdmin();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(configFrotaSchema, req);
  if ("resp" in p) return p.resp;
  if (p.data.horaFim <= p.data.horaInicio) return erro("O fim do horário vem depois do início.", 422);
  if (p.data.clientSecret && !temChaveMestra()) return erro("Defina a chave mestra (INTEGRACOES_CHAVE) no Cloudflare antes de salvar o segredo.", 400);
  const antes = await getConfigFrota();
  const trocouCredencial = p.data.clientId !== antes.clientId || !!p.data.clientSecret;
  const novo = lerConfigFrota({
    ...antes,
    ...p.data,
    clientSecret: p.data.clientSecret ? await cifrarSegredo(p.data.clientSecret) : antes.clientSecret,
    testadoEm: trocouCredencial ? null : antes.testadoEm,
    empresasNoTeste: trocouCredencial ? 0 : antes.empresasNoTeste,
  });
  if (novo.ativa && !credencialDefinida(novo)) return erro("Configure o Client ID e o Client Secret antes de ligar a atualização automática.", 422);
  const cfg = await gravarConfigFrota(novo, a.u.id);
  const partes = [
    trocouCredencial ? "credencial da Vólus alterada" : "",
    antes.ativa !== cfg.ativa ? `atualização automática ${cfg.ativa ? "ligada" : "desligada"}` : "",
    antes.frequenciaMin !== cfg.frequenciaMin ? `frequência ${cfg.frequenciaMin} min` : "",
    antes.diasRecentes !== cfg.diasRecentes ? `relê os últimos ${cfg.diasRecentes} dias` : "",
    JSON.stringify(antes.alertas) !== JSON.stringify(cfg.alertas) ? "limites dos alertas" : "",
  ].filter(Boolean);
  // Só o FATO — nunca o segredo.
  await registrarAuditoria({ usuario: a.u, acao: "editar", entidade: "frota", resumo: `Frotas (Vólus): ${partes.join("; ") || "configuração salva"}` });
  return ok({ config: configFrotaView(cfg) });
}
