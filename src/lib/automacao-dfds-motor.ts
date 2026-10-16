/**
 * O MOTOR do "Baixar/anexar DFDs" (navegador): emitir cada DFD na Centi (load do planejamento + Emitir DFD, na entidade do
 * órgão, com a descoberta da entidade e a CONFERÊNCIA do conteúdo) e levar o PDF ao destino — uma pasta (escolhida,
 * Downloads ou um .zip com as pastas), o protocolo da Centi indicado ou o protocolo de cada DFD (anexo pela plataforma:
 * autorização de uso único + a confirmação da extensão; o já anexado não é emitido de novo). É a lógica que era da tela
 * da Automação, agora usada pelo componente de fluxo "Baixar/anexar DFDs" (`saida.dfdsCenti`).
 */
import {
  type AlvoCenti,
  type ArquivoSaida,
  alvoDoArquivo,
  analisarRespostaCenti,
  type ConfigCenti,
  caminhoLoadPlanejamento,
  candidatosEntidade,
  conferirConteudoDfd,
  descricaoDoArquivo,
  formatoEntidade,
  nomeSeguro,
  type OpcoesSaida,
  operacaoRecusada,
  type ProtocoloAutomacao,
  paraBase64,
  pedidoEmitirDfd,
  lerAlvoCenti,
  lerOpcoesSaida,
  planoDosIds,
  planoDosProtocolos,
  type TarefaCenti,
} from "./automacao-centi-core.ts";
import { baixarNoNavegador, baixarPelaExtensao, comoBlob, deBase64, novaUniao, pdfDoAchado, type PedirExtensao } from "./arquivo-navegador.ts";
import {
  autorizarEscrita,
  cancelarExecucao,
  concluirPasso,
  concluirPassos,
  iniciarExecucao,
  iniciarExecucaoLeitura,
  jaAnexados,
  type PassoAnexo,
  registrarAnexo,
  sinalPasso,
  cancelarAoSair,
} from "./automacao-cliente.ts";
import { descricaoCanonica } from "./automacao-core.ts";
import { andamentoDfds, contagemDfds, type DocCenti, docsPorDescricao, type EstadoDfd, entidadePrevista, type LinhaDfd } from "./automacao-dfds-estado.ts";
import { ZipArmazenar } from "./zip-armazenar.ts";

export { andamentoDfds, contagemDfds, type EstadoDfd, type LinhaDfd };
/** A fase em curso de UM DFD (a linha mostra o passo real). */
type Fase = (e: Extract<EstadoDfd, "emitindo" | "conferindo" | "aguardando" | "anexando">) => void;
export type Emissao = { pdf?: Uint8Array; erro?: string; amostra?: string; ambiente?: boolean; entidade?: string; recusada?: boolean };
/** A resposta da extensão (o que o motor lê). */
export type RespostaExt = {
  ok?: boolean;
  erro?: string;
  b64?: string;
  status?: number;
  interrompido?: boolean;
  operacao?: unknown;
  protocolo?: { id?: string; numero: string; ano: string; assunto: string; interessado?: string; descricao: string; documentos: number; docs?: DocCenti[] };
  jaAnexado?: boolean;
  sequencial?: string;
  documento?: string;
  confirmar?: string;
};
type Pedir = (acao: string, dados: unknown, ms: number) => Promise<RespostaExt>;

export type ArquivoPasta = { getFile: () => Promise<Blob>; createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }> };
export type PastaDestino = {
  getFileHandle: (n: string, o: { create: boolean }) => Promise<ArquivoPasta>;
  getDirectoryHandle: (n: string, o: { create: boolean }) => Promise<PastaDestino>;
  name: string;
};

/** Grava na pasta escolhida, criando as subpastas na 1ª vez, e CONFERE o tamanho gravado. */
async function gravarNaPasta(pasta: PastaDestino, pastas: string[], nome: string, blob: Blob) {
  let destino = pasta;
  for (const p of pastas) destino = await destino.getDirectoryHandle(p, { create: true });
  const arq = await destino.getFileHandle(nome, { create: true });
  const w = await arq.createWritable();
  await w.write(blob);
  await w.close();
  if ((await arq.getFile()).size !== blob.size) throw new Error("tamanho");
}

/** O texto das 2 primeiras páginas (pdf.js, carregado só aqui) — a conferência do conteúdo. */
async function textoDoPdf(bytes: Uint8Array): Promise<string> {
  const { abrirPdf } = await import("./parse-dfd-pdf");
  const doc = await abrirPdf(new File([bytes as Uint8Array<ArrayBuffer>], "dfd.pdf", { type: "application/pdf" }));
  try {
    const partes: string[] = [];
    for (let p = 1; p <= Math.min(2, doc.numPages); p++) partes.push((await doc.pageItems(p)).map((i) => i.str).join(" "));
    return partes.join(" ");
  } finally {
    await doc.destroy();
  }
}

/** O PDF regravado pelo pdf-lib (a estrutura do PDF unido, que a Centi aceita no anexo). */
async function regravarPdf(b: Uint8Array): Promise<Uint8Array> {
  const u = await novaUniao();
  await u.adicionar(b);
  return u.salvar();
}

