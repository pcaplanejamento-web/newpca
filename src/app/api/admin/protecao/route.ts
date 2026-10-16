import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { opcoesPapel } from "@/lib/papeis";
import { getConfigProtecao, gravarConfigProtecao } from "@/lib/protecao";
import { diffProtecao } from "@/lib/protecao-core";
import { configProtecaoSchema } from "@/lib/protecao-validation";

export const dynamic = "force-dynamic";

// Configurações → Proteção de dados (ADM): os bloqueios de seleção/cópia e de impressão/captura, os papéis em que valem e
// a tela pública. Mesma linha `configuracoes` id=1 (chave `protecao`) — as chaves irmãs ficam.

async function papeisCadastrados() {
  return (await opcoesPapel()).map((p) => ({ id: p.id, nome: p.nome }));
}

export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const [protecao, papeis] = await Promise.all([getConfigProtecao({ fresco: true }), papeisCadastrados()]);
  return ok({ protecao, papeis });
}

export async function PATCH(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(configProtecaoSchema, req);
  if ("resp" in p) return p.resp;
  const papeis = await papeisCadastrados();
  const nomes = new Map(papeis.map((x) => [x.id, x.nome]));
  if (p.data.papeis.some((id) => !nomes.has(id))) return erro("Algum papel escolhido não existe mais. Recarregue a tela.", 422);
  const antes = await getConfigProtecao({ fresco: true });
  const protecao = await gravarConfigProtecao(p.data, g.u.id);
  await registrarAuditoria({
    usuario: g.u,
    acao: "editar",
    entidade: "configuracao",
    entidadeId: 1,
    resumo: `Proteção de dados (ADM): ${diffProtecao(antes, protecao, nomes)}`,
  });
  return ok({ protecao, papeis });
}
