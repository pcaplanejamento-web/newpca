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
} from "./automacao-centi-core";
import { baixarNoNavegador, baixarPelaExtensao, comoBlob, deBase64, novaUniao, pdfDoAchado, type PedirExtensao } from "./arquivo-navegador";
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
} from "./automacao-cliente";
import { descricaoCanonica } from "./automacao-core";
import { ZipArmazenar } from "./zip-armazenar";

export type EstadoDfd = "fila" | "baixando" | "ok" | "falha" | "pulado" | "repetido";
export type LinhaDfd = TarefaCenti & { estado: EstadoDfd; erro?: string; amostra?: string; entidade?: string };
export type Emissao = { pdf?: Uint8Array; erro?: string; amostra?: string; ambiente?: boolean; entidade?: string; recusada?: boolean };
/** A resposta da extensão (o que o motor lê). */
export type RespostaExt = {
  ok?: boolean;
  erro?: string;
  b64?: string;
  status?: number;
  interrompido?: boolean;
  operacao?: unknown;
  protocolo?: { numero: string; ano: string; assunto: string; descricao: string; documentos: number };
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
async function emitirConferido(c: ContextoEmissor, t: TarefaCenti, conferir: boolean, entidade?: string): Promise<Emissao> {
  const r = await emitirUm(c, t.id, entidade);
  if (!r.pdf || !conferir) return r;
  const erro = conferirConteudoDfd(await textoDoPdf(r.pdf).catch(() => ""), t);
  return erro ? { erro } : r;
}

/** A ENTIDADE do DFD: a cadastrada no órgão; senão a do mapa; senão a aberta — e, com "descobrir", tenta as outras e
 * lembra a que deu certo para o órgão. */
async function emitirNaEntidade(c: ContextoEmissor, t: TarefaCenti, conferir: boolean, semSaida: Set<string>, atual: string | null): Promise<Emissao> {
  const fixa = t.orgao ? c.cadastradas()[t.orgao] : undefined;
  if (fixa) {
    const e = formatoEntidade(fixa, atual);
    return { ...(await emitirConferido(c, t, conferir, e)), entidade: e };
  }
  const mapeada = t.orgao ? c.mapa()[t.orgao] : undefined;
  const r = await emitirConferido(c, t, conferir, mapeada);
  if (r.pdf) {
    if (t.orgao && !mapeada && atual) c.definirEntidade(t.orgao, atual);
    return { ...r, entidade: mapeada ?? atual ?? undefined };
  }
  const cfg = c.cfg();
  if (r.ambiente || r.recusada || !cfg.descobrirEntidade || (t.orgao && semSaida.has(t.orgao))) return r;
  const ja = mapeada ?? atual;
  const tentar = [...new Set([...Object.values(c.mapa()), ...candidatosEntidade(cfg.entidades, atual)])].filter((e) => e !== ja);
  for (const e of tentar) {
    const x = await emitirConferido(c, t, conferir, e);
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
  const a = lerAlvoCenti(String(c.alvoId ?? ""), String(c.alvoNumero ?? ""));
  return "alvo" in a ? { saida, alvo: a.alvo } : { saida, alvo: null, erroAlvo: a.erro };
}

/** O PLANO a partir dos itens do fluxo: protocolos do sistema (com os DFDs) ou nºs de planejamento (`id`). */
export function planoDosItens(itens: Record<string, unknown>[], saida: OpcoesSaida, protocolos: ProtocoloAutomacao[]): { arquivos: ArquivoSaida[]; previa: LinhaDfd[] } {
  const protos = itens.filter((it) => Array.isArray(it.dfds)) as unknown as ProtocoloAutomacao[];
  if (protos.length) {
    const p = planoDosProtocolos(protos, saida);
    return { arquivos: p.arquivos, previa: previaDfds(p.arquivos, p) };
  }
  const ids = [...new Set(itens.map((it) => String(it.id ?? it.planejamento ?? "").replace(/\D/g, "")).filter(Boolean))];
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
 * "sim" grava, com uma autorização nova); gravado = registro + passo feito. */
export async function anexarPelaPlataforma(
  d: { pedir: Pedir; confirmar: (texto: string) => Promise<boolean> },
  execucaoId: number,
  passo: PassoAnexo,
  protocoloId: number | null,
  dados: Record<string, unknown>,
): Promise<RespostaExt> {
  const uma = async (extra: Record<string, unknown>): Promise<RespostaExt> => {
    const a = await autorizarEscrita(execucaoId, passo);
    if ("erro" in a) return { ok: false, erro: a.erro };
    if ("jaFeito" in a) return { ok: true, jaAnexado: true, documento: a.centiDocumento ?? undefined };
    return d.pedir("anexar", { ...dados, ...extra, autorizacao: { token: a.token } }, 320_000);
  };
  let r = await uma({});
  if (!r.ok && r.confirmar) r = (await d.confirmar(r.confirmar)) ? await uma({ aceitar: true }) : { ok: false, erro: `Não anexado — confirmação recusada: ${r.confirmar}` };
  if (r.ok) await registrarAnexo(execucaoId, passo, r.documento ?? null, protocoloId, r.jaAnexado ? "Já estava no protocolo." : `Documento ${r.sequencial ?? "?"} do protocolo.`);
  else await concluirPasso(execucaoId, passo.chave, "falhou", r.erro ?? "A Centi não gravou.");
  return r;
}

/** TESTE do anexo SEM emitir DFD: um PDF de 1 página ("TESTE - pode excluir - hora") no protocolo indicado — separa o
 * salvar da emissão. */
export async function testarAnexo(d: { pedir: Pedir; confirmar: (texto: string) => Promise<boolean> }, alvo: AlvoCenti, tipo: string): Promise<{ ok: string } | { erro: string }> {
  try {
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

/**
 * Executa o plano (os arquivos): emite cada DFD, une quando o arquivo junta vários, e leva ao destino. Cada execução é
 * REGISTRADA no sistema (baixar = "Emitir DFDs"; anexar = "Anexar DFDs", sem a qual nada é gravado). Devolve o resumo.
 */
export async function executarDfds(
  plano: ArquivoSaida[],
  saida: OpcoesSaida,
  alvo: AlvoCenti | null,
  d: DepsExecucao,
): Promise<{ ok: number; falhas: number; interrompido: boolean; parou: boolean }> {
  const anexando = saida.destino !== "pasta";
  const proprio = saida.destino === "proprio";
  const tipo = saida.tipoDocumento;
  const resultados = new Map<string, { estado: "ok" | "falhou"; texto: string }>();
  const marcar = (chave: string, l: Partial<LinhaDfd>) => {
    if (l.estado === "ok" || l.estado === "falha") resultados.set(chave, { estado: l.estado === "ok" ? "ok" : "falhou", texto: l.erro ?? (l.estado === "ok" ? "Salvo." : "Falhou.") });
    d.marcar(chave, l);
  };
  const marcarArquivo = (a: ArquivoSaida, l: Partial<LinhaDfd>) => {
    for (const t of a.partes) marcar(t.chave, l);
  };
  const destinos = new Map<ArquivoSaida, { passo: PassoAnexo; protocoloId: number | null }>();
  let fila = plano;
  let execucaoId: number | null = null;
  const fim = () => ({
    ok: [...resultados.values()].filter((x) => x.estado === "ok").length,
    falhas: [...resultados.values()].filter((x) => x.estado === "falhou").length,
  });
  if (anexando) {
    // Cada arquivo tem o SEU protocolo da Centi (o indicado, ou o de onde vieram os DFDs). Antes de emitir: cada protocolo
    // é conferido na Centi (Id + nº) e o já anexado não é emitido de novo (pré-verificação).
    const alvos = new Map<ArquivoSaida, { alvo: AlvoCenti; protocoloId: number | null }>();
    for (const a of plano) {
      const x = proprio ? alvoDoArquivo(a, d.protocolos) : alvo ? { alvo, protocoloId: null } : { erro: "Informe o protocolo da Centi." };
      if ("erro" in x) marcarArquivo(a, { estado: "falha", erro: x.erro });
      else alvos.set(a, x);
    }
    const porId = new Map<string, AlvoCenti>();
    for (const x of alvos.values()) porId.set(x.alvo.id, x.alvo);
    const recusados = new Map<string, string>();
    for (const [id, al] of porId) {
      const r = await d.pedir("protocolo", al, 60_000);
      if (!(r.ok && r.protocolo)) recusados.set(id, r.erro ?? "Não consegui abrir o protocolo na Centi.");
    }
    const ja = await jaAnexados([...porId.keys()]);
    let i = 0;
    for (const [a, x] of alvos) {
      const motivo = recusados.get(x.alvo.id);
      if (motivo) {
        marcarArquivo(a, { estado: "falha", erro: motivo });
        continue;
      }
      const descricao = descricaoDoArquivo(a.nome);
      const feito = ja?.get(`${x.alvo.id}|${descricaoCanonica(descricao)}`);
      if (feito) {
        marcarArquivo(a, { estado: "ok", erro: `Já anexado antes${feito.documento ? ` (documento ${feito.documento})` : ""}${feito.quem ? ` por ${feito.quem}` : ""} — não emitido de novo.` });
        continue;
      }
      destinos.set(a, { passo: { chave: `arquivo-${++i}`, alvo: { ...x.alvo, descricao } }, protocoloId: x.protocoloId });
    }
    fila = plano.filter((a) => destinos.has(a));
    if (!fila.length) return { ...fim(), interrompido: false, parou: false };
    const ex = await iniciarExecucao("anexar-dfds", [...destinos.values()].map((x) => x.passo), { destino: saida.destino, protocolos: porId.size, arquivos: fila.length, tipo });
    if ("erro" in ex) {
      for (const a of fila) marcarArquivo(a, { estado: "falha", erro: ex.erro });
      return { ...fim(), interrompido: false, parou: true };
    }
    execucaoId = ex.id;
  } else {
    const vistos = new Set<string>();
    const ps: { chave: string; alvo: string }[] = [];
    for (const a of plano)
      for (const t of a.partes)
        if (!vistos.has(t.chave)) {
          vistos.add(t.chave);
          ps.push({ chave: t.chave, alvo: `Planejamento ${t.id}${t.dfd ? ` · DFD ${t.dfd}` : ""} → ${a.nome}` });
        }
    const ex = await iniciarExecucaoLeitura("emitir-dfd", "baixar", ps, { destino: "pasta", arquivos: plano.length, formato: saida.formato });
    if ("erro" in ex) {
      for (const a of plano) marcarArquivo(a, { estado: "falha", erro: ex.erro });
      return { ...fim(), interrompido: false, parou: true };
    }
    execucaoId = ex.id;
  }

  const reportados = new Set<string>();
  const destino = !anexando && saida.escolherPasta ? d.pasta : null;
  const zip = !anexando && !destino && (plano.length > 1 || plano[0].pastas.length > 0) ? new ZipArmazenar() : null;
  const pedacos: Blob[] = [];
  const anexar = (passo: PassoAnexo, protocoloId: number | null, dados: Record<string, unknown>) => anexarPelaPlataforma(d, execucaoId as number, passo, protocoloId, dados);
  const gravar = async (a: ArquivoSaida, bytes: Uint8Array, unido = false): Promise<string | undefined> => {
    const dest = destinos.get(a);
    if (anexando && dest) {
      const pdf = unido ? bytes : await regravarPdf(bytes).catch(() => bytes);
      const r = await anexar(dest.passo, dest.protocoloId, { ...dest.passo.alvo, tipo, arquivo: a.nome, pdf: paraBase64(pdf) });
      reportados.add(dest.passo.chave);
      if (!r.ok) throw new Error(r.erro ?? "A Centi não gravou.");
      return r.jaAnexado ? `Já estava no protocolo${r.sequencial ? ` (documento ${r.sequencial})` : ""} — não anexado de novo.` : `Documento ${r.sequencial} do protocolo.`;
    }
    if (anexando) throw new Error("Sem o protocolo da Centi para este arquivo.");
    if (destino) await gravarNaPasta(destino, a.pastas, a.nome, comoBlob(bytes));
    else if (zip) pedacos.push(...zip.adicionar([...a.pastas, a.nome].join("/"), bytes).map((b) => comoBlob(b)));
    else baixarNoNavegador(a.nome, comoBlob(bytes));
    return undefined;
  };
  const falhaGravar = (e: unknown, unido: boolean) =>
    anexando && e instanceof Error ? e.message : unido ? "Não consegui gravar o PDF unido." : "Não consegui gravar (o tamanho não bateu) — escolha a pasta de novo.";
  const semSaida = new Set<string>();
  let parar = false;
  const pararFila = (erro: string) => d.marcarVarias((x) => (x.estado === "fila" ? { estado: "falha", erro } : null));
  const totalDfds = fila.reduce((n, a) => n + a.partes.length, 0);
  let feitos = 0;
  const andamento = (texto: string) => {
    if (d.lote.current) void d.pedir("lote", { fase: "passo", loteId: d.lote.current, texto, feito: feitos, total: totalDfds }, 8000);
  };
  for (const a of fila) {
    if (parar || d.interrompido()) break;
    const uniao = a.partes.length > 1 ? await novaUniao() : null;
    const unidas: string[] = [];
    for (const t of a.partes) {
      if (d.interrompido()) break;
      feitos++;
      andamento(`${anexando ? "Emitindo e anexando" : "Emitindo"} planejamento ${t.id}${t.dfd ? ` · DFD ${t.dfd}` : ""}`);
      marcar(t.chave, { estado: "baixando" });
      const r = await emitirNaEntidade(d, t, saida.conferir, semSaida, d.atual);
      if (!r.pdf) {
        const erro = r.erro ?? "Falha ao emitir.";
        // AMBIENTE (extensão/aba/sessão) ou OPERAÇÃO recusada: os demais falhariam igual — para (o que veio fica).
        if (r.ambiente || r.recusada) {
          marcar(t.chave, { estado: "falha", erro });
          pararFila(erro);
          parar = true;
          break;
        }
        marcar(t.chave, { estado: "falha", erro, amostra: r.amostra });
        continue;
      }
      try {
        if (uniao) {
          await uniao.adicionar(r.pdf);
          unidas.push(t.chave);
          marcar(t.chave, { estado: "baixando", entidade: r.entidade, erro: "Conferido — entra no PDF unido." });
        } else marcar(t.chave, { estado: "ok", entidade: r.entidade, erro: await gravar(a, r.pdf) });
      } catch (e) {
        marcar(t.chave, { estado: "falha", erro: uniao ? "PDF ilegível — não entrou no arquivo unido." : falhaGravar(e, false) });
        // A Centi recusou o ANEXO: os próximos seriam recusados igual — para.
        if (anexando && !uniao) {
          pararFila(`Não emitido — o anexo anterior foi recusado (${falhaGravar(e, false)}).`);
          parar = true;
          break;
        }
      }
    }
    if (uniao && !uniao.vazio && !d.interrompido()) {
      const res = await uniao
        .salvar()
        .then((b) => gravar(a, b, true))
        .then((nota) => ({ ok: true as const, nota }))
        .catch((e: unknown) => ({ ok: false as const, nota: falhaGravar(e, true) }));
      for (const c of unidas) marcar(c, { estado: res.ok ? "ok" : "falha", erro: res.nota ?? (res.ok ? "Salvo no PDF unido." : "Falhou.") });
      if (anexando && !res.ok) {
        pararFila(`Não emitido — o anexo anterior foi recusado (${res.nota}).`);
        parar = true;
      }
    }
  }
  const interrompido = d.interrompido();
  if (interrompido) d.marcarVarias((x) => (x.estado === "fila" || x.estado === "baixando" ? { estado: "falha", erro: "Interrompido na extensão." } : null));
  if (execucaoId != null && !anexando) {
    const vistos = new Set<string>();
    const lista: { chave: string; estado: "ok" | "falhou"; texto: string }[] = [];
    for (const a of plano)
      for (const t of a.partes)
        if (!vistos.has(t.chave)) {
          vistos.add(t.chave);
          lista.push({ chave: t.chave, ...(resultados.get(t.chave) ?? { estado: "falhou" as const, texto: "Não emitido (o lote parou antes)." }) });
        }
    await concluirPassos(execucaoId, lista);
  } else if (execucaoId != null) {
    if (parar || interrompido) await cancelarExecucao(execucaoId);
    else for (const x of destinos.values()) if (!reportados.has(x.passo.chave)) await concluirPasso(execucaoId, x.passo.chave, "falhou", "Nenhum DFD deste arquivo foi emitido.");
  }
  if (zip && !zip.vazio) {
    pedacos.push(...zip.fechar().map((b) => comoBlob(b)));
    const raiz = new Set(plano.map((a) => a.pastas[0] ?? ""));
    const nome = raiz.size === 1 && [...raiz][0] ? [...raiz][0] : `DFDs Centi - ${hojeBR()}`;
    baixarNoNavegador(`${nomeSeguro(nome)}.zip`, new Blob(pedacos, { type: "application/zip" }));
  }
  return { ...fim(), interrompido, parou: parar };
}
