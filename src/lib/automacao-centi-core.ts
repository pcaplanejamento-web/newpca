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

/** A versão da extensão publicada junto (extensao-centi/manifest.json) — a tela avisa quando a instalada é outra. */
export const VERSAO_EXTENSAO_CENTI = "1.0.2";

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
