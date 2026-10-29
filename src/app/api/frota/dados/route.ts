import { exigirAcesso } from "@/lib/api-auth";
import { anosFrota, escopoDaFrota, pacoteFrota } from "@/lib/frota";
import { erro, ok } from "@/lib/http";
import type { TipoTransacao } from "@/lib/volus-core";

export const dynamic = "force-dynamic";

/**
 * As TRANSAÇÕES da frota de um ANO no escopo da pessoa (o pacote compacto montado pelo banco — `frota-core.ts`), ou só os
 * anos (`?anos=1`). `?tipo=abastecimento|manutencao` = só um tipo. O corpo é o texto do banco, devolvido como está.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const t = u.searchParams.get("tipo");
  const tipo: TipoTransacao | undefined = t === "abastecimento" || t === "manutencao" ? t : undefined;
  // Quem lê cada tipo: o painel (Frotas) lê os dois; Combustível só os abastecimentos; Manutenção só as manutenções.
  const telas = tipo === "abastecimento" ? (["combustivel", "frotas"] as const) : tipo === "manutencao" ? (["manutencao", "frotas"] as const) : (["frotas"] as const);
  const g = await exigirAcesso(telas, "visualizar");
  if ("erro" in g) return g.erro;
  const escopo = await escopoDaFrota();
  if (u.searchParams.get("anos") === "1") return ok({ anos: await anosFrota(escopo) });
  const ano = Number(u.searchParams.get("ano"));
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return erro("Ano inválido.", 422);
  const r = await pacoteFrota(ano, escopo, tipo);
  return new Response(`{"ok":true,"versao":${JSON.stringify(r.versao)},"total":${r.total},"pacote":${r.texto}}`, {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
