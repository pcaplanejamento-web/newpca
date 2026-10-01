// Automação Centi (núcleo PURO, testado): monta o pedido do "Emitir DFD" da Centi (CM002 Planejamento → Operações →
// Emitir DFD → Processar) a partir dos Ids de planejamento. A extensão do Chrome (extensao-centi/) envia o pedido com a
// sessão da Centi já aberta no navegador; a aba Automação só lê e salva os PDFs — nada é gravado na Centi.

export type ConfigCenti = {
  /** "Emitir valor referência" do diálogo. */
  valorReferencia: boolean;
  /** "Emitir data" do diálogo. */
  emitirData: boolean;
  /** IdPlanejamentoAssinaturaDFD — o modelo de assinatura do DFD que a Centi envia (13 na captura de 01/10/2026). */
  assinaturaDfd: string;
  /** Identificam a operação "Emitir DFD" na Centi (capturados no "Processar"). */
  moduleKey: number;
  guid: string;
};

export const CONFIG_CENTI_PADRAO: ConfigCenti = {
  valorReferencia: true,
  emitirData: false,
  assinaturaDfd: "13",
  moduleKey: 120464,
  guid: "2b414e51-4389-1c0a-f194-b11779b834f5",
};

/** A versão da extensão publicada junto (extensao-centi/manifest.json) = a MÍNIMA que a tela aceita (a extensão é só o
 * canal; a lógica mora aqui e atualiza com o sistema — só uma mudança no canal pede reinstalar). */
export const VERSAO_EXTENSAO_CENTI = "1.1.0";

export const MAX_IDS_CENTI = 200;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Normaliza a configuração guardada (qualquer JSON → válida). */
export function lerConfigCenti(v: unknown): ConfigCenti {
  const o = (v && typeof v === "object" ? v : {}) as Partial<Record<keyof ConfigCenti, unknown>>;
  const p = CONFIG_CENTI_PADRAO;
  const ass = typeof o.assinaturaDfd === "string" ? o.assinaturaDfd.replace(/\D/g, "") : "";
  const mk = Number(o.moduleKey);
  return {
    valorReferencia: typeof o.valorReferencia === "boolean" ? o.valorReferencia : p.valorReferencia,
    emitirData: typeof o.emitirData === "boolean" ? o.emitirData : p.emitirData,
    assinaturaDfd: ass || p.assinaturaDfd,
    moduleKey: Number.isInteger(mk) && mk > 0 ? mk : p.moduleKey,
    guid: typeof o.guid === "string" && GUID.test(o.guid.trim()) ? o.guid.trim().toLowerCase() : p.guid,
  };
}

/** Os Ids digitados ("1154:1155, 1160") → únicos, na ordem, só dígitos, até MAX_IDS_CENTI. */
export function lerIdsCenti(texto: string): { ids: string[]; excedente: number } {
  const vistos = new Set<string>();
  for (const t of texto.split(/[\s:;,]+/)) {
    const d = t.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    if (d && d !== "0") vistos.add(d);
  }
  const todos = [...vistos];
  return { ids: todos.slice(0, MAX_IDS_CENTI), excedente: Math.max(0, todos.length - MAX_IDS_CENTI) };
}

const dois = (n: number) => String(n).padStart(2, "0");

/** As TRAVAS: nunca vincular ao protocolo, assinar, enviar e-mail nem guardar na Centi (a extensão confere de novo). */
export const TRAVAS_CENTI: Record<string, string> = {
  AnexarAoProtocolo: "0",
  AssinarDocumento: "0",
  Sign: "0",
  SendMail: "0",
  StorageReport: "0",
  Background: "0",
};

/** O corpo do POST /restauth/operation — o MESMO do "Processar" da Centi, com o Id e as opções. */
export function pedidoEmitirDfd(id: string, cfg: ConfigCenti, agora: Date) {
  const data = `${dois(agora.getDate())}/${dois(agora.getMonth() + 1)}/${agora.getFullYear()}`;
  const hora = `${dois(agora.getHours())}:${dois(agora.getMinutes())}:${dois(agora.getSeconds())}`;
  const valores: [string, string][] = [
    ["IdComprasPlanejamento", id],
    ["IdPlanejamentoAssinaturaDFD", cfg.assinaturaDfd],
    ["DFD", "1"],
    ["EmitirData", cfg.emitirData ? "1" : "0"],
    ["Data", data],
    ["EmitirValorReferencia", cfg.valorReferencia ? "1" : "0"],
    ["AnexarAoProtocolo", "0"],
    ["AssinarDocumento", "0"],
    ["TipoAssinatura", "0"],
    ["IdAssinaturaDigital", ""],
    ["IdAssinaturaSistema", ""],
    ["InformarDataAssinatura", "0"],
    ["DataAssinatura", `${data} ${hora}`],
    ["EmbeddedFonts", "0"],
    ["ImprimirQrCodeGenerico", "0"],
    ["ChaveEletronica", ""],
    ["TextoCentralizado", ""],
    ["MarcaDagua", "0"],
    ["ApenasPrimeiraPagina", "0"],
    ["TamanhoTextoCentralizado", ""],
    ["PrintOptimized", "0"],
    ["ExportXlsxSimplificado", "0"],
    ["RelatorioVerificacaoItem", ""],
    ["GerarCubo", "0"],
    ["CadastrarEValidarCubo", "0"],
    ["TypeReturn", "0"],
    ["SendMail", "0"],
    ["EmailRemetente", ""],
    ["Remetente", ""],
    ["Emails", ""],
    ["Assunto", ""],
    ["Msg", ""],
    ["Sign", "0"],
    ["IdAssinatura", ""],
    ["FileName", ""],
    ["StorageReport", "0"],
    ["Name", ""],
    ["Description", ""],
    ["SysInternal", "0"],
    ["RestApp", "0"],
    ["Token", ""],
    ["GuidTransacao", ""],
    ["Captcha", ""],
    ["Background", "0"],
  ];
  return { ModuleKey: cfg.moduleKey, Guid: cfg.guid, Params: valores.map(([Key, Value]) => ({ Key, Value })) };
}

