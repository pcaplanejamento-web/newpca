"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ArquivoSaida,
  analisarRespostaCenti,
  CONFIG_CENTI_PADRAO,
  type ConfigCenti,
  caminhosDoArquivo,
  candidatosEntidade,
  ehPdf,
  type FormatoSaida,
  lerConfigCenti,
  lerIdsCenti,
  lerOpcoesSaida,
  linkDaResposta,
  MAX_IDS_CENTI,
  maiorVersao,
  nomeSeguro,
  OPCOES_SAIDA_PADRAO,
  type OpcoesSaida,
  type ProtocoloAutomacao,
  pedidoEmitirDfd,
  planoDosIds,
  planoDosProtocolos,
  type TarefaCenti,
  VERSAO_EXTENSAO_CENTI,
  versaoAtende,
} from "@/lib/automacao-centi-core";
import { ZipArmazenar } from "@/lib/zip-armazenar";
import { Ajuda } from "./Ajuda";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { EstadoPonto } from "./EstadoCelula";
import { TextField } from "./Field";
import { cellCls } from "./formStyles";
import { useAlturaTela } from "./AlturaCheia";
import { IconDownload, IconPasta, IconPastaAberta, IconRefresh, IconRobo } from "./icons";
import { Progress } from "./Progress";
import { Segmented } from "./Segmented";
import { Switch } from "./Switch";

// Tela AUTOMAÇÃO (só ADM): baixa DFDs da Centi ("Emitir DFD" do CM002 Planejamento) por PROTOCOLO do sistema (uma pasta
// por protocolo, dentro da pasta "PCA <ano>") ou por Id. Quem fala com a Centi é a EXTENSÃO do Chrome (extensao-centi/),
// usando a sessão da Centi já aberta — nenhuma senha fica no sistema e nada é gravado na Centi (travas também na extensão).
// Cada DFD é emitido na ENTIDADE da Centi do órgão dele (mapa órgão → entidade, descoberto sozinho e lembrado no aparelho).

const CHAVE_CONFIG = "automacao:centi";
const CHAVE_SAIDA = "automacao:centi-saida";
const CHAVE_ENTIDADES = "automacao:centi-entidades";

type Resposta = { ok: boolean; erro?: string; logado?: boolean; entidade?: string | null; status?: number; b64?: string };
type Linha = TarefaCenti & { estado: "fila" | "baixando" | "ok" | "falha"; erro?: string; amostra?: string; entidade?: string };
type Modo = "protocolo" | "ids";
type Ext = { versao: string } | null;

/** Conversa com a extensão pela ponte da página (window.postMessage). */
function useExtensaoCenti() {
  const [ext, setExt] = useState<Ext>(null);
  const versao = useRef("");
  const seq = useRef(0);
  const pendentes = useRef(new Map<number, (r: Resposta) => void>());
  useEffect(() => {
    const ouvir = (e: MessageEvent) => {
      if (e.source !== window || e.data?.fonte !== "pca-extensao") return;
      if (e.data.tipo === "pronto") {
        // Vale a MAIOR versão anunciada (uma cópia antiga que ficou na aba também se anuncia).
        const v = String(e.data.versao ?? "");
        if (versao.current && maiorVersao(versao.current, v) === versao.current) return;
        versao.current = v;
        setExt({ versao: versao.current });
        return;
      }
      // Só a resposta da ponte ATUAL (uma cópia antiga da extensão que ficou na aba também ouve).
      if (e.data.v !== versao.current) return;
      const f = pendentes.current.get(e.data.id);
      if (f) {
        pendentes.current.delete(e.data.id);
        f(e.data.resposta ?? { ok: false, erro: "Sem resposta da extensão." });
      }
    };
    window.addEventListener("message", ouvir);
    window.postMessage({ fonte: "pca-automacao", tipo: "ola" }, window.location.origin);
    return () => window.removeEventListener("message", ouvir);
  }, []);
  const pedir = useCallback((acao: string, dados: unknown, ms: number) => {
    const id = ++seq.current;
    return new Promise<Resposta>((ok) => {
      const t = window.setTimeout(() => {
        pendentes.current.delete(id);
        ok({ ok: false, erro: "A extensão não respondeu a tempo." });
      }, ms);
      pendentes.current.set(id, (r) => {
        window.clearTimeout(t);
        ok(r);
      });
      window.postMessage({ fonte: "pca-automacao", v: versao.current, id, acao, dados }, window.location.origin);
    });
  }, []);
  return { ext, pedir };
}