const hojeBR = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
};

/** O contexto do emissor: a configuração e o mapa órgão → entidade VIVOS (podem mudar no meio de um lote). */
export type ContextoEmissor = {
  pedir: Pedir;
  cfg: () => ConfigCenti;
  /** Aplica a operação nova que a extensão pegou da Centi (true = mudou). */
  aplicarOperacao: (op: unknown) => boolean;
  mapa: () => Record<string, string>;
  /** O ID da entidade CADASTRADO no órgão (Órgãos e Unidades) — vale direto. */
  cadastradas: () => Record<string, string>;
  definirEntidade: (orgao: string, entidade: string) => void;
};

/** O LOAD do planejamento (CM002) na Centi, por API — o que a tela faz antes de emitir; devolve o JSON (a situação). */
export async function carregarPlanejamento(c: Pick<ContextoEmissor, "pedir">, id: string, entidade?: string): Promise<{ j: unknown } | { erro: string; ambiente?: boolean }> {
  const l = (await c.pedir("ler", { metodo: "GET", caminho: caminhoLoadPlanejamento(id), entidade }, 60_000)) as RespostaExt & { j?: unknown };
  if (l.interrompido) return { erro: "Interrompido na extensão.", ambiente: true };
  if (!l.ok) return { erro: `Não consegui abrir o planejamento ${id} na Centi: ${l.erro ?? "sem resposta"}.`, ambiente: /encerrado|sessão|não respondeu/i.test(l.erro ?? "") };
  return { j: l.j };
}

/** Emite UM DFD (load + Emitir DFD; a operação recusada é reaprendida UMA vez) e baixa o PDF. */
export async function emitirUm(c: ContextoEmissor, id: string, entidade?: string, deNovo = false, carregado = false): Promise<Emissao> {
  // Como a tela da Centi: carrega o planejamento ANTES do Emitir DFD (sem o load, "Usuário sem permissão!").
  if (!carregado) {
    const l = await carregarPlanejamento(c, id, entidade);
    if ("erro" in l) return l;
  }
  const r = await c.pedir("pedir", { metodo: "POST", caminho: "restauth/operation", corpo: pedidoEmitirDfd(id, c.cfg(), new Date()), entidade }, 150_000);
  if (!r.ok || r.b64 == null) return { erro: r.erro ?? "Falha na extensão.", ambiente: true };
  const a = analisarRespostaCenti(deBase64(r.b64), r.status ?? 0);
  if (a.tipo === "nada" && operacaoRecusada(a.amostra ?? a.erro)) {
    if (!deNovo) {
      const e = await c.pedir("estado", null, 8000);
      if (e.ok && c.aplicarOperacao(e.operacao)) return emitirUm(c, id, entidade, true, true);
    }
    return {
      erro: "A Centi recusou a operação Emitir DFD (“Usuário sem permissão!”) — ela deve ter mudado a operação. Emita UM DFD pela própria Centi com a extensão instalada: ela pega a operação nova sozinha. Depois, execute de novo.",
      amostra: a.amostra,
      recusada: true,
    };
  }
  const r2 = await pdfDoAchado(a, baixarPelaExtensao(c.pedir as unknown as PedirExtensao, entidade));
  if ("pdf" in r2) return { pdf: r2.pdf };
  return { erro: r2.erro, amostra: r2.amostra, ambiente: a.tipo === "nada" && /sessão/i.test(a.erro) };
}

/** Emite e CONFERE: o PDF tem de trazer o planejamento (e o DFD) pedidos — um PDF de outro DFD nunca é salvo. */
async function emitirConferido(c: ContextoEmissor, t: TarefaCenti, conferir: boolean, entidade?: string, fase?: Fase): Promise<Emissao> {
  fase?.("emitindo");
  const r = await emitirUm(c, t.id, entidade);
  if (!r.pdf || !conferir) return r;
  fase?.("conferindo");
  const erro = conferirConteudoDfd(await textoDoPdf(r.pdf).catch(() => ""), t);
  return erro ? { erro } : r;
}

/** A ENTIDADE do DFD: a cadastrada no órgão; senão a do mapa; senão a aberta — e, com "descobrir", tenta as outras e
 * lembra a que deu certo para o órgão. */
