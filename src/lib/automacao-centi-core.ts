// Automação Centi (núcleo PURO, testado): monta o pedido do "Emitir DFD" da Centi (CM002 Planejamento → Operações →
// Emitir DFD → Processar) a partir dos Ids de planejamento. A extensão do Chrome (extensao-centi/) envia o pedido com a
// sessão da Centi já aberta no navegador; a aba Automação só lê e salva os PDFs — nada é gravado na Centi.

export type ConfigCenti = {
  /** "Emitir valor referência" do diálogo. */
  valorReferencia: boolean;
  /** "Emitir data" do diálogo. */
  emitirData: boolean;
  /** IdPlanejamentoAssinaturaDFD — o modelo de assinatura do DFD que a Centi envia (163 no "Processar" da tela de 01/10/2026
   * 22:48; 13 na captura anterior). */
  assinaturaDfd: string;
  /** Identificam a operação "Emitir DFD" na Centi (capturados no "Processar"). */
  moduleKey: number;
  guid: string;
  /** Descobrir sozinho a entidade (órgão) da Centi do DFD que não está na entidade aberta. */
  descobrirEntidade: boolean;
  /** As entidades a tentar ("02:03:04"); vazio = de 0 a 28 (as entidades da Centi) no formato da aberta. */
  entidades: string;
};

// A CENTI MUDOU a operação "Emitir DFD" (01/10/2026, noite): o "Processar" da própria tela passou a mandar ModuleKey
// 120465 + outro Guid + assinatura 163; o pedido antigo (120464) passou a voltar "Usuário sem permissão!".
export const CONFIG_CENTI_PADRAO: ConfigCenti = {
  valorReferencia: true,
  emitirData: false,
  assinaturaDfd: "163",
  moduleKey: 120465,
  guid: "24e3e9d0-cb29-2473-1d0a-318c7d8507ef",
  descobrirEntidade: true,
  entidades: "",
};

/** A versão da extensão publicada junto (extensao-centi/manifest.json) = a MÍNIMA que a tela aceita (a extensão é só o
 * canal; a lógica mora aqui e atualiza com o sistema — só uma mudança no canal pede reinstalar). */
export const VERSAO_EXTENSAO_CENTI = "1.9.1";

/** O aviso no sino de cada Administrador quando sai uma versão nova da extensão (UMA vez por versão — `chave`). */
export const avisoVersaoExtensao = (usuarioId: number) => ({
  usuarioId,
  tipo: "automacao" as const,
  titulo: `Nova versão da extensão da Automação (${VERSAO_EXTENSAO_CENTI})`,
  texto: "Baixe e instale a extensão nova na tela Automação (botão “Baixar extensão”).",
  link: "/painel/automacao",
  chave: `extensao-centi:${VERSAO_EXTENSAO_CENTI}`,
});

export const MAX_IDS_CENTI = 200;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A operação "Emitir DFD" que a extensão PEGOU da própria tela da Centi (o Processar). */
export type OperacaoCenti = { moduleKey: number; guid: string; assinatura: string; em?: string };

/** O ajuste da configuração pela operação da tela: só o que MUDOU (ModuleKey, Guid, modelo de assinatura); nada a mudar
 * ou operação inválida → null. A tela da Centi é a referência — quando ela muda a operação, o sistema acompanha. */
export function ajusteDaOperacao(cfg: ConfigCenti, op: unknown): Partial<ConfigCenti> | null {
  const o = (op && typeof op === "object" ? op : {}) as Partial<Record<keyof OperacaoCenti, unknown>>;
  const mk = Number(o.moduleKey);
  const guid = typeof o.guid === "string" ? o.guid.trim().toLowerCase() : "";
  const ass = typeof o.assinatura === "string" ? o.assinatura.replace(/\D/g, "") : "";
  if (!Number.isInteger(mk) || mk <= 0 || !GUID.test(guid)) return null;
  const p: Partial<ConfigCenti> = {};
  if (mk !== cfg.moduleKey) p.moduleKey = mk;
  if (guid !== cfg.guid) p.guid = guid;
  if (ass && ass !== cfg.assinaturaDfd) p.assinaturaDfd = ass;
  return Object.keys(p).length ? p : null;
}