type Pasta = {
  getFileHandle: (n: string, o: { create: boolean }) => Promise<{ createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }> }>;
  getDirectoryHandle: (n: string, o: { create: boolean }) => Promise<Pasta>;
  name: string;
};

const deBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
async function gunzip(bytes: Uint8Array) {
  const st = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(st).arrayBuffer());
}
const comoBlob = (b: Uint8Array, tipo = "application/pdf") => new Blob([b as Uint8Array<ArrayBuffer>], { type: tipo });

function baixarNoNavegador(nome: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Grava na pasta escolhida, criando as subpastas (PCA <ano> / protocolo) na 1ª vez. */
async function gravarNaPasta(pasta: Pasta, pastas: string[], nome: string, blob: Blob) {
  let destino = pasta;
  for (const p of pastas) destino = await destino.getDirectoryHandle(p, { create: true });
  const arq = await destino.getFileHandle(nome, { create: true });
  const w = await arq.createWritable();
  await w.write(blob);
  await w.close();
}

/** Une PDFs na ordem (pdf-lib, carregado só aqui). */
async function novaUniao() {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  let n = 0;
  return {
    async adicionar(b: Uint8Array) {
      const d = await PDFDocument.load(b, { ignoreEncryption: true });
      for (const pg of await doc.copyPages(d, d.getPageIndices())) doc.addPage(pg);
      n++;
    },
    get vazio() {
      return n === 0;
    },
    salvar: () => doc.save(),
  };
}

function lerLocal<T>(chave: string, ler: (v: unknown) => T, padrao: T): T {
  try {
    return ler(JSON.parse(localStorage.getItem(chave) ?? "null"));
  } catch {
    return padrao;
  }
}
function gravarLocal(chave: string, v: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(v));
  } catch {}
}
const lerMapa = (v: unknown): Record<string, string> =>
  Object.fromEntries(Object.entries(v && typeof v === "object" ? v : {}).filter(([, x]) => typeof x === "string" && /^[\w.-]{1,40}$/.test(x))) as Record<string, string>;

/** O que fica abaixo da tabela, dentro do cartão (o respiro + a borda) — a tabela rola por dentro até ali. */
const RESERVA_SECAO = 18;

const URL_EXTENSAO = "/api/admin/automacao/extensao";
const baixarExtensao = () => {
  window.location.href = URL_EXTENSAO;
};

const hojeBR = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
};

const COR: Record<Linha["estado"], string> = { fila: "var(--muted)", baixando: "var(--info)", ok: "var(--ok)", falha: "var(--danger)" };
const ROTULO: Record<Linha["estado"], string> = { fila: "Na fila", baixando: "Baixando…", ok: "Salvo", falha: "Falhou" };

