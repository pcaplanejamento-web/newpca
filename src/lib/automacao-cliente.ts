// AUTOMAÇÃO — o lado da TELA na plataforma (navegador): cria a execução, pede a autorização de uso único de cada escrita,
// registra o resultado dos passos e o que foi gravado na Centi. Sem JSX; nunca lança (devolve o motivo).
import { type AlvoAnexo, textoAlvoAnexo } from "./automacao-core.ts";

type Resp = { ok: true; [k: string]: unknown } | { ok: false; erro: string };

type RespInterna = Resp & { transitoria?: boolean };

async function chamarUmaVez(url: string, metodo: "POST" | "PATCH", corpo: unknown): Promise<RespInterna> {
  try {
    const r = await fetch(url, { method: metodo, headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
    const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (r.ok && j?.ok) return j as Resp;
    return { ok: false, erro: j?.error ?? `Falha no sistema (erro ${r.status}).`, transitoria: r.status >= 500 || r.status === 429 };
  } catch {
    return { ok: false, erro: "Sem conexão com o sistema.", transitoria: true };
  }
}

/** Uma chamada ao sistema; a falha TRANSITÓRIA (rede, 5xx, 429) tenta UMA vez de novo — o registro de um passo não se perde
 * por um soluço da rede (a recusa do servidor, 4xx, não se repete). */
async function chamar(url: string, metodo: "POST" | "PATCH", corpo: unknown, esperaMs = 1500): Promise<Resp> {
  const r = await chamarUmaVez(url, metodo, corpo);
  if (r.ok || !r.transitoria) return r;
  await new Promise((ok) => setTimeout(ok, esperaMs));
  return chamarUmaVez(url, metodo, corpo);
}

const BASE = "/api/admin/automacao/execucoes";

/** Um passo de escrita "anexar": a chave (única na execução) e o alvo exato. */
/** `ausenteNaCenti` = o sistema registrou o anexo, mas o protocolo da Centi NÃO o tem — o registro não impede reenviar
 * (a extensão segue conferindo o protocolo na hora de gravar). */
export type PassoAnexo = { chave: string; alvo: AlvoAnexo; ausenteNaCenti?: boolean };

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
    passos: passos.map((p) => ({ chave: p.chave, capacidade: "anexar", alvo: textoAlvoAnexo(p.alvo) })),
  });
  if (!c.ok) return { erro: c.erro };
  const id = Number(c.id);
  const r = await chamar(`${BASE}/${id}`, "PATCH", { estado: "rodando" });
  return r.ok ? { id } : { erro: r.erro };
}

/** Cria a execução de uma receita SÓ DE LEITURA (ex.: emitir e baixar) — o histórico de cada DFD; nada é gravado na Centi. */
export async function iniciarExecucaoLeitura(
  receita: string,
  capacidade: "baixar" | "ler" | "consultar",
  passos: readonly { chave: string; alvo: string }[],
  entrada: Record<string, string | number | boolean | null>,
): Promise<{ id: number } | { erro: string }> {
  const c = await chamar(BASE, "POST", { receita, ensaio: false, entrada, passos: passos.map((p) => ({ chave: p.chave.slice(0, 120), capacidade, alvo: p.alvo.slice(0, 300) })) });
  if (!c.ok) return { erro: c.erro };
  const id = Number(c.id);
  const r = await chamar(`${BASE}/${id}`, "PATCH", { estado: "rodando" });
  return r.ok ? { id } : { erro: r.erro };
}

/** O resultado de VÁRIOS passos (em lotes de 50 — o teto da rota). */
export async function concluirPassos(execucaoId: number, lista: readonly { chave: string; estado: "ok" | "falhou" | "pulado"; texto: string }[]) {
  for (let i = 0; i < lista.length; i += 50)
    await chamar(`${BASE}/${execucaoId}/passos`, "POST", {
      passos: lista.slice(i, i + 50).map((p) => (p.estado === "ok" ? { chave: p.chave.slice(0, 120), estado: p.estado, resultado: p.texto.slice(0, 500) } : { chave: p.chave.slice(0, 120), estado: p.estado, erro: p.texto.slice(0, 500) })),
    });
}

/** A autorização de UMA escrita (o token vai à extensão, que o consome no servidor) — ou: já estava gravado. */
export async function autorizarEscrita(
  execucaoId: number,
  passo: PassoAnexo,
): Promise<{ token: string } | { jaFeito: true; centiDocumento: string | null } | { erro: string }> {
  const r = await chamar(`${BASE}/${execucaoId}/autorizar`, "POST", { chave: passo.chave, capacidade: "anexar", alvo: passo.alvo, ...(passo.ausenteNaCenti ? { ausenteNaCenti: true } : {}) });
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

/** SINAL DE VIDA: o passo em curso ("executando") — a execução que dá sinal nunca é tomada como abandonada pelo servidor. */
export async function sinalPasso(execucaoId: number, chave: string) {
  await chamarUmaVez(`${BASE}/${execucaoId}/passos`, "POST", { passos: [{ chave: chave.slice(0, 120), estado: "executando" }] });
}

/** Fechar/recarregar a página no meio da execução a CANCELA (keepalive — o pedido sai mesmo com a página indo embora).
 * Devolve quem solta o ouvinte (ao terminar normalmente). */
export function cancelarAoSair(execucaoId: number): () => void {
  if (typeof window === "undefined") return () => {};
  const sair = () => {
    try {
      void fetch(`${BASE}/${execucaoId}`, { method: "PATCH", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ estado: "cancelada" }) });
    } catch {
      /* a reconciliação do servidor encerra a que ficar para trás */
    }
  };
  window.addEventListener("pagehide", sair);
  return () => window.removeEventListener("pagehide", sair);
}

/** O que JÁ foi anexado nos protocolos da Centi indicados (chave Id + descrição canônica) — o que está aqui não é emitido de novo. */
export async function jaAnexados(alvos: readonly string[]): Promise<Map<string, { documento: string | null; quando: string | null; quem: string | null }> | null> {
  const m = new Map<string, { documento: string | null; quando: string | null; quem: string | null }>();
  const lista = [...new Set(alvos)];
  for (let i = 0; i < lista.length; i += 200) {
    try {
      const r = await fetch(`/api/admin/automacao/registros?alvos=${lista.slice(i, i + 200).join(",")}`);
      const j = (await r.json().catch(() => null)) as { ok?: boolean; registros?: { centiAlvo: string; descricao: string; centiDocumento: string | null; criadoEm: string | null; usuarioNome: string | null }[] } | null;
      if (!r.ok || !j?.ok) return null;
      for (const x of j.registros ?? []) m.set(`${x.centiAlvo}|${x.descricao}`, { documento: x.centiDocumento, quando: x.criadoEm, quem: x.usuarioNome });
    } catch {
      return null;
    }
  }
  return m;
}
