// AUTOMAÇÃO — o lado da TELA na plataforma (navegador): cria a execução, pede a autorização de uso único de cada escrita,
// registra o resultado dos passos e o que foi gravado na Centi. Sem JSX; nunca lança (devolve o motivo).
import type { AlvoAnexo } from "./automacao-core.ts";

type Resp = { ok: true; [k: string]: unknown } | { ok: false; erro: string };

async function chamar(url: string, metodo: "POST" | "PATCH", corpo: unknown): Promise<Resp> {
  try {
    const r = await fetch(url, { method: metodo, headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
    const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (r.ok && j?.ok) return j as Resp;
    return { ok: false, erro: j?.error ?? `Falha no sistema (erro ${r.status}).` };
  } catch {
    return { ok: false, erro: "Sem conexão com o sistema." };
  }
}

const BASE = "/api/admin/automacao/execucoes";

/** Um passo de escrita "anexar": a chave (única na execução) e o alvo exato. */
export type PassoAnexo = { chave: string; alvo: AlvoAnexo };

/** Cria a execução da receita com os passos e a põe RODANDO. */
export async function iniciarExecucao(
  receita: string,
  passos: readonly PassoAnexo[],
  entrada: Record<string, string | number | boolean | null>,
): Promise<{ id: number } | { erro: string }> {
  const c = await chamar(BASE, "POST", {
    receita,
    ensaio: false,
    entrada,
    passos: passos.map((p) => ({ chave: p.chave, capacidade: "anexar", alvo: `${p.alvo.id}|${p.alvo.numero}|${p.alvo.descricao}`.slice(0, 300) })),
  });
  if (!c.ok) return { erro: c.erro };
  const id = Number(c.id);
  const r = await chamar(`${BASE}/${id}`, "PATCH", { estado: "rodando" });
  return r.ok ? { id } : { erro: r.erro };
}

/** A autorização de UMA escrita (o token vai à extensão, que o consome no servidor) — ou: já estava gravado. */
export async function autorizarEscrita(
  execucaoId: number,
  passo: PassoAnexo,
): Promise<{ token: string } | { jaFeito: true; centiDocumento: string | null } | { erro: string }> {
  const r = await chamar(`${BASE}/${execucaoId}/autorizar`, "POST", { chave: passo.chave, capacidade: "anexar", alvo: passo.alvo });
  if (!r.ok) return { erro: r.erro };
  if (r.jaFeito) return { jaFeito: true, centiDocumento: typeof r.centiDocumento === "string" ? r.centiDocumento : null };
  return typeof r.token === "string" ? { token: r.token } : { erro: "O sistema não devolveu a autorização." };
}

/** Registra o que foi gravado na Centi (idempotente) e o passo como feito. */
export async function registrarAnexo(execucaoId: number, passo: PassoAnexo, centiDocumento: string | null, protocoloId: number | null, resultado: string) {
  const doc = centiDocumento && /^\d{1,15}$/.test(centiDocumento) ? centiDocumento : null;
  const r = await chamar("/api/admin/automacao/registros", "POST", { execucaoId, chave: passo.chave, capacidade: "anexar", alvo: passo.alvo, centiDocumento: doc, protocoloId });
  await concluirPasso(execucaoId, passo.chave, "ok", resultado);
  return r.ok ? null : r.erro;
}

/** O resultado de um passo (falhou/pulado/ok). */
export async function concluirPasso(execucaoId: number, chave: string, estado: "ok" | "falhou" | "pulado", texto: string) {
  const t = texto.slice(0, 500);
  await chamar(`${BASE}/${execucaoId}/passos`, "POST", { passos: [estado === "ok" ? { chave, estado, resultado: t } : { chave, estado, erro: t }] });
}

/** Encerra a execução interrompida (os passos que sobraram não rodam mais). */
export async function cancelarExecucao(execucaoId: number) {
  await chamar(`${BASE}/${execucaoId}`, "PATCH", { estado: "cancelada" });
}