/** Nome do arquivo salvo na pasta. */
export function nomeArquivoDfd(id: string): string {
  return `DFD - Planejamento ${id}.pdf`;
}

/** Um protocolo do sistema com os DFDs dele (a seleção "Por protocolo"). */
export type ProtocoloAutomacao = {
  id: number;
  numero: string;
  idExterno: string | null;
  assunto: string | null;
  interessado: string | null;
  anoPca: number | null;
  pca: string | null;
  dfds: { numero: string; planejamento: string | null }[];
};

/** Um arquivo a baixar: o Id da Centi (= nº de planejamento), o nome do arquivo e a PASTA (subpasta do protocolo; null =
 * a raiz escolhida). */
export type TarefaCenti = { chave: string; id: string; arquivo: string; pasta: string | null };

export const MAX_NOME_PASTA = 120;
const PROIBIDOS = /[\\/:*?"<>|]+/g;

/** Nome seguro para arquivo/pasta em qualquer sistema (sem \ / : * ? " < > |, sem ponto/espaço no fim). */
export function nomeSeguro(texto: string, max = MAX_NOME_PASTA): string {
  const t = texto.replace(/\p{Cc}/gu, " ").replace(PROIBIDOS, "-").replace(/\s+/g, " ").trim();
  return t.slice(0, max).replace(/[\s.-]+$/, "").trim();
}

/** A pasta do protocolo: "Nº do protocolo - nome" (o nome = o assunto, senão o interessado; "/" do número vira "-"). */
export function nomePastaProtocolo(p: Pick<ProtocoloAutomacao, "numero" | "assunto" | "interessado">): string {
  const nome = (p.assunto ?? "").trim() || (p.interessado ?? "").trim();
  return nomeSeguro(nome ? `${p.numero} - ${nome}` : p.numero) || "Protocolo";
}

/** As tarefas dos protocolos escolhidos: uma por DFD com planejamento (sem planejamento = `semPlanejamento`, a Centi não
 * acha), na pasta do protocolo; o MESMO planejamento duas vezes no mesmo protocolo vira um arquivo só. */
export function tarefasDosProtocolos(protos: ProtocoloAutomacao[]): { tarefas: TarefaCenti[]; semPlanejamento: { protocolo: string; dfd: string }[] } {
  const tarefas: TarefaCenti[] = [];
  const semPlanejamento: { protocolo: string; dfd: string }[] = [];
  const pastas = new Set<string>();
  for (const p of protos) {
    let pasta = nomePastaProtocolo(p);
    // Dois protocolos com o mesmo nome de pasta (raro) não se misturam.
    if (pastas.has(pasta)) pasta = nomeSeguro(`${pasta} (${p.id})`);
    pastas.add(pasta);
    const vistos = new Set<string>();
    for (const d of p.dfds) {
      const id = (d.planejamento ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
      if (!id || id === "0") {
        semPlanejamento.push({ protocolo: p.numero, dfd: d.numero });
        continue;
      }
      if (vistos.has(id)) continue;
      vistos.add(id);
      tarefas.push({ chave: `${p.id}:${id}`, id, arquivo: `${nomeSeguro(`DFD ${d.numero} - Planejamento ${id}`, 150)}.pdf`, pasta });
    }
  }
  return { tarefas, semPlanejamento };
}

/** As tarefas dos Ids digitados (na raiz da pasta escolhida). */
export const tarefasDosIds = (ids: string[]): TarefaCenti[] => ids.map((id) => ({ chave: id, id, arquivo: nomeArquivoDfd(id), pasta: null }));

/** A maior de duas versões "a.b.c". */
export function maiorVersao(a: string, b: string): string {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? a : b;
  return a;
}

export const versaoAtende = (instalada: string) => maiorVersao(instalada || "0", VERSAO_EXTENSAO_CENTI) === instalada;

export const ehPdf = (b: Uint8Array) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;

/** O que a resposta da Centi traz: o PDF (bytes, base64 ou base64 gzip) ou a CHAVE do arquivo temporário ({File:{Key,
 * FileName}} — o "Processar" devolve assim e o arquivo é buscado depois pela chave). */
export type AchadoCenti =
  | { tipo: "pdf"; bytes: Uint8Array }
  | { tipo: "base64"; b64: string }
  | { tipo: "gzip"; b64: string }
  | { tipo: "chave"; chave: string; nome: string; url: string | null }
  | { tipo: "nada"; erro: string; amostra?: string };

function acharNoJson(o: unknown, prof = 0): AchadoCenti | null {
  if (o == null || prof > 8) return null;
  if (typeof o === "string") {
    const t = o.replace(/^data:[^;]+;base64,/, "");
    if (t.startsWith("JVBER")) return { tipo: "base64", b64: t };
    if (t.startsWith("H4sI")) return { tipo: "gzip", b64: t };
    return null;
  }
  if (Array.isArray(o)) {
    if (o.length > 4 && o[0] === 37 && o[1] === 80 && o[2] === 68 && o[3] === 70) return { tipo: "pdf", bytes: Uint8Array.from(o as number[]) };
    for (const v of o) {
      const r = acharNoJson(v, prof + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof o === "object") {
    for (const v of Object.values(o)) {
      const r = acharNoJson(v, prof + 1);
      if (r) return r;
    }
    const f = o as { Key?: unknown; FileName?: unknown; URL?: unknown };
    if (typeof f.Key === "string" && /^[0-9a-f-]{20,}$/i.test(f.Key))
      return { tipo: "chave", chave: f.Key, nome: typeof f.FileName === "string" && f.FileName ? f.FileName : "arquivo.pdf", url: typeof f.URL === "string" && f.URL ? f.URL : null };
  }
  return null;
}

/** O esqueleto da resposta (chaves e tipos; textos cortados; sem tokens) — para diagnosticar um formato novo. */
export function esqueletoCenti(o: unknown, prof = 0): unknown {
  if (o == null || typeof o !== "object") return typeof o === "string" ? `${o.slice(0, 24)}${o.length > 24 ? `…(${o.length})` : ""}` : o;
  if (prof > 4) return "…";
  if (Array.isArray(o)) return [`(${o.length})`, ...o.slice(0, 2).map((v) => esqueletoCenti(v, prof + 1))];
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) r[k] = /token|authorization/i.test(k) ? "***" : esqueletoCenti(v, prof + 1);
  return r;
}

/** Lê a resposta do "Processar" (ou de um download). */
export function analisarRespostaCenti(bytes: Uint8Array, status: number): AchadoCenti {
  if (status === 401 || status === 403) return { tipo: "nada", erro: "Sessão da Centi expirada — faça o login de novo na aba da Centi." };
  if (status >= 400) return { tipo: "nada", erro: `A Centi respondeu ${status}.` };
  if (ehPdf(bytes)) return { tipo: "pdf", bytes };
  const texto = new TextDecoder().decode(bytes);
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return { tipo: "nada", erro: "Resposta da Centi sem PDF.", amostra: texto.slice(0, 300) };
  }
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  if (o.Captcha) return { tipo: "nada", erro: "A Centi pediu CAPTCHA — emita este pela tela da Centi." };
  const achado = acharNoJson(json);
  if (achado) return achado;
  const msg = [o.Message, o.Mensagem, o.Msg, o.Error].find((m) => typeof m === "string" && m);
  return { tipo: "nada", erro: (msg as string) || "Resposta da Centi sem PDF.", amostra: JSON.stringify(esqueletoCenti(json)).slice(0, 1200) };
}

/** Onde buscar o arquivo temporário pela chave (caminhos relativos à API da Centi — a extensão só aceita a API). */
export function caminhosDoArquivo(a: { chave: string; nome: string; url: string | null }): string[] {
  const k = encodeURIComponent(a.chave);
  const n = encodeURIComponent(a.nome);
  return [a.url, `restauth/getbinlink/${k}/${n}`, `restauth/getbinlink/${k}`, `rest/getbinlink/${k}/${n}`, `restauth/getbin/${k}`, `restauth/getfile/${k}`].filter(
    (c): c is string => !!c,
  );
}

/** Um download que devolveu um LINK (texto ou JSON) em vez do arquivo. */
export function linkDaResposta(bytes: Uint8Array): string | null {
  const t = new TextDecoder().decode(bytes).trim().replace(/^"|"$/g, "");
  if (/^https?:|^\//.test(t)) return t;
  try {
    const j = JSON.parse(t) as unknown;
    if (typeof j === "string") return j;
    const o = j as { URL?: unknown; Url?: unknown; Link?: unknown };
    const l = o?.URL ?? o?.Url ?? o?.Link;
    return typeof l === "string" && l ? l : null;
  } catch {
    return null;
  }
}