/** A resposta da Centi recusou a OPERAÇÃO ("Usuário sem permissão!") — não é a entidade nem a sessão. */
export const operacaoRecusada = (texto: string | undefined) => /sem permiss/i.test(texto ?? "");

/** A operação "Emitir DFD" de ANTES da mudança da Centi (01/10/2026) — a guardada no aparelho é trocada pela nova. */
export const OPERACAO_ANTIGA = { moduleKey: 120464, guid: "2b414e51-4389-1c0a-f194-b11779b834f5", assinaturaDfd: "13" };

/** Normaliza a configuração guardada (qualquer JSON → válida). */
export function lerConfigCenti(v: unknown): ConfigCenti {
  const o = (v && typeof v === "object" ? v : {}) as Partial<Record<keyof ConfigCenti, unknown>>;
  const p = CONFIG_CENTI_PADRAO;
  // A operação ANTIGA guardada no aparelho (ModuleKey 120464 + o Guid dela, assinatura 13 — os padrões de antes da mudança
  // da Centi) vira a NOVA: senão a configuração salva seguia mandando o pedido que a Centi passou a recusar.
  const antiga = Number(o.moduleKey) === OPERACAO_ANTIGA.moduleKey && String(o.guid ?? "").toLowerCase() === OPERACAO_ANTIGA.guid;
  const assGuardada = typeof o.assinaturaDfd === "string" ? o.assinaturaDfd.replace(/\D/g, "") : "";
  const ass = antiga && assGuardada === OPERACAO_ANTIGA.assinaturaDfd ? "" : assGuardada;
  const mk = antiga ? Number.NaN : Number(o.moduleKey);
  return {
    valorReferencia: typeof o.valorReferencia === "boolean" ? o.valorReferencia : p.valorReferencia,
    emitirData: typeof o.emitirData === "boolean" ? o.emitirData : p.emitirData,
    assinaturaDfd: ass || p.assinaturaDfd,
    moduleKey: Number.isInteger(mk) && mk > 0 ? mk : p.moduleKey,
    guid: !antiga && typeof o.guid === "string" && GUID.test(o.guid.trim()) ? o.guid.trim().toLowerCase() : p.guid,
    descobrirEntidade: typeof o.descobrirEntidade === "boolean" ? o.descobrirEntidade : p.descobrirEntidade,
    entidades: typeof o.entidades === "string" ? o.entidades.slice(0, 300) : p.entidades,
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

/** Um DFD de protocolo do sistema: o nº de planejamento (= o Id na Centi), o ano do PCA e o ÓRGÃO (a entidade da Centi
 * em que ele existe — `orgao` = a chave do mapa órgão → entidade). */
export type DfdAutomacao = {
  numero: string;
  planejamento: string | null;
  anoPca: number | null;
  orgao: string | null;
  orgaoNome: string | null;
  /** A SIGLA da unidade do DFD (o "Por unidade"). */
  sigla: string | null;
};

/** Um protocolo do sistema com os DFDs dele (a seleção "Por protocolo"). */
export type ProtocoloAutomacao = {
  id: number;
  numero: string;
  idExterno: string | null;
  assunto: string | null;
  interessado: string | null;
  sigla: string | null;
  anoPca: number | null;
  pca: string | null;
  /** Data/hora da protocolação (criado_em). */
  criadoEm: string | null;
  /** A gestão do protocolo (a mesma da Mesa): a pessoa responsável e a situação cadastrada pelo ADM. */
  responsavelId: number | null;
  situacaoId: number | null;
  /** Σ itens e Σ valor dos DFDs do protocolo (os mesmos totais da Mesa). */
  itens: number;
  valor: number;
  dfds: DfdAutomacao[];
};

/** A chave do órgão do DFD (o órgão cadastrado; sem ele, o texto "Órgão/Entidade" do DFD). */
export function chaveOrgaoCenti(orgaoId: number | null, orgaoEntidade: string | null): string | null {
  if (orgaoId != null) return `o:${orgaoId}`;
  const t = (orgaoEntidade ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
  return t ? `t:${t}` : null;
}

/** As opções da SAÍDA: a pasta "PCA <ano>" por cima, os PDFs separados / um por protocolo / um por unidade / um único, e a ordem dos DFDs
 * pelo nº de planejamento. */
export type FormatoSaida = "separados" | "protocolo" | "unidade" | "unico";
export type OpcoesSaida = {
  pastaPca: boolean;
  formato: FormatoSaida;
  ordenarPlanejamento: boolean;
  /** Escolher a pasta de destino (desligado = Downloads; o botão "Escolher pasta" some). */
  escolherPasta: boolean;
  /** Conferir o CONTEÚDO de cada PDF (o nº de planejamento e o do DFD no texto) antes de salvar. */
  conferir: boolean;
  /** ONDE vão os PDFs: numa pasta (Downloads ou a escolhida), ANEXADOS a um protocolo da Centi indicado (`AlvoCenti`) ou
   * ao PRÓPRIO protocolo de cada DFD na Centi ("proprio": o Id da capa + o nº do protocolo do sistema). */
  destino: DestinoSaida;
  /** O código do TIPO do documento anexado na Centi (1039 = DFD — Documento Formalização Demanda). */
  tipoDocumento: string;
};
export type DestinoSaida = "pasta" | "protocolo" | "proprio";
export const TIPO_DOCUMENTO_DFD = "1039";
export const OPCOES_SAIDA_PADRAO: OpcoesSaida = {
  pastaPca: true,
  formato: "separados",
  ordenarPlanejamento: true,
  escolherPasta: false,
  conferir: true,
  destino: "pasta",
  tipoDocumento: TIPO_DOCUMENTO_DFD,
};

export function lerOpcoesSaida(v: unknown): OpcoesSaida {
  const o = (v && typeof v === "object" ? v : {}) as Partial<Record<keyof OpcoesSaida, unknown>>;
  const p = OPCOES_SAIDA_PADRAO;
  return {
    pastaPca: typeof o.pastaPca === "boolean" ? o.pastaPca : p.pastaPca,
    formato: o.formato === "separados" || o.formato === "protocolo" || o.formato === "unidade" || o.formato === "unico" ? o.formato : p.formato,
    ordenarPlanejamento: typeof o.ordenarPlanejamento === "boolean" ? o.ordenarPlanejamento : p.ordenarPlanejamento,
    escolherPasta: typeof o.escolherPasta === "boolean" ? o.escolherPasta : p.escolherPasta,
    conferir: typeof o.conferir === "boolean" ? o.conferir : p.conferir,
    destino: o.destino === "protocolo" || o.destino === "proprio" ? o.destino : "pasta",
    tipoDocumento: typeof o.tipoDocumento === "string" && /^\d{1,9}$/.test(o.tipoDocumento.trim()) ? o.tipoDocumento.trim() : p.tipoDocumento,
  };
}

/** O PROTOCOLO DA CENTI que recebe os PDFs (o ADM informa): o Id (o código interno — o "Id" do cadastro do protocolo na
 * Centi, o mesmo "Id:" da capa) e o número (+ o ano, opcional — "156844/2026"). A extensão abre pelo Id e só anexa se o
 * número (e o ano) baterem. */
export type AlvoCenti = { id: string; numero: string; ano: string | null };

/** O protocolo do sistema de onde veio cada DFD do arquivo (a chave do DFD no plano "Por protocolo" é "<protocolo>:<id>"). */
export function protocolosDoArquivo(a: ArquivoSaida): number[] {
  const ids = new Set<number>();
  for (const t of a.partes) {
    const m = /^(\d+):/.exec(t.chave);
    if (m) ids.add(Number(m[1]));
  }
  return [...ids];
}

/** Destino "proprio": o protocolo da CENTI de um arquivo = o do protocolo do sistema de onde vieram os DFDs (o "Id:" da capa
 * + o nº). Um arquivo que junta protocolos diferentes, ou de protocolo sem o Id da Centi, não tem destino — nunca chuta. */
export function alvoDoArquivo(
  a: ArquivoSaida,
  protos: readonly ProtocoloAutomacao[],
): { alvo: AlvoCenti; protocoloId: number } | { erro: string } {
  const ids = protocolosDoArquivo(a);
  if (ids.length !== 1)
    return { erro: ids.length ? "Este arquivo junta DFDs de protocolos diferentes — use PDFs separados ou um por protocolo." : "Sem o protocolo do sistema (use o modo Por protocolo)." };
  const p = protos.find((x) => x.id === ids[0]);
  if (!p) return { erro: "Protocolo não encontrado no sistema." };
  if (!p.idExterno?.replace(/\D/g, "")) return { erro: `O protocolo ${p.numero} não tem o Id da Centi (o “Id:” da capa).` };
  const lido = lerAlvoCenti(p.idExterno, p.numero);
  return "alvo" in lido ? { alvo: lido.alvo, protocoloId: p.id } : { erro: `Protocolo ${p.numero}: ${lido.erro}` };
}

/** Lê o que o ADM digitou → o alvo válido ou o motivo. */
export function lerAlvoCenti(id: string, numero: string): { alvo: AlvoCenti } | { erro: string } {
  const i = id.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!i || i === "0" || i.length > 12) return { erro: "Informe o Id do protocolo (o “Id” do cadastro do protocolo na Centi)." };
  const m = numero.trim().match(/^0*(\d{1,12})\s*(?:\/\s*(\d{4}))?$/);
  if (!m) return { erro: "Informe o nº do protocolo (ex.: 156844 ou 156844/2026)." };
  return { alvo: { id: i, numero: m[1], ano: m[2] ?? null } };
}

/** A DESCRIÇÃO do documento na Centi = o nome do PDF, sem o ".pdf". */
export const descricaoDoArquivo = (nome: string) => nome.replace(/\.pdf$/i, "").trim().slice(0, 250);

/** Base64 de bytes (em blocos — PDFs grandes sem estourar a pilha). */
export function paraBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Um DFD a baixar: o Id da Centi (= nº de planejamento), o nº do DFD (a conferência), o órgão (a entidade) e o grupo
 * da análise (a pasta do protocolo). */
export type TarefaCenti = { chave: string; id: string; dfd: string | null; orgao: string | null; orgaoNome: string | null; grupo: string };
/** Um arquivo da saída: as pastas, o nome e os DFDs que entram nele (1 = o PDF do DFD; vários = unidos na ordem). */
export type ArquivoSaida = { pastas: string[]; nome: string; partes: TarefaCenti[] };

export const MAX_NOME_PASTA = 120;
const PROIBIDOS = /[\\/:*?"<>|]+/g;

/** Nome seguro para arquivo/pasta em qualquer sistema (sem \ / : * ? " < > |, sem ponto/espaço no fim). */
export function nomeSeguro(texto: string, max = MAX_NOME_PASTA): string {
  const t = texto.replace(/\p{Cc}/gu, " ").replace(PROIBIDOS, "-").replace(/\s+/g, " ").trim();
  return t.slice(0, max).replace(/[\s.-]+$/, "").trim();
}

const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
const anoDoProtocolo = (p: ProtocoloAutomacao) => p.anoPca ?? p.dfds.find((d) => d.anoPca)?.anoPca ?? null;
const MAX_PROTOCOLOS_NOME = 8;

/** O FINAL de todo nome: os protocolos por ano — "(1222, 2212) - 2026" (vários anos: "(5) - 2025 + (7) - 2026"); acima de
 * 8 no mesmo ano, "(1, 2, … +N) - 2026". Sem protocolo, vazio. */
export function sufixoProtocolos(numeros: readonly string[]): string {
  const porAno = new Map<string, string[]>();
  for (const n of numeros) {
    const m = /^\s*([^/]+?)\s*(?:\/\s*(\d{4}))?\s*$/.exec(n);
    if (!m) continue;
    const lista = porAno.get(m[2] ?? "") ?? [];
    if (!lista.includes(m[1])) lista.push(m[1]);
    porAno.set(m[2] ?? "", lista);
  }
  return [...porAno.entries()]
    .map(([ano, ns]) => {
      const vis = ns.length > MAX_PROTOCOLOS_NOME ? [...ns.slice(0, MAX_PROTOCOLOS_NOME), `… +${ns.length - MAX_PROTOCOLOS_NOME}`] : ns;
      return `(${vis.join(", ")})${ano ? ` - ${ano}` : ""}`;
    })
    .join(" + ");
}

const juntar = (partes: (string | number | null | undefined | false)[], max = MAX_NOME_PASTA) => nomeSeguro(partes.filter(Boolean).join(" - "), max);

/** A pasta (ou o PDF unido) do protocolo: "SIGLA - PCA <ano> - (nº) - ano". */
export function nomePastaProtocolo(p: Pick<ProtocoloAutomacao, "numero" | "sigla" | "anoPca" | "dfds">): string {
  const ano = p.anoPca ?? p.dfds.find((d) => d.anoPca)?.anoPca ?? null;
  return juntar([p.sigla?.trim(), ano ? `PCA ${ano}` : null, sufixoProtocolos([p.numero])]) || "Protocolo";
}

/** O PDF de um DFD: "Planejamento P - DFD N - PCA <ano> - (nº do protocolo) - ano.pdf". */
export function nomeArquivoDfd(id: string, dfd?: { numero: string; anoPca: number | null } | null, protocolo?: string | null): string {
  return `${juntar([`Planejamento ${id}`, dfd && `DFD ${dfd.numero}`, dfd?.anoPca && `PCA ${dfd.anoPca}`, protocolo && sufixoProtocolos([protocolo])], 150)}.pdf`;
}

const pastaPca = (ano: number | null) => (ano ? `PCA ${ano}` : "PCA sem ano");

/** Um DFD do plano: a tarefa + o que dá nome aos arquivos (ano, protocolo, unidade). */
type Item = { t: TarefaCenti; dfd: DfdAutomacao | null; ano: number | null; protocolo: string | null; pastaProto: string | null };
/** O DFD que NÃO é baixado de novo: `duplicado` (o mesmo planejamento no mesmo protocolo) ou `repetido` (já vem de outro
 * protocolo escolhido) — `motivo` é o aviso da análise. */
export type DfdRepetido = { chave: string; id: string; dfd: string; grupo: string; tipo: "duplicado" | "repetido"; motivo: string };

/** Monta os ARQUIVOS da saída a partir dos DFDs (já sem repetidos), no formato escolhido. `protoPasta` = separados vão na
 * pasta do protocolo (Por protocolo) ou na raiz (Por Id). */
function montarArquivos(itens: Item[], op: OpcoesSaida, protoPasta: boolean): ArquivoSaida[] {
  const ordenar = (xs: Item[]) => (op.ordenarPlanejamento ? [...xs].sort((a, b) => Number(a.t.id) - Number(b.t.id)) : xs);
  const raiz = (ano: number | null) => (op.pastaPca ? [pastaPca(ano)] : []);
  const protos = (xs: Item[]) => sufixoProtocolos(xs.map((i) => i.protocolo).filter((x): x is string => !!x));
  const umAno = (xs: Item[]) => {
    const anos = [...new Set(xs.map((i) => i.ano))];
    return anos.length === 1 ? anos[0] : undefined;
  };
  const agrupar = (chave: (i: Item) => string) => {
    const m = new Map<string, Item[]>();
    for (const i of itens) m.set(chave(i), [...(m.get(chave(i)) ?? []), i]);
    return [...m.values()];
  };
  if (op.formato === "separados")
    return ordenar(itens).map((i) => ({
      pastas: [...raiz(i.ano), ...(protoPasta && i.pastaProto ? [i.pastaProto] : [])],
      nome: nomeArquivoDfd(i.t.id, i.dfd, i.protocolo),
      partes: [i.t],
    }));
  if (op.formato === "protocolo")
    return agrupar((i) => i.pastaProto ?? `#${i.t.chave}`).map((g) => ({
      pastas: raiz(g[0].ano),
      nome: `${g[0].pastaProto ?? juntar([`Planejamento ${g[0].t.id}`, protos(g)])}.pdf`,
      partes: ordenar(g).map((i) => i.t),
    }));
  if (op.formato === "unidade")
    return agrupar((i) => `${i.dfd?.sigla ?? ""}|${i.ano ?? ""}`).map((g) => ({
      pastas: raiz(g[0].ano),
      nome: `${juntar([g[0].dfd?.sigla ?? "Sem unidade", g[0].ano && `PCA ${g[0].ano}`, protos(g)]) || "DFDs"}.pdf`,
      partes: ordenar(g).map((i) => i.t),
    }));
  if (!itens.length) return [];
  const ano = umAno(itens);
  return [{ pastas: op.pastaPca && ano !== undefined ? [pastaPca(ano)] : [], nome: `${juntar(["DFDs", ano && `PCA ${ano}`, protos(itens)]) || "DFDs"}.pdf`, partes: ordenar(itens).map((i) => i.t) }];
}

/** O PLANO da saída a partir dos protocolos escolhidos: DFD sem planejamento é pulado (`semPlanejamento` — a Centi não o
 * acha) e cada planejamento é baixado UMA vez só — o repetido no mesmo protocolo (duplicado) ou já vindo de outro
 * protocolo vai para `repetidos` com o aviso; pasta de protocolo repetida ganha "(id)". */
export function planoDosProtocolos(
  protos: ProtocoloAutomacao[],
  op: OpcoesSaida,
): { arquivos: ArquivoSaida[]; semPlanejamento: { protocolo: string; dfd: string; grupo: string }[]; repetidos: DfdRepetido[]; total: number } {
  const semPlanejamento: { protocolo: string; dfd: string; grupo: string }[] = [];
  const repetidos: DfdRepetido[] = [];
  const usados = new Set<string>();
  const baixado = new Map<string, { protocolo: string; dfd: string }>();
  const itens: Item[] = [];
  for (const p of protos) {
    let nome = nomePastaProtocolo(p);
    if (usados.has(nome)) nome = nomeSeguro(`${nome} (${p.id})`);
    usados.add(nome);
    const ano = anoDoProtocolo(p);
    for (const d of p.dfds) {
      const id = soDigitos(d.planejamento);
      if (!id || id === "0") {
        semPlanejamento.push({ protocolo: p.numero, dfd: d.numero, grupo: nome });
        continue;
      }
      const ja = baixado.get(id);
      if (ja) {
        const mesmo = ja.protocolo === p.numero;
        repetidos.push({
          chave: `rep:${p.id}:${d.numero}`,
          id,
          dfd: d.numero,
          grupo: nome,
          tipo: mesmo ? "duplicado" : "repetido",
          motivo: mesmo ? `DFD duplicado — o planejamento ${id} também está no DFD ${ja.dfd}.` : `Já baixado no protocolo ${ja.protocolo} (DFD ${ja.dfd}).`,
        });
        continue;
      }
      baixado.set(id, { protocolo: p.numero, dfd: d.numero });
      itens.push({
        t: { chave: `${p.id}:${id}`, id, dfd: d.numero, orgao: d.orgao, orgaoNome: d.orgaoNome, grupo: nome },
        dfd: { ...d, anoPca: d.anoPca ?? ano },
        ano: d.anoPca ?? ano,
        protocolo: p.numero,
        pastaProto: nome,
      });
    }
  }
  return { arquivos: montarArquivos(itens, op, true), semPlanejamento, repetidos, total: itens.length };
}

/** O PLANO dos Ids digitados: o DFD (e o protocolo) de cada um é procurado nos protocolos do sistema — nome, ano, unidade
 * e órgão. */
export function planoDosIds(ids: string[], protos: ProtocoloAutomacao[], op: OpcoesSaida): ArquivoSaida[] {
  const indice = new Map<string, { dfd: DfdAutomacao; protocolo: string; pasta: string }>();
  for (const p of protos)
    for (const d of p.dfds) {
      const id = soDigitos(d.planejamento);
      if (id && !indice.has(id)) indice.set(id, { dfd: { ...d, anoPca: d.anoPca ?? anoDoProtocolo(p) }, protocolo: p.numero, pasta: nomePastaProtocolo(p) });
    }
  const itens: Item[] = ids.map((id) => {
    const x = indice.get(id);
    return {
      t: { chave: id, id, dfd: x?.dfd.numero ?? null, orgao: x?.dfd.orgao ?? null, orgaoNome: x?.dfd.orgaoNome ?? null, grupo: "" },
      dfd: x?.dfd ?? null,
      ano: x?.dfd.anoPca ?? null,
      protocolo: x?.protocolo ?? null,
      pastaProto: x?.pasta ?? null,
    };
  });
  return montarArquivos(itens, op, false);
}

/** CONFERE o PDF baixado: o texto das primeiras páginas tem o nº de planejamento pedido (e o do DFD, quando conhecido)
 * como NÚMERO INTEIRO (1525 não casa 15250). Sem texto = não dá para conferir (falha: nunca salva às cegas). */
export function conferirConteudoDfd(texto: string, alvo: { id: string; dfd: string | null }): string | null {
  // Sem o ponto de milhar ("1.525" = 1525).
  const t = texto.replace(/\s+/g, " ").replace(/(\d)\.(?=\d{3}(?!\d))/g, "$1");
  if (!/\d/.test(t)) return "PDF sem texto — não deu para conferir o conteúdo.";
  const tem = (n: string) => new RegExp(`(^|[^\\d])0*${(n.match(/\d+/)?.[0] ?? "").replace(/^0+(?=\d)/, "")}(?![\\d])`).test(t);
  if (!tem(alvo.id)) return `O PDF não traz o planejamento ${alvo.id} — não foi salvo.`;
  if (alvo.dfd && /\d/.test(alvo.dfd) && !tem(alvo.dfd)) return `O PDF não traz o DFD ${alvo.dfd} — não foi salvo.`;
  return null;
}

/** As entidades da Centi a TENTAR quando o DFD não está na entidade aberta: as digitadas ("02:03:04") ou, sem elas e com
 * a entidade aberta numérica, de 0 a 28 (as entidades da Centi de Rio Verde) no mesmo formato (com o zero à esquerda, se a aberta tem). */
/** A maior entidade da Centi (0 a 28). */
export const ENTIDADE_MAX = 28;

export function candidatosEntidade(texto: string, atual: string | null): string[] {
  const digitadas = texto
    .split(/[\s:;,]+/)
    .map((x) => x.trim())
    .filter((x) => /^[\w.-]{1,40}$/.test(x));
  if (digitadas.length) return [...new Set(digitadas)];
  if (!atual || !/^\d{1,4}$/.test(atual)) return [];
  return Array.from({ length: ENTIDADE_MAX + 1 }, (_, i) => String(i).padStart(atual.length, "0"));
}

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