async function emitirNaEntidade(c: ContextoEmissor, t: TarefaCenti, conferir: boolean, semSaida: Set<string>, atual: string | null, fase?: Fase): Promise<Emissao> {
  const fixa = t.orgao ? c.cadastradas()[t.orgao] : undefined;
  if (fixa) {
    const e = formatoEntidade(fixa, atual);
    return { ...(await emitirConferido(c, t, conferir, e, fase)), entidade: e };
  }
  const mapeada = t.orgao ? c.mapa()[t.orgao] : undefined;
  const r = await emitirConferido(c, t, conferir, mapeada, fase);
  if (r.pdf) {
    if (t.orgao && !mapeada && atual) c.definirEntidade(t.orgao, atual);
    return { ...r, entidade: mapeada ?? atual ?? undefined };
  }
  const cfg = c.cfg();
  if (r.ambiente || r.recusada || !cfg.descobrirEntidade || (t.orgao && semSaida.has(t.orgao))) return r;
  const ja = mapeada ?? atual;
  const tentar = [...new Set([...Object.values(c.mapa()), ...candidatosEntidade(cfg.entidades, atual)])].filter((e) => e !== ja);
  for (const e of tentar) {
    const x = await emitirConferido(c, t, conferir, e, fase);
    if (x.ambiente || x.recusada) return x;
    if (x.pdf) {
      if (t.orgao) c.definirEntidade(t.orgao, e);
      return { ...x, entidade: e };
    }
  }
  if (t.orgao) semSaida.add(t.orgao);
  return tentar.length ? { ...r, erro: `${r.erro ?? "Falha"} (não achei em nenhuma das ${tentar.length + 1} entidades tentadas)` } : r;
}

/** As opções do componente "Baixar/anexar DFDs" (a config do nó) → as da saída + o protocolo indicado. */
export function opcoesDoNo(c: Record<string, unknown>): { saida: OpcoesSaida; alvo: AlvoCenti | null; erroAlvo?: string } {
  const saida = lerOpcoesSaida({ ...c, tipoDocumento: typeof c.tipoDocumento === "string" ? c.tipoDocumento : undefined });
  if (saida.destino !== "protocolo") return { saida, alvo: null };
  const a = lerAlvoCenti(String(c.alvoId ?? ""), String(c.alvoNumero ?? ""), true);
  return "alvo" in a ? { saida, alvo: a.alvo } : { saida, alvo: null, erroAlvo: a.erro };
}

/** O PLANO a partir dos itens do fluxo: protocolos do sistema (com os DFDs) ou nºs de planejamento (`id`). */
export function planoDosItens(itens: Record<string, unknown>[], saida: OpcoesSaida, protocolos: ProtocoloAutomacao[]): { arquivos: ArquivoSaida[]; previa: LinhaDfd[] } {
  const protos = itens.filter((it) => Array.isArray(it.dfds)) as unknown as ProtocoloAutomacao[];
  if (protos.length) {
    const p = planoDosProtocolos(protos, saida);
    return { arquivos: p.arquivos, previa: previaDfds(p.arquivos, p) };
  }
  const ids = [...new Set(itens.map((it) => String(it.planejamento ?? it.id ?? "").replace(/\D/g, "")).filter(Boolean))];
  const arquivos = planoDosIds(ids, protocolos, saida);
  return { arquivos, previa: previaDfds(arquivos) };
}

/** A prévia da análise: cada DFD do plano (na ordem), os pulados por não terem planejamento e os repetidos. */
export function previaDfds(
  arquivos: ArquivoSaida[],
  extras?: { semPlanejamento: { protocolo: string; dfd: string; grupo: string }[]; repetidos: { chave: string; id: string; dfd: string | null; grupo: string; motivo: string }[] },
): LinhaDfd[] {
  const vistos = new Set<string>();
  const fila: LinhaDfd[] = [];
  for (const a of arquivos)
    for (const t of a.partes)
      if (!vistos.has(t.chave)) {
        vistos.add(t.chave);
        fila.push({ ...t, estado: "fila" });
      }
  for (const x of extras?.semPlanejamento ?? []) fila.push({ chave: `sem:${x.protocolo}:${x.dfd}`, id: "", dfd: x.dfd, orgao: null, orgaoNome: null, grupo: x.grupo, estado: "pulado" });
  for (const x of extras?.repetidos ?? []) fila.push({ chave: x.chave, id: x.id, dfd: x.dfd, orgao: null, orgaoNome: null, grupo: x.grupo, estado: "repetido", erro: x.motivo });
  return fila;
}

/** O ANEXO pela PLATAFORMA: autorização de uso único do sistema; a pergunta do confirmsave da Centi vai ao ADM (só o
 * "sim" grava, com uma autorização nova); gravado = registro + passo feito. `fase` = o passo real (anexando / aguardando
 * a confirmação). `registro` = o registro no sistema falhou depois do anexo gravado (o anexo vale — não reenviar). */
export async function anexarPelaPlataforma(
  d: { pedir: Pedir; confirmar: (texto: string) => Promise<boolean> },
  execucaoId: number,
  passo: PassoAnexo,
  protocoloId: number | null,
  dados: Record<string, unknown>,
  fase?: Fase,
): Promise<RespostaExt & { registro?: string }> {
  const uma = async (extra: Record<string, unknown>): Promise<RespostaExt> => {
    fase?.("anexando");
    const a = await autorizarEscrita(execucaoId, passo);
    if ("erro" in a) return { ok: false, erro: a.erro };
    if ("jaFeito" in a) return { ok: true, jaAnexado: true, documento: a.centiDocumento ?? undefined };
    return d.pedir("anexar", { ...dados, ...extra, autorizacao: { token: a.token } }, 320_000);
  };
  let r = await uma({});
  if (!r.ok && r.confirmar) {
    fase?.("aguardando");
    r = (await d.confirmar(r.confirmar)) ? await uma({ aceitar: true }) : { ok: false, erro: `Não anexado — confirmação recusada: ${r.confirmar}` };
  }
  if (r.ok) {
    const falhou = await registrarAnexo(execucaoId, passo, r.documento ?? null, protocoloId, notaDoAnexo(r));
    return falhou ? { ...r, registro: falhou } : r;
  }
  await concluirPasso(execucaoId, passo.chave, "falhou", r.erro ?? "A Centi não gravou.");
  return r;
}