function Secao({ titulo, acao, children, className = "" }: { titulo: string; acao?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`space-y-3 rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-text">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

const semPlan = (p: ProtocoloAutomacao) => p.dfds.filter((d) => !/[1-9]/.test(d.planejamento ?? "")).length;
const texto1 = (v: string | null) => (
  <span className="line-clamp-1" title={v ?? ""}>
    {v || "—"}
  </span>
);

const COLUNAS: Column<ProtocoloAutomacao>[] = [
  { key: "numero", header: "Nº protocolo", nowrap: true, value: (p) => p.numero, render: (p) => <span className="font-semibold text-text">{p.numero}</span> },
  { key: "id", header: "Id", nowrap: true, value: (p) => p.idExterno ?? "—" },
  { key: "sigla", header: "Sigla", nowrap: true, value: (p) => p.sigla ?? "—" },
  { key: "assunto", header: "Assunto", minWidth: 180, align: "left", value: (p) => p.assunto ?? "—", render: (p) => texto1(p.assunto) },
  { key: "interessado", header: "Interessado", minWidth: 220, align: "left", value: (p) => p.interessado ?? "—", render: (p) => texto1(p.interessado) },
  { key: "pca", header: "PCA", nowrap: true, value: (p) => (p.anoPca ? String(p.anoPca) : "—") },
  { key: "local", header: "Local", nowrap: true, value: (p) => p.pca ?? "Mesa do sistema" },
  { key: "dfds", header: "DFDs", nowrap: true, filter: "range", numero: (p) => p.dfds.length, formatarFaixa: (n) => String(n), value: (p) => String(p.dfds.length) },
  {
    key: "semplan",
    header: "Sem planej.",
    nowrap: true,
    value: (p) => (semPlan(p) ? "Com DFD sem planejamento" : "Todos com planejamento"),
    render: (p) => (semPlan(p) ? <span className="font-semibold text-[var(--warn)]">{semPlan(p)}</span> : <span className="text-muted">0</span>),
  },
];

const FORMATOS: { value: FormatoSaida; label: string }[] = [
  { value: "separados", label: "Separados" },
  { value: "protocolo", label: "Um por protocolo" },
  { value: "unico", label: "Um único" },
];

export function AutomacaoAdmin({ protocolos }: { protocolos: ProtocoloAutomacao[] }) {
  const { ext, pedir } = useExtensaoCenti();
  const [cfg, setCfg] = useState<ConfigCenti>(CONFIG_CENTI_PADRAO);
  const [saida, setSaida] = useState<OpcoesSaida>(OPCOES_SAIDA_PADRAO);
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const mapaRef = useRef(mapa);
  const [logado, setLogado] = useState<Resposta | null>(null);
  const [modo, setModo] = useState<Modo>("protocolo");
  const [texto, setTexto] = useState("");
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const [pasta, setPasta] = useState<Pasta | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [rodando, setRodando] = useState(false);
  const podePasta = typeof window !== "undefined" && "showDirectoryPicker" in window;
  // No desktop a tela cabe no display (sem rolar o navegador): a tabela e a coluna da direita rolam por dentro.
  const corpo = useRef<HTMLDivElement>(null);
  const altura = useAlturaTela(corpo, 420);

  useEffect(() => {
    setCfg(lerLocal(CHAVE_CONFIG, lerConfigCenti, CONFIG_CENTI_PADRAO));
    setSaida(lerLocal(CHAVE_SAIDA, lerOpcoesSaida, OPCOES_SAIDA_PADRAO));
    const m = lerLocal(CHAVE_ENTIDADES, lerMapa, {});
    mapaRef.current = m;
    setMapa(m);
  }, []);
  const mudar = (p: Partial<ConfigCenti>) => {
    const n = lerConfigCenti({ ...cfg, ...p });
    setCfg(n);
    gravarLocal(CHAVE_CONFIG, n);
  };
  const mudarSaida = (p: Partial<OpcoesSaida>) => {
    const n = lerOpcoesSaida({ ...saida, ...p });
    setSaida(n);
    gravarLocal(CHAVE_SAIDA, n);
  };
  const definirEntidade = useCallback((orgao: string, entidade: string) => {
    const v = entidade.trim();
    const n = { ...mapaRef.current };
    if (v && /^[\w.-]{1,40}$/.test(v)) n[orgao] = v;
    else delete n[orgao];
    mapaRef.current = n;
    setMapa(n);
    gravarLocal(CHAVE_ENTIDADES, n);
  }, []);

  const verificar = useCallback(async () => setLogado(await pedir("estado", null, 8000)), [pedir]);
  useEffect(() => {
    if (ext && versaoAtende(ext.versao)) void verificar();
  }, [ext, verificar]);

  const { ids, excedente } = lerIdsCenti(texto);
  const escolhidos = useMemo(() => protocolos.filter((p) => sel.has(p.id)), [protocolos, sel]);
  const doProtocolo = useMemo(() => planoDosProtocolos(escolhidos, saida, hojeBR()), [escolhidos, saida]);
  const arquivos = useMemo(() => (modo === "protocolo" ? doProtocolo.arquivos : planoDosIds(ids, protocolos, saida, hojeBR())), [modo, doProtocolo, ids, protocolos, saida]);
  const totalDfds = arquivos.reduce((s, a) => s + a.partes.length, 0);

  // Os órgãos dos DFDs (os do que está escolhido; sem escolha, todos) para o mapa órgão → entidade da Centi.
  const orgaos = useMemo(() => {
    const base = modo === "protocolo" && escolhidos.length ? escolhidos : protocolos;
    const m = new Map<string, { nome: string; n: number }>();
    for (const p of base)
      for (const d of p.dfds)
        if (d.orgao) {
          const o = m.get(d.orgao) ?? { nome: d.orgaoNome ?? d.orgao.slice(2), n: 0 };
          o.n++;
          m.set(d.orgao, o);
        }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [modo, escolhidos, protocolos]);

  async function escolherPasta() {
    try {
      const p = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<Pasta> }).showDirectoryPicker({ mode: "readwrite", startIn: "downloads" });
      setPasta(p);
    } catch {}
  }

  type Emissao = { pdf?: Uint8Array; erro?: string; amostra?: string; ambiente?: boolean; entidade?: string };
  // A LÓGICA da emissão (a extensão só leva o pedido à aba da Centi): Processar → o PDF, ou a chave do arquivo → baixa.
  async function emitirUm(id: string, entidade?: string): Promise<Emissao> {
    const ambiente = (r: Resposta): Emissao => ({ erro: r.erro ?? "Falha na extensão.", ambiente: true });
    const r = await pedir("pedir", { metodo: "POST", caminho: "restauth/operation", corpo: pedidoEmitirDfd(id, cfg, new Date()), entidade }, 150_000);
    if (!r.ok || r.b64 == null) return ambiente(r);
    const a = analisarRespostaCenti(deBase64(r.b64), r.status ?? 0);
    if (a.tipo === "pdf") return { pdf: a.bytes };
    if (a.tipo === "base64") return { pdf: deBase64(a.b64) };
    if (a.tipo === "gzip") {
      const b = await gunzip(deBase64(a.b64)).catch(() => null);
      return b && ehPdf(b) ? { pdf: b } : { erro: "Não consegui abrir o PDF compactado da Centi." };
    }
    if (a.tipo === "nada") return { erro: a.erro, amostra: a.amostra, ambiente: /sessão/i.test(a.erro) };
    for (const caminho of caminhosDoArquivo(a)) {
      const d = await pedir("pedir", { metodo: "GET", caminho, entidade }, 150_000);
      if (!d.ok || d.b64 == null || (d.status ?? 0) >= 400) continue;
      const b = deBase64(d.b64);
      if (ehPdf(b)) return { pdf: b };
      const link = linkDaResposta(b);
      if (link) {
        const z = await pedir("pedir", { metodo: "GET", caminho: link, entidade }, 150_000);
        const c = z.ok && z.b64 ? deBase64(z.b64) : null;
        if (c && ehPdf(c)) return { pdf: c };
      }
    }
    return { erro: "A Centi gerou o PDF, mas não consegui baixá-lo pela chave." };
  }

  // A ENTIDADE do DFD: a do órgão (mapa); sem ela, a aberta na Centi. Falhou e "descobrir" está ligado → tenta as outras
  // entidades e lembra a que deu certo para o órgão (os próximos DFDs dele vão direto).
  async function emitirNaEntidade(t: TarefaCenti, semSaida: Set<string>, atual: string | null): Promise<Emissao> {
    const mapeada = t.orgao ? mapaRef.current[t.orgao] : undefined;
    const r = await emitirUm(t.id, mapeada);
    if (r.pdf) {
      if (t.orgao && !mapeada && atual) definirEntidade(t.orgao, atual);
      return { ...r, entidade: mapeada ?? atual ?? undefined };
    }
    if (r.ambiente || !cfg.descobrirEntidade || (t.orgao && semSaida.has(t.orgao))) return r;
    const ja = mapeada ?? atual;
    const conhecidas = Object.values(mapaRef.current);
    const tentar = [...new Set([...conhecidas, ...candidatosEntidade(cfg.entidades, atual)])].filter((e) => e !== ja);
    for (const e of tentar) {
      const x = await emitirUm(t.id, e);
      if (x.ambiente) return x;
      if (x.pdf) {
        if (t.orgao) definirEntidade(t.orgao, e);
        return { ...x, entidade: e };
      }
    }
    if (t.orgao) semSaida.add(t.orgao);
    return tentar.length ? { ...r, erro: `${r.erro ?? "Falha"} (não achei em nenhuma das ${tentar.length + 1} entidades tentadas)` } : r;
  }

  // Um arquivo após o outro, um DFD após o outro (a Centi processa um pedido por vez na aba). Sem pasta escolhida: um
  // arquivo só vai direto para Downloads; vários vão num ZIP com as pastas montadas.
  async function baixar() {
    if (!arquivos.length || rodando) return;
    setRodando(true);
    const plano = arquivos;
    const todas = plano.flatMap((a) => a.partes);
    setLinhas(todas.map((t) => ({ ...t, estado: "fila" })));
    const marcar = (chave: string, l: Partial<Linha>) => setLinhas((ls) => ls.map((x) => (x.chave === chave ? { ...x, ...l } : x)));
    const zip = !pasta && (plano.length > 1 || plano[0].pastas.length > 0) ? new ZipArmazenar() : null;
    const pedacos: Blob[] = [];
    const gravar = async (a: ArquivoSaida, bytes: Uint8Array) => {
      if (pasta) await gravarNaPasta(pasta, a.pastas, a.nome, comoBlob(bytes));
      else if (zip) pedacos.push(...zip.adicionar([...a.pastas, a.nome].join("/"), bytes).map((b) => comoBlob(b)));
      else baixarNoNavegador(a.nome, comoBlob(bytes));
    };
    const semSaida = new Set<string>();
    const atual = logado?.entidade ?? null;
    let parar = false;
    for (const a of plano) {
      if (parar) break;
      const uniao = a.partes.length > 1 ? await novaUniao() : null;
      for (const t of a.partes) {
        marcar(t.chave, { estado: "baixando" });
        const r = await emitirNaEntidade(t, semSaida, atual);
        if (!r.pdf) {
          const erro = r.erro ?? "Falha ao emitir.";
          // Falha do AMBIENTE (extensão/aba/sessão): os demais falhariam igual — para o lote (o que já veio é salvo).
          if (r.ambiente) {
            setLinhas((ls) => ls.map((x) => (x.estado === "fila" || x.chave === t.chave ? { ...x, estado: "falha", erro } : x)));
            void verificar();
            parar = true;
            break;
          }
          marcar(t.chave, { estado: "falha", erro, amostra: r.amostra });
          continue;
        }
        try {
          if (uniao) await uniao.adicionar(r.pdf);
          else await gravar(a, r.pdf);
          marcar(t.chave, { estado: "ok", entidade: r.entidade });
        } catch {
          marcar(t.chave, { estado: "falha", erro: uniao ? "PDF ilegível — não entrou no arquivo unido." : "Não consegui gravar — escolha a pasta de novo." });
        }
      }
      if (uniao && !uniao.vazio) {
        try {
          await gravar(a, await uniao.salvar());
        } catch {
          setLinhas((ls) => ls.map((x) => (a.partes.some((p) => p.chave === x.chave) && x.estado === "ok" ? { ...x, estado: "falha", erro: "Não consegui gravar o PDF unido." } : x)));
        }
      }
    }
    if (zip && !zip.vazio) {
      pedacos.push(...zip.fechar().map((b) => comoBlob(b)));
      const raiz = new Set(plano.map((a) => a.pastas[0] ?? ""));
      const nome = raiz.size === 1 && [...raiz][0] ? [...raiz][0] : `DFDs Centi - ${hojeBR()}`;
      baixarNoNavegador(`${nomeSeguro(nome)}.zip`, new Blob(pedacos, { type: "application/zip" }));
    }
    setRodando(false);
  }

  const feitos = linhas.filter((l) => l.estado === "ok" || l.estado === "falha").length;
  const falhas = linhas.filter((l) => l.estado === "falha").length;
  const atualizada = !!ext && versaoAtende(ext.versao);
  const pronto = atualizada && !!logado?.ok && !!logado.logado;
  const grupos = useMemo(() => {
    const m = new Map<string, Linha[]>();
    for (const l of linhas) m.set(l.grupo, [...(m.get(l.grupo) ?? []), l]);
    return [...m.entries()];
  }, [linhas]);
  const destino = pasta
    ? `Na pasta “${pasta.name}”.`
    : arquivos.length > 1 || arquivos[0]?.pastas.length
      ? "Sem pasta escolhida: vai para Downloads num .zip com as pastas montadas."
      : "Sem pasta escolhida: vai para Downloads.";

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center gap-2">
        <IconRobo className="h-5 w-5 text-muted" />
        <h1 className="text-lg font-bold text-text">Automação</h1>
        <Ajuda titulo="Automação — baixar DFDs da Centi">
          <p>
            A extensão do Chrome repete, na Centi, o caminho Planejamento → Operações → Emitir DFD → Processar para cada
            planejamento, usando o login que você já fez na Centi. Nada entra na Mesa e nada é gravado na Centi: não vincula
            ao protocolo, não assina e não envia e-mail.
          </p>
          <p>
            <strong>Por protocolo:</strong> marque um ou vários protocolos. Cada um vira a pasta “Nº do protocolo - SIGLA - PCA
            ano” (dentro de “PCA ano”, se ligado) com os PDFs “Planejamento P - DFD N - PCA ano”. DFD sem nº de planejamento é
            pulado e avisado. <strong>Por Id:</strong> digite os nºs de planejamento separados por “:”.
          </p>
          <p>
            <strong>Saída:</strong> PDFs separados, um PDF unido por protocolo ou um PDF único com tudo; a ordem pode seguir o
            nº de planejamento. Sem escolher pasta, vai para Downloads (vários arquivos num .zip com as pastas).
          </p>
          <p>
            <strong>Entidade (órgão):</strong> cada DFD é emitido na entidade da Centi do órgão dele. Sem a entidade cadastrada,
            usa a aberta na Centi e, se o DFD não estiver nela, tenta as outras e lembra a que deu certo para o órgão. Também
            dá para informar à mão: abra a entidade na Centi, clique em Verificar e use “Usar a aberta” no órgão.
          </p>
        </Ajuda>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {ext ? <Badge tone="emerald" dot>Extensão v{ext.versao}</Badge> : <Badge tone="amber" dot>Extensão não encontrada</Badge>}
          {atualizada &&
            (logado?.ok && logado.logado ? (
              <Badge tone="emerald" dot>
                Centi logada{logado.entidade ? ` · entidade ${logado.entidade}` : ""}
              </Badge>
            ) : (
              <Badge tone="amber" dot>{logado?.erro ?? "Centi sem login"}</Badge>
            ))}
          <Button size="sm" variant="secondary" onClick={() => (ext ? void verificar() : window.location.reload())}>
            <IconRefresh className="h-4 w-4" /> Verificar
          </Button>
          <Button size="sm" variant={ext && atualizada ? "secondary" : "primary"} onClick={baixarExtensao} title={`Baixar a extensão ${VERSAO_EXTENSAO_CENTI} (com a logo do sistema)`}>
            <IconDownload className="h-4 w-4" /> Baixar extensão {VERSAO_EXTENSAO_CENTI}
          </Button>
        </div>
      </div>

      {ext && !atualizada && (
        <Callout kind="warn">
          Atualize a extensão para a {VERSAO_EXTENSAO_CENTI} (traz a escolha da entidade da Centi por órgão): baixe o zip
          abaixo, substitua os arquivos da pasta e clique em ↻ no cartão dela em chrome://extensions.
        </Callout>
      )}
      {(!ext || !atualizada) && (
        <Callout kind="info">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Baixe a extensão:{" "}
              <a className="font-semibold text-accent underline" href={URL_EXTENSAO} download>
                extensao-centi-{VERSAO_EXTENSAO_CENTI}.zip
              </a>{" "}
              (ou “Baixar extensão” no topo) e descompacte numa pasta (na atualização, substitua os arquivos).
            </li>
            <li>No Chrome, abra chrome://extensions, ligue o Modo do desenvolvedor e clique em Carregar sem compactação → escolha a pasta (na atualização, clique em ↻ no cartão da extensão).</li>
            <li>Recarregue esta tela (F5). A aba da Centi NÃO precisa ser recarregada: a extensão entra nela sozinha e usa o login dela.</li>
          </ol>
        </Callout>
      )}

      <div
        ref={corpo}
        style={{ "--h-automacao": altura ? `${altura}px` : undefined } as React.CSSProperties}
        className="grid gap-[var(--gap-block)] xl:h-[var(--h-automacao)] xl:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div className="min-w-0 xl:min-h-0">
          <Secao
            titulo="Baixar DFDs"
            className="xl:h-full"
            acao={
              <Segmented<Modo>
                ariaLabel="Origem dos DFDs"
                value={modo}
                onChange={setModo}
                disabled={rodando}
                options={[
                  { value: "protocolo", label: "Por protocolo" },
                  { value: "ids", label: "Por Id" },
                ]}
              />
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              {podePasta && (
                <Button variant="secondary" onClick={escolherPasta} disabled={rodando}>
                  <IconPastaAberta className="h-4 w-4" /> {pasta ? `Pasta: ${pasta.name}` : "Escolher pasta"}
                </Button>
              )}
              {pasta && (
                <Button variant="ghost" size="sm" onClick={() => setPasta(null)} disabled={rodando}>
                  Usar Downloads
                </Button>
              )}
              <Button onClick={baixar} loading={rodando} disabled={!pronto || !totalDfds}>
                <IconDownload className="h-4 w-4" />
                {modo === "protocolo" ? `Baixar ${escolhidos.length} protocolo(s) · ${totalDfds} DFD(s)` : `Baixar ${totalDfds || ""}`}
              </Button>
              <span className="text-sm text-muted">
                {destino} {arquivos.length > 0 && `${arquivos.length} arquivo(s).`}
              </span>
            </div>
            {modo === "protocolo" ? (
              <>
                {doProtocolo.semPlanejamento.length > 0 && (
                  <Callout kind="warn">
                    {doProtocolo.semPlanejamento.length} DFD(s) sem nº de planejamento serão pulados:{" "}
                    {doProtocolo.semPlanejamento
                      .slice(0, 12)
                      .map((x) => `DFD ${x.dfd} (${x.protocolo})`)
                      .join(", ")}
                    {doProtocolo.semPlanejamento.length > 12 ? "…" : ""}
                  </Callout>
                )}
                <DataTable
                  columns={COLUNAS}
                  rows={protocolos}
                  getKey={(p) => p.id}
                  selectable
                  selected={sel}
                  onSelected={setSel}
                  density="compact"
                  scrollInterno
                  reservaInferior={RESERVA_SECAO}
                  vazio="Nenhum protocolo no sistema."
                  resumo={(ls) => `${ls.length} protocolo(s) · ${ls.reduce((s, p) => s + p.dfds.length, 0)} DFD(s)`}
                />
              </>
            ) : (
              <TextField
                label="Ids do planejamento"
                placeholder="1154:1155:1160"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                hint={`${ids.length} Id(s)${excedente ? ` — só os ${MAX_IDS_CENTI} primeiros (${excedente} a mais)` : ""} · separe por ":" (o formato do "Copiar planejamentos")`}
              />
            )}

          </Secao>
        </div>

        <div className="space-y-[var(--gap-block)] xl:min-h-0 xl:overflow-y-auto xl:pr-1">
          {linhas.length > 0 && (
            <Secao titulo="Andamento">
              <Progress value={(feitos / linhas.length) * 100} label={`${feitos} de ${linhas.length}${falhas ? ` · ${falhas} com falha` : ""}`} />
              <ul className="max-h-[50vh] space-y-3 overflow-y-auto xl:max-h-none">
                {grupos.map(([g, ls]) => {
                  const ok = ls.filter((l) => l.estado === "ok").length;
                  const visiveis = ls.filter((l) => l.estado === "baixando" || l.estado === "falha");
                  return (
                    <li key={g} className="space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <IconPasta className="h-4 w-4 shrink-0 text-muted" />
                        <span className="min-w-0 flex-1 truncate font-semibold text-text" title={g || "Planejamentos"}>
                          {g || "Planejamentos"}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted">
                          {ok}/{ls.length}
                        </span>
                      </div>
                      {visiveis.map((l) => (
                        <div key={l.chave} className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-sm">
                          <span className="font-medium text-text">Planej. {l.id}</span>
                          <EstadoPonto cor={COR[l.estado]} rotulo={ROTULO[l.estado]} />
                          {l.erro && <span className="text-muted">{l.erro}</span>}
                          {l.amostra && <code className="w-full break-all rounded bg-surface-2 p-2 text-[12px] text-text-2">{l.amostra}</code>}
                        </div>
                      ))}
                    </li>
                  );
                })}
              </ul>
            </Secao>
          )}
          <Secao titulo="Saída">
            <div className="space-y-1">
              <span className="text-sm font-medium text-text-2">PDFs</span>
              <Segmented<FormatoSaida> ariaLabel="Formato da saída" value={saida.formato} onChange={(v) => mudarSaida({ formato: v })} disabled={rodando} options={FORMATOS} />
            </div>
            <div className="grid gap-3">
              <Switch checked={saida.pastaPca} onChange={(v) => mudarSaida({ pastaPca: v })} label="Criar a pasta “PCA ano” e salvar dentro" />
              <Switch checked={saida.ordenarPlanejamento} onChange={(v) => mudarSaida({ ordenarPlanejamento: v })} label="Ordenar pelo nº de planejamento" />
            </div>
          </Secao>

          <Secao titulo="Opções da emissão">
            <div className="grid gap-3">
              <Switch checked={cfg.valorReferencia} onChange={(v) => mudar({ valorReferencia: v })} label="Emitir valor de referência" />
              <Switch checked={cfg.emitirData} onChange={(v) => mudar({ emitirData: v })} label="Emitir data" />
            </div>
            <Callout kind="ok">Sempre: saída em PDF, sem vincular ao protocolo, sem assinar, sem enviar e-mail, sem processar em segundo plano.</Callout>
            <details className="text-sm text-muted">
              <summary className="cursor-pointer select-none py-2">Avançado (identificação da operação na Centi)</summary>
              <div className="grid gap-3 pt-2">
                <TextField label="Modelo de assinatura do DFD" value={cfg.assinaturaDfd} inputMode="numeric" onChange={(e) => mudar({ assinaturaDfd: e.target.value })} />
                <TextField label="ModuleKey" value={String(cfg.moduleKey)} inputMode="numeric" onChange={(e) => mudar({ moduleKey: Number(e.target.value) })} />
                <TextField label="Guid da operação" value={cfg.guid} onChange={(e) => mudar({ guid: e.target.value })} />
              </div>
            </details>
          </Secao>

          <Secao titulo="Entidade da Centi por órgão">
            <Switch checked={cfg.descobrirEntidade} onChange={(v) => mudar({ descobrirEntidade: v })} label="Descobrir sozinho (tenta as outras entidades)" />
            <TextField
              label="Entidades a tentar"
              placeholder="02:03:04:05:06:07:08"
              value={cfg.entidades}
              onChange={(e) => mudar({ entidades: e.target.value })}
              hint={`Vazio = de 1 a 20 no formato da aberta${logado?.entidade ? ` (aberta agora: ${logado.entidade})` : ""}.`}
            />
            {orgaos.length > 0 && (
              <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                {orgaos.map(([chave, o]) => (
                  <li key={chave} className="flex items-center gap-2 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate text-text" title={`${o.nome} · ${o.n} DFD(s)`}>
                      {o.nome}
                    </span>
                    <input
                      aria-label={`Entidade da Centi de ${o.nome}`}
                      className={`${cellCls} w-16 shrink-0 text-center`}
                      placeholder="auto"
                      defaultValue={mapa[chave] ?? ""}
                      key={mapa[chave] ?? ""}
                      onBlur={(e) => definirEntidade(chave, e.target.value)}
                    />
                    {logado?.entidade && mapa[chave] !== logado.entidade && (
                      <Button size="xs" variant="ghost" onClick={() => definirEntidade(chave, logado.entidade ?? "")} title="Usar a entidade aberta na Centi agora">
                        Usar {logado.entidade}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Secao>
        </div>
      </div>
    </div>
  );
}