/** O texto do anexo gravado — o MESMO na linha e no histórico do servidor. */
export const notaDoAnexo = (r: Pick<RespostaExt, "jaAnexado" | "sequencial">) =>
  r.jaAnexado ? `Já estava no protocolo${r.sequencial ? ` (documento ${r.sequencial})` : ""} — não anexado de novo.` : `Documento ${r.sequencial ?? "?"} do protocolo.`;

/** TESTE do anexo SEM emitir DFD: um PDF de 1 página ("TESTE - pode excluir - hora") no protocolo indicado — separa o
 * salvar da emissão. */
export async function testarAnexo(d: { pedir: Pedir; confirmar: (texto: string) => Promise<boolean> }, indicado: AlvoCenti, tipo: string): Promise<{ ok: string } | { erro: string }> {
  let alvo = indicado;
  try {
    if (!alvo.numero) {
      // Só pelo Id: o nº e o ano vêm da Centi antes do anexo (que confere Id + nº).
      const r = await d.pedir("protocolo", alvo, 60_000);
      if (!(r.ok && r.protocolo)) return { erro: r.erro ?? "Não consegui abrir o protocolo na Centi." };
      alvo = { ...alvo, numero: r.protocolo.numero, ano: r.protocolo.ano || null };
    }
    const { PDFDocument, StandardFonts } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    const pg = doc.addPage([595, 842]);
    pg.drawText("Teste de anexo - Plataforma PCA. Pode excluir.", { x: 60, y: 760, size: 14, font: await doc.embedFont(StandardFonts.Helvetica) });
    const bytes = await doc.save();
    const descricao = `TESTE - pode excluir - ${new Date().toLocaleTimeString("pt-BR").replace(/:/g, "h").slice(0, 5)}`;
    const passo: PassoAnexo = { chave: "teste", alvo: { ...alvo, descricao } };
    const ex = await iniciarExecucao("anexar-dfds", [passo], { teste: true, protocolo: alvo.numero, id: alvo.id });
    if ("erro" in ex) return { erro: ex.erro };
    const r = await anexarPelaPlataforma(d, ex.id, passo, null, { ...alvo, tipo, descricao, arquivo: `${descricao}.pdf`, pdf: paraBase64(bytes) });
    return r.ok ? { ok: `Anexado (documento ${r.sequencial ?? "?"}). O anexo na Centi funciona.` } : { erro: r.erro ?? "A Centi não gravou." };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha no teste." };
  }
}

export type DepsExecucao = ContextoEmissor & {
  /** O lote em curso na extensão (o andamento vai ao ícone/cartão; a interrupção vem de lá). */
  lote: { current: string | null };
  interrompido: () => boolean;
  /** A entidade aberta na Centi agora. */
  atual: string | null;
  /** A pergunta do confirmsave da Centi: o ADM confirma (true) ou não. */
  confirmar: (texto: string) => Promise<boolean>;
  /** A pasta escolhida (destino "pasta" com "escolher a pasta"); null = Downloads / .zip. */
  pasta: PastaDestino | null;
  /** Os protocolos do sistema (o destino "Protocolo de cada DFD"). */
  protocolos: ProtocoloAutomacao[];
  /** Cada mudança de uma linha (a análise ao vivo). */
  marcar: (chave: string, l: Partial<LinhaDfd>) => void;
  /** Várias linhas de uma vez (ex.: as da fila quando o lote para). */
  marcarVarias: (f: (l: LinhaDfd) => Partial<LinhaDfd> | null) => void;
};

/** De quanto em quanto a execução dá SINAL DE VIDA ao servidor (o passo em curso) — a reconciliação só encerra a que
 * ficou parada muito além disso (a página fechou). */
export const SINAL_EXECUCAO_MS = 4 * 60_000;

/** `confirmados` = a conferência FINAL na Centi (arquivos achados no protocolo / arquivos anexados) — null sem conferir. */
export type FimExecucao = { ok: number; ja: number; falhas: number; interrompido: boolean; parou: boolean; erro?: string; confirmados?: { ok: number; total: number } | null };

/** Falha PASSAGEIRA (rede, tempo, servidor) — vale UMA nova tentativa; a extensão confere o protocolo antes de gravar, então
 * repetir nunca duplica. */
export const falhaPassageira = (erro: string | undefined) => !!erro && /tempo|timeout|time out|rede|network|sem resposta|failed to fetch|desconect|\b5\d\d\b|indispon/i.test(erro);

/**
 * Executa o plano (os arquivos): emite cada DFD, une quando o arquivo junta vários, e leva ao destino. Cada execução é
 * REGISTRADA no sistema (baixar = "Emitir DFDs"; anexar = "Anexar DFDs", sem a qual nada é gravado). Cada linha mostra o
 * passo REAL (emitindo · conferindo · no PDF unido · anexando · aguardando a confirmação) e o fim real (anexado/salvo ·
 * já estava · falhou · interrompido). A execução no servidor é SEMPRE finalizada — também numa exceção — e dá sinal de
 * vida enquanto roda; fechar a página a cancela.
 */
export async function executarDfds(plano: ArquivoSaida[], saida: OpcoesSaida, alvo: AlvoCenti | null, d: DepsExecucao): Promise<FimExecucao> {
  const anexando = saida.destino !== "pasta";
  const proprio = saida.destino === "proprio";
  const tipo = saida.tipoDocumento;
  /** O FIM de cada DFD (a conta do ícone e do servidor). */
  const resultados = new Map<string, { estado: "ok" | "ja" | "falhou"; texto: string }>();
  const finais = new Set<EstadoDfd>(["ok", "ja", "falha", "interrompido"]);
  const anotar = (chave: string, l: Partial<LinhaDfd>) => {
    if (l.estado && finais.has(l.estado))
      resultados.set(chave, {
        estado: l.estado === "ok" ? "ok" : l.estado === "ja" ? "ja" : "falhou",
        texto: l.erro ?? (l.estado === "ok" ? "Salvo." : l.estado === "ja" ? "Já estava." : l.estado === "interrompido" ? "Interrompido." : "Falhou."),
      });
  };
  const marcar = (chave: string, l: Partial<LinhaDfd>) => {
    anotar(chave, l);
    d.marcar(chave, l);
  };
  const marcarVarias = (f: (l: LinhaDfd) => Partial<LinhaDfd> | null) =>
    d.marcarVarias((x) => {
      const m = f(x);
      if (m) anotar(x.chave, m);
      return m;
    });
  const marcarArquivo = (a: ArquivoSaida, l: Partial<LinhaDfd>) => {
    for (const t of a.partes) marcar(t.chave, l);
  };
  // Os DFDs válidos do plano (a conta do ícone da extensão).
  const unicos = new Map<string, TarefaCenti>();
  for (const a of plano) for (const t of a.partes) if (!unicos.has(t.chave)) unicos.set(t.chave, t);
  const totalDfds = unicos.size;
  const andamento = (texto: string) => {
    if (d.lote.current) void d.pedir("lote", { fase: "passo", loteId: d.lote.current, texto, feito: resultados.size, total: totalDfds }, 8000);
  };
  // A ENTIDADE PREVISTA de cada DFD já à vista (a emissão confirma a real).
  const cad = d.cadastradas();
  const mapa = d.mapa();
  d.marcarVarias((x) => {
    if (!unicos.has(x.chave) || x.entidade) return null;
    const e = entidadePrevista(x.orgao, cad, mapa, d.atual, formatoEntidade);
    return e ? { entidade: e, entidadePrevista: true } : null;
  });

  const destinos = new Map<ArquivoSaida, { passo: PassoAnexo; protocoloId: number | null }>();
  let fila = plano;
  let execucaoId: number | null = null;
  let erroGeral: string | undefined;
  const fim = (interrompido: boolean, parou: boolean, erro?: string): FimExecucao => {
    const v = [...resultados.values()];
    return { ok: v.filter((x) => x.estado === "ok").length, ja: v.filter((x) => x.estado === "ja").length, falhas: v.filter((x) => x.estado === "falhou").length, interrompido, parou, erro, confirmados };
  };
  let confirmados: FimExecucao["confirmados"] = null;
  let porIdFinal = new Map<string, AlvoCenti>();
  let naCentiSuportado = false;
  if (anexando) {
    // Cada arquivo tem o SEU protocolo da Centi (o indicado, ou o de onde vieram os DFDs). Antes de emitir: cada protocolo
    // é conferido na Centi (Id + nº) e o já anexado não é emitido de novo (pré-verificação).
    andamento("Conferindo o protocolo na Centi");
    const alvos = new Map<ArquivoSaida, { alvo: AlvoCenti; protocoloId: number | null }>();
    for (const a of plano) {
      const x = proprio ? alvoDoArquivo(a, d.protocolos) : alvo ? { alvo, protocoloId: null } : { erro: "Informe o protocolo da Centi." };
      if ("erro" in x) marcarArquivo(a, { estado: "falha", erro: x.erro });
      else alvos.set(a, x);
    }
    const porId = new Map<string, AlvoCenti>();
    for (const x of alvos.values()) porId.set(x.alvo.id, x.alvo);
    const recusados = new Map<string, string>();
    // Os documentos de cada protocolo NA CENTI (a verdade do "já anexado" — o registro do sistema só vale sem eles).
    const naCenti = new Map<string, Map<string, DocCenti>>();
    porIdFinal = porId;
    for (const [id, al] of porId) {
      if (d.interrompido()) break;
      const r = await d.pedir("protocolo", al, 60_000);
      if (r.ok && r.protocolo && Array.isArray(r.protocolo.docs)) {
        naCenti.set(id, docsPorDescricao(r.protocolo.docs));
        naCentiSuportado = true;
      }
      if (!(r.ok && r.protocolo)) recusados.set(id, r.erro ?? "Não consegui abrir o protocolo na Centi.");
      // Só pelo Id: o nº e o ano vêm da Centi (o anexo segue conferindo Id + nº). O objeto é o mesmo dos arquivos.
      else if (!al.numero) Object.assign(al, { numero: r.protocolo.numero, ano: r.protocolo.ano || null });
    }
    if (d.interrompido()) {
      marcarVarias((x) => (x.estado === "fila" ? { estado: "interrompido", erro: "Interrompido na extensão." } : null));
      return fim(true, false);
    }
    const erroProtocolos = recusados.size && recusados.size === porId.size ? [...new Set(recusados.values())].join(" ") : undefined;
    const ja = await jaAnexados([...porId.keys()]);
    let i = 0;
    for (const [a, x] of alvos) {
      const motivo = recusados.get(x.alvo.id);
      if (motivo) {
        // Nada mais segue: o motivo vai UMA vez (o erro do componente) e a linha fica com a nota curta; senão, o motivo.
        marcarArquivo(a, { estado: "falha", erro: recusados.size === porId.size ? `Não emitido — o protocolo ${x.alvo.numero || x.alvo.id} não abriu na Centi.` : motivo });
        continue;
      }
      const descricao = descricaoDoArquivo(a.nome);
      const feito = ja?.get(`${x.alvo.id}|${descricaoCanonica(descricao)}`);
      const docs = naCenti.get(x.alvo.id);
      if (docs) {
        // A CENTI decide: está lá = não emite de novo; não está = envia (mesmo que o sistema o tenha registrado antes).
        const doc = docs.get(descricaoCanonica(descricao));
        if (doc) {
          marcarArquivo(a, { estado: "ja", erro: `Já está no protocolo da Centi (documento ${doc.sequencial || doc.id || "?"}) — não emitido de novo.` });
          continue;
        }
      } else if (feito) {
        marcarArquivo(a, { estado: "ja", erro: `Registrado no sistema como anexado${feito.documento ? ` (documento ${feito.documento})` : ""}${feito.quem ? ` por ${feito.quem}` : ""} — não emitido de novo (confira no protocolo).` });
        continue;
      }
      const ausenteNaCenti = !!(docs && feito);
      destinos.set(a, { passo: { chave: `arquivo-${++i}`, alvo: { ...x.alvo, descricao }, ...(ausenteNaCenti ? { ausenteNaCenti } : {}) }, protocoloId: x.protocoloId });
    }
    fila = plano.filter((a) => destinos.has(a));
    if (!fila.length) return fim(false, !!erroProtocolos, erroProtocolos);
    const ex = await iniciarExecucao("anexar-dfds", [...destinos.values()].map((x) => x.passo), { destino: saida.destino, protocolos: porId.size, arquivos: fila.length, tipo });
    if ("erro" in ex) {
      for (const a of fila) marcarArquivo(a, { estado: "falha", erro: ex.erro });
      return fim(false, true, ex.erro);
    }
    execucaoId = ex.id;
  } else {
    const ps = [...unicos.values()].map((t) => ({ chave: t.chave, alvo: `Planejamento ${t.id}${t.dfd ? ` · DFD ${t.dfd}` : ""} → ${plano.find((a) => a.partes.includes(t))?.nome ?? ""}` }));
    const ex = await iniciarExecucaoLeitura("emitir-dfd", "baixar", ps, { destino: "pasta", arquivos: plano.length, formato: saida.formato });
    if ("erro" in ex) {
      for (const a of plano) marcarArquivo(a, { estado: "falha", erro: ex.erro });
      return fim(false, true, ex.erro);
    }
    execucaoId = ex.id;
  }

  const idExec = execucaoId;
  // SINAL DE VIDA (o passo em curso) e o cancelamento ao FECHAR a página.
  let passoAtual: string | null = null;
  const sinal = setInterval(() => {
    if (passoAtual) void sinalPasso(idExec, passoAtual);
  }, SINAL_EXECUCAO_MS);
  const soltarSaida = cancelarAoSair(idExec);
  // Baixar: o resultado de cada DFD vai ao servidor aos poucos (a página que fecha não perde o que já foi feito).
  const enviados = new Set<string>();
  const enviarResultados = async (todos: boolean) => {
    const lista = [...resultados.entries()].filter(([c]) => !enviados.has(c) && unicos.has(c));
    if (!todos && lista.length < 25) return;
    for (const [c] of lista) enviados.add(c);
    await concluirPassos(
      idExec,
      lista.map(([chave, r]) => ({ chave, estado: r.estado === "falhou" ? ("falhou" as const) : ("ok" as const), texto: r.texto })),
    );
  };

  const reportados = new Set<string>();
  const destino = !anexando && saida.escolherPasta ? d.pasta : null;
  const zip = !anexando && !destino && (plano.length > 1 || plano[0].pastas.length > 0) ? new ZipArmazenar() : null;
  const pedacos: Blob[] = [];
  /** Leva o arquivo ao destino; no anexo, `fase` mostra o passo real nas linhas dele. */
  const gravar = async (a: ArquivoSaida, bytes: Uint8Array, chaves: string[], unido = false): Promise<{ estado: "ok" | "ja"; nota?: string }> => {
    const dest = destinos.get(a);
    if (anexando && dest) {
      passoAtual = dest.passo.chave;
      const fase: Fase = (e) => {
        for (const c of chaves) d.marcar(c, { estado: e, erro: e === "anexando" ? "Enviando à Centi (confirme na extensão, se ela pedir)." : undefined });
        andamento(e === "aguardando" ? "Aguardando sua confirmação" : `Anexando ${a.nome}`);
      };
      const pdf = unido ? bytes : await regravarPdf(bytes).catch(() => bytes);
      const dados = { ...dest.passo.alvo, tipo, arquivo: a.nome, pdf: paraBase64(pdf) };
      let r = await anexarPelaPlataforma(d, idExec, dest.passo, dest.protocoloId, dados, fase);
      // Falha passageira: UMA nova tentativa (a extensão confere o protocolo antes — nunca duplica).
      if (!r.ok && falhaPassageira(r.erro) && !d.interrompido()) {
        andamento(`Tentando de novo: ${a.nome}`);
        r = await anexarPelaPlataforma(d, idExec, dest.passo, dest.protocoloId, dados, fase);
      }
      reportados.add(dest.passo.chave);
      if (!r.ok) throw new Error(r.erro ?? "A Centi não gravou.");
      const nota = notaDoAnexo(r) + (r.registro ? ` O registro no sistema falhou (${r.registro}) — o anexo vale; não reenvie.` : "");
      return { estado: r.jaAnexado ? "ja" : "ok", nota };
    }
    if (anexando) throw new Error("Sem o protocolo da Centi para este arquivo.");
    if (destino) await gravarNaPasta(destino, a.pastas, a.nome, comoBlob(bytes));
    else if (zip) pedacos.push(...zip.adicionar([...a.pastas, a.nome].join("/"), bytes).map((b) => comoBlob(b)));
    else baixarNoNavegador(a.nome, comoBlob(bytes));
    return { estado: "ok", nota: unido ? "Salvo no PDF unido." : undefined };
  };
  const falhaGravar = (e: unknown, unido: boolean) =>
    anexando && e instanceof Error ? e.message : unido ? "Não consegui gravar o PDF unido." : "Não consegui gravar (o tamanho não bateu) — escolha a pasta de novo.";
  const semSaida = new Set<string>();
  let parar = false;
  const pararFila = (erro: string) => marcarVarias((x) => (x.estado === "fila" ? { estado: "falha", erro } : null));
  try {
    for (const a of fila) {
      if (parar || d.interrompido()) break;
      const uniao = a.partes.length > 1 ? await novaUniao() : null;
      const unidas: string[] = [];
      for (const t of a.partes) {
        if (d.interrompido()) break;
        if (resultados.has(t.chave)) continue;
        if (!anexando) passoAtual = t.chave;
        andamento(`${anexando ? "Emitindo e anexando" : "Emitindo"} planejamento ${t.id}${t.dfd ? ` · DFD ${t.dfd}` : ""}`);
        const fase: Fase = (e) => d.marcar(t.chave, { estado: e, erro: undefined, amostra: undefined });
        let r = await emitirNaEntidade(d, t, saida.conferir, semSaida, d.atual, fase);
        if (!r.pdf && !r.ambiente && !r.recusada && falhaPassageira(r.erro) && !d.interrompido()) r = await emitirNaEntidade(d, t, saida.conferir, semSaida, d.atual, fase);
        if (!r.pdf) {
          const erro = r.erro ?? "Falha ao emitir.";
          // AMBIENTE (extensão/aba/sessão) ou OPERAÇÃO recusada: os demais falhariam igual — para (o que veio fica).
          if (r.ambiente || r.recusada) {
            if (d.interrompido()) break;
            marcar(t.chave, { estado: "falha", erro });
            pararFila(`Não emitido — o lote parou: ${erro}`);
            parar = true;
            break;
          }
          marcar(t.chave, { estado: "falha", erro, amostra: r.amostra });
          andamento(`Falhou: planejamento ${t.id}`);
          continue;
        }
        const ent = r.entidade ? { entidade: r.entidade, entidadePrevista: false } : {};
        try {
          if (uniao) {
            await uniao.adicionar(r.pdf);
            unidas.push(t.chave);
            d.marcar(t.chave, { estado: "unindo", ...ent, erro: "Conferido — entra no PDF unido." });
          } else {
            const g = await gravar(a, r.pdf, [t.chave]);
            marcar(t.chave, { estado: g.estado, ...ent, erro: g.nota });
          }
        } catch (e) {
          marcar(t.chave, { estado: "falha", ...ent, erro: uniao ? "PDF ilegível — não entrou no arquivo unido." : falhaGravar(e, false) });
          // A Centi recusou o ANEXO: os próximos seriam recusados igual — para.
          if (anexando && !uniao) {
            pararFila(`Não emitido — o anexo anterior foi recusado (${falhaGravar(e, false)}).`);
            parar = true;
            break;
          }
        }
        andamento(`Concluído: planejamento ${t.id}`);
        if (!anexando) await enviarResultados(false);
      }
      if (uniao && !uniao.vazio && !d.interrompido()) {
        const res = await uniao
          .salvar()
          .then((b) => gravar(a, b, unidas, true))
          .then((g) => ({ ok: true as const, ...g }))
          .catch((e: unknown) => ({ ok: false as const, nota: falhaGravar(e, true) }));
        for (const c of unidas) marcar(c, res.ok ? { estado: res.estado, erro: res.nota } : { estado: "falha", erro: res.nota });
        andamento(`Concluído: ${a.nome}`);
        if (anexando && !res.ok) {
          pararFila(`Não emitido — o anexo anterior foi recusado (${res.nota}).`);
          parar = true;
        }
      }
    }
  } catch (e) {
    // Uma falha inesperada (ex.: ao unir os PDFs) nunca deixa linha "em curso" nem a execução rodando.
    erroGeral = `Falha inesperada: ${e instanceof Error ? e.message : String(e)}`;
    parar = true;
  } finally {
    clearInterval(sinal);
    soltarSaida();
  }
  // CONFERÊNCIA FINAL na Centi: cada arquivo dado como anexado/já estava tem de estar no protocolo (a resposta do salvar não
  // basta). O que não estiver vira falha "não confirmado" — o "Enviar os que faltam" o reenvia.
  if (anexando && naCentiSuportado && !d.interrompido() && !erroGeral) {
    andamento("Conferindo na Centi o que foi anexado");
    const docsFinais = new Map<string, Map<string, DocCenti>>();
    for (const [id, al] of porIdFinal) {
      const r = await d.pedir("protocolo", al, 60_000).catch(() => ({ ok: false }) as RespostaExt);
      if (r.ok && r.protocolo && Array.isArray(r.protocolo.docs)) docsFinais.set(id, docsPorDescricao(r.protocolo.docs));
    }
    let ok = 0;
    let total = 0;
    for (const [a, x] of destinos) {
      const estados = a.partes.map((t) => resultados.get(t.chave)?.estado);
      if (!estados.length || !estados.every((e) => e === "ok" || e === "ja")) continue;
      const idx = docsFinais.get(x.passo.alvo.id);
      if (!idx) continue;
      total++;
      if (idx.has(descricaoCanonica(x.passo.alvo.descricao))) ok++;
      else marcarArquivo(a, { estado: "falha", erro: "Não confirmado na Centi: o documento não está no protocolo — use “Enviar os que faltam”." });
    }
    if (total) confirmados = { ok, total };
  }
  const interrompido = d.interrompido();
  if (interrompido) marcarVarias((x) => (x.estado === "fila" || emCursoLinha(x) ? { estado: "interrompido", erro: "Interrompido na extensão." } : null));
  else if (erroGeral) {
    const msg = erroGeral;
    marcarVarias((x) => (x.estado === "fila" || emCursoLinha(x) ? { estado: "falha", erro: msg } : null));
  }
  // A execução no servidor: SEMPRE finalizada (o histórico mostra o que aconteceu de fato).
  try {
    if (!anexando) {
      await enviarResultados(true);
      if (interrompido) await cancelarExecucao(idExec);
      else {
        const faltam = [...unicos.keys()].filter((c) => !enviados.has(c));
        if (faltam.length) await concluirPassos(idExec, faltam.map((chave) => ({ chave, estado: "falhou" as const, texto: "Não emitido (o lote parou antes)." })));
      }
    } else if (interrompido) await cancelarExecucao(idExec);
    else
      for (const [a, x] of destinos)
        if (!reportados.has(x.passo.chave)) {
          const motivo = a.partes.map((t) => resultados.get(t.chave)?.texto).find(Boolean) ?? "Nenhum DFD deste arquivo foi emitido.";
          await concluirPasso(idExec, x.passo.chave, "falhou", motivo);
        }
  } catch {
    /* best-effort: a reconciliação do servidor encerra a que ficar para trás */
  }
  if (zip && !zip.vazio) {
    pedacos.push(...zip.fechar().map((b) => comoBlob(b)));
    const raiz = new Set(plano.map((a) => a.pastas[0] ?? ""));
    const nome = raiz.size === 1 && [...raiz][0] ? [...raiz][0] : `DFDs Centi - ${hojeBR()}`;
    baixarNoNavegador(`${nomeSeguro(nome)}.zip`, new Blob(pedacos, { type: "application/zip" }));
  }
  return fim(interrompido, parar, erroGeral);
}

const emCursoLinha = (l: LinhaDfd) => l.estado === "emitindo" || l.estado === "conferindo" || l.estado === "unindo" || l.estado === "aguardando" || l.estado === "anexando";
