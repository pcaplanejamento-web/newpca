"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type AlvoCenti,
  type ArquivoSaida,
  analisarRespostaCenti,
  CONFIG_CENTI_PADRAO,
  type ConfigCenti,
  caminhosDoArquivo,
  candidatosEntidade,
  conferirConteudoDfd,
  type DestinoSaida,
  descricaoDoArquivo,
  ehPdf,
  type FormatoSaida,
  lerAlvoCenti,
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
  paraBase64,
  pedidoEmitirDfd,
  planoDosIds,
  planoDosProtocolos,
  type TarefaCenti,
  VERSAO_EXTENSAO_CENTI,
  versaoAtende,
} from "@/lib/automacao-centi-core";
import { brl, dataHoraBR, numeroSemAno } from "@/lib/format";
import { ZipArmazenar } from "@/lib/zip-armazenar";
import { Ajuda } from "./Ajuda";
import { useAlturaTela } from "./AlturaCheia";
import { Badge } from "./Badge";
import { type AberturaMesa, BannersMesa } from "./BannersMesa";
import { CelulaCopiavel } from "./BotaoCopiar";
import { Button } from "./Button";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { Dropdown } from "./Dropdown";
import { EstadoPonto } from "./EstadoCelula";
import { TextField } from "./Field";
import { cellCls } from "./formStyles";
import { IconDownload, IconPasta, IconPastaAberta, IconRefresh, IconRobo, IconSettings } from "./icons";
import { Progress } from "./Progress";
import { Segmented } from "./Segmented";
import { Switch } from "./Switch";

// Tela AUTOMAÇÃO (só ADM): baixa DFDs da Centi ("Emitir DFD" do CM002 Planejamento) por PROTOCOLO do sistema (uma pasta
// por protocolo, dentro da pasta "PCA <ano>") ou por Id. Quem fala com a Centi é a EXTENSÃO do Chrome (extensao-centi/),
// usando a sessão da Centi já aberta — nenhuma senha fica no sistema. Destino: uma PASTA (Downloads ou a escolhida) ou
// ANEXAR os PDFs a um PROTOCOLO da Centi informado pelo ADM (Id + nº): a única gravação na Centi, montada e travada na
// extensão (abre o protocolo, confere Id + nº, acrescenta UM documento, não repete a mesma descrição).
// Cada DFD é emitido na ENTIDADE da Centi do órgão dele e CONFERIDO (é um PDF, traz o planejamento e o DFD pedidos, a
// gravação bateu o tamanho) antes de contar como salvo.

const CHAVE_CONFIG = "automacao:centi";
const CHAVE_SAIDA = "automacao:centi-saida";
const CHAVE_ENTIDADES = "automacao:centi-entidades";
const CHAVE_ALVO = "automacao:centi-protocolo";

/** O resumo do protocolo da Centi (o "Conferir"). */
type ProtocoloCenti = { id: string; numero: string; ano: string; assunto: string; interessado: string; descricao: string; documentos: number };
type Resposta = {
  ok: boolean;
  erro?: string;
  logado?: boolean;
  entidade?: string | null;
  status?: number;
  b64?: string;
  protocolo?: ProtocoloCenti;
  jaAnexado?: boolean;
  sequencial?: string;
};
type TextoAlvo = { id: string; numero: string };
const lerTextoAlvo = (v: unknown): TextoAlvo => {
  const o = (v && typeof v === "object" ? v : {}) as Partial<Record<keyof TextoAlvo, unknown>>;
  return { id: typeof o.id === "string" ? o.id.slice(0, 20) : "", numero: typeof o.numero === "string" ? o.numero.slice(0, 20) : "" };
};
type Estado = "fila" | "baixando" | "ok" | "falha" | "pulado" | "repetido";
type Linha = TarefaCenti & { estado: Estado; erro?: string; amostra?: string; entidade?: string };
type Modo = "protocolo" | "ids";
type Ext = { versao: string } | null;
/** O contexto dos BANNERS da Mesa (o protocolo aberto pela linha): o mesmo da Mesa (`contextoBanners`). */
export type ContextoBannersAutomacao = Pick<Parameters<typeof BannersMesa>[0], "pode" | "reparticoes" | "regras" | "orgaos" | "pcas">;

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

type Arquivo = { getFile: () => Promise<Blob>; createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }> };
type Pasta = {
  getFileHandle: (n: string, o: { create: boolean }) => Promise<Arquivo>;
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

/** Grava na pasta escolhida, criando as subpastas (PCA <ano> / protocolo) na 1ª vez, e CONFERE o tamanho gravado. */
async function gravarNaPasta(pasta: Pasta, pastas: string[], nome: string, blob: Blob) {
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
  const { abrirPdf } = await import("@/lib/parse-dfd-pdf");
  const doc = await abrirPdf(new File([bytes as Uint8Array<ArrayBuffer>], "dfd.pdf", { type: "application/pdf" }));
  try {
    const partes: string[] = [];
    for (let p = 1; p <= Math.min(2, doc.numPages); p++) partes.push((await doc.pageItems(p)).map((i) => i.str).join(" "));
    return partes.join(" ");
  } finally {
    await doc.destroy();
  }
}

/** Une PDFs na ordem (pdf-lib, carregado só aqui) e confere as páginas no fim. */
async function novaUniao() {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  let n = 0;
  let paginas = 0;
  return {
    async adicionar(b: Uint8Array) {
      const d = await PDFDocument.load(b, { ignoreEncryption: true });
      for (const pg of await doc.copyPages(d, d.getPageIndices())) doc.addPage(pg);
      paginas += d.getPageCount();
      n++;
    },
    get vazio() {
      return n === 0;
    },
    async salvar() {
      if (doc.getPageCount() !== paginas) throw new Error("páginas");
      return doc.save();
    },
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

const URL_EXTENSAO = "/api/admin/automacao/extensao";
const baixarExtensao = () => {
  window.location.href = URL_EXTENSAO;
};

const hojeBR = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
};

const COR: Record<Estado, string> = { fila: "var(--muted)", baixando: "var(--info)", ok: "var(--ok)", falha: "var(--danger)", pulado: "var(--warn)", repetido: "var(--warn)" };
const ROTULO: Record<Estado, string> = { fila: "Na fila", baixando: "Baixando…", ok: "Salvo", falha: "Falhou", pulado: "Sem planejamento", repetido: "Não baixado" };
const DESTINOS: { value: DestinoSaida; label: string }[] = [
  { value: "pasta", label: "Pasta" },
  { value: "protocolo", label: "Protocolo da Centi" },
];
const mesmasChaves = (a: Linha[], b: Linha[]) => a.length === b.length && a.every((l, i) => l.chave === b[i].chave);
const CARTAO = "rounded-card border border-border bg-surface shadow-ring";

const semPlan = (p: ProtocoloAutomacao) => p.dfds.filter((d) => !/[1-9]/.test(d.planejamento ?? "")).length;
const texto1 = (v: string | null) => (
  <span className="line-clamp-1" title={v ?? ""}>
    {v || "—"}
  </span>
);

const COLUNAS: Column<ProtocoloAutomacao>[] = [
  {
    key: "numero",
    header: "Nº protocolo",
    nowrap: true,
    value: (p) => p.numero,
    render: (p) => (
      <CelulaCopiavel copiar={numeroSemAno(p.numero)} rotulo="nº do protocolo">
        <span className="font-semibold text-text">{p.numero}</span>
      </CelulaCopiavel>
    ),
  },
  {
    key: "id",
    header: "Id",
    nowrap: true,
    value: (p) => p.idExterno ?? "—",
    render: (p) => <CelulaCopiavel copiar={p.idExterno} rotulo="Id do protocolo">{p.idExterno ?? "—"}</CelulaCopiavel>,
  },
  { key: "data", header: "Data", nowrap: true, value: (p) => dataHoraBR(p.criadoEm), render: (p) => dataHoraBR(p.criadoEm) || "—" },
  { key: "sigla", header: "Sigla", nowrap: true, value: (p) => p.sigla ?? "—", render: (p) => p.sigla ?? "—" },
  { key: "assunto", header: "Assunto", minWidth: 180, align: "left", value: (p) => p.assunto ?? "—", render: (p) => texto1(p.assunto) },
  { key: "interessado", header: "Interessado", minWidth: 220, align: "left", value: (p) => p.interessado ?? "—", render: (p) => texto1(p.interessado) },
  { key: "pca", header: "PCA", nowrap: true, value: (p) => (p.anoPca ? String(p.anoPca) : "—"), render: (p) => (p.anoPca ? String(p.anoPca) : "—") },
  { key: "local", header: "Local", nowrap: true, value: (p) => p.pca ?? "Mesa do sistema", render: (p) => p.pca ?? "Mesa do sistema" },
  {
    key: "dfds",
    header: "DFDs",
    nowrap: true,
    filter: "range",
    numero: (p) => p.dfds.length,
    formatarFaixa: (n) => String(n),
    value: (p) => String(p.dfds.length),
    render: (p) => <span className="tabular-nums">{p.dfds.length}</span>,
  },
  {
    key: "semplan",
    header: "Sem planej.",
    nowrap: true,
    value: (p) => (semPlan(p) ? "Com DFD sem planejamento" : "Todos com planejamento"),
    render: (p) => (semPlan(p) ? <span className="font-semibold text-[var(--warn)]">{semPlan(p)}</span> : <span className="text-muted">0</span>),
  },
  {
    key: "itens",
    header: "Itens",
    nowrap: true,
    filter: "range",
    numero: (p) => p.itens,
    formatarFaixa: (n) => String(n),
    value: (p) => String(p.itens),
    render: (p) => <span className="tabular-nums">{p.itens}</span>,
  },
  {
    key: "valor",
    header: "Valor",
    nowrap: true,
    align: "right",
    filter: "range",
    numero: (p) => p.valor,
    value: (p) => brl(p.valor),
    render: (p) => <span className="tabular-nums">{brl(p.valor)}</span>,
  },
];

const FORMATOS: { value: FormatoSaida; label: string }[] = [
  { value: "separados", label: "Separados" },
  { value: "protocolo", label: "Protocolo" },
  { value: "unidade", label: "Unidade" },
  { value: "unico", label: "Único" },
];

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 border-b border-border px-1 pb-3 last:border-0 last:pb-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{titulo}</p>
      {children}
    </div>
  );
}

/** Os AJUSTES (o dropdown do botão "Ajustes"): saída, emissão e entidade da Centi por órgão. */
function Ajustes({
  saida,
  onSaida,
  cfg,
  onCfg,
  orgaos,
  mapa,
  onEntidade,
  aberta,
  alvo,
  onAlvo,
  conferir,
  conferencia,
}: {
  saida: OpcoesSaida;
  onSaida: (p: Partial<OpcoesSaida>) => void;
  cfg: ConfigCenti;
  onCfg: (p: Partial<ConfigCenti>) => void;
  orgaos: [string, { nome: string; n: number }][];
  mapa: Record<string, string>;
  onEntidade: (orgao: string, entidade: string) => void;
  aberta: string | null;
  alvo: TextoAlvo;
  onAlvo: (p: Partial<TextoAlvo>) => void;
  conferir: () => void;
  conferencia: { carregando?: boolean; protocolo?: ProtocoloCenti; erro?: string } | null;
}) {
  return (
    <div className="space-y-3 p-1">
      <Grupo titulo="Destino">
        <Segmented<DestinoSaida> ariaLabel="Destino dos PDFs" value={saida.destino} onChange={(v) => onSaida({ destino: v })} options={DESTINOS} className="w-full" />
        {saida.destino === "pasta" ? (
          <>
            <Switch checked={saida.pastaPca} onChange={(v) => onSaida({ pastaPca: v })} label="Pasta “PCA ano”" />
            <Switch checked={saida.escolherPasta} onChange={(v) => onSaida({ escolherPasta: v })} label="Escolher a pasta de destino" />
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Id do protocolo" placeholder="2332778" inputMode="numeric" value={alvo.id} onChange={(e) => onAlvo({ id: e.target.value })} />
              <TextField label="Nº do protocolo" placeholder="156844/2026" value={alvo.numero} onChange={(e) => onAlvo({ numero: e.target.value })} />
            </div>
            <TextField
              label="Tipo do documento"
              inputMode="numeric"
              value={saida.tipoDocumento}
              onChange={(e) => onSaida({ tipoDocumento: e.target.value.replace(/\D/g, "") || saida.tipoDocumento })}
            />
            <div className="flex items-start gap-2">
              <Button size="sm" variant="secondary" onClick={conferir} loading={conferencia?.carregando}>
                Conferir na Centi
              </Button>
              {conferencia?.protocolo ? (
                <p className="min-w-0 flex-1 text-xs text-[var(--ok)]">
                  {conferencia.protocolo.numero}/{conferencia.protocolo.ano} · {conferencia.protocolo.assunto || conferencia.protocolo.descricao} ·{" "}
                  {conferencia.protocolo.documentos} documento(s)
                </p>
              ) : conferencia?.erro ? (
                <p className="min-w-0 flex-1 text-xs text-[var(--danger)]">{conferencia.erro}</p>
              ) : null}
            </div>
          </>
        )}
      </Grupo>
      <Grupo titulo="PDFs">
        <Segmented<FormatoSaida> ariaLabel="PDFs" value={saida.formato} onChange={(v) => onSaida({ formato: v })} options={FORMATOS} className="w-full" />
        <Switch checked={saida.ordenarPlanejamento} onChange={(v) => onSaida({ ordenarPlanejamento: v })} label="Ordenar pelo planejamento" />
        <Switch checked={saida.conferir} onChange={(v) => onSaida({ conferir: v })} label="Conferir o conteúdo de cada PDF" />
      </Grupo>
      <Grupo titulo="Emissão">
        <Switch checked={cfg.valorReferencia} onChange={(v) => onCfg({ valorReferencia: v })} label="Emitir valor de referência" />
        <Switch checked={cfg.emitirData} onChange={(v) => onCfg({ emitirData: v })} label="Emitir data" />
      </Grupo>
      <Grupo titulo="Entidade da Centi por órgão">
        <Switch checked={cfg.descobrirEntidade} onChange={(v) => onCfg({ descobrirEntidade: v })} label="Descobrir sozinho" />
        <TextField label="Entidades a tentar" placeholder={aberta ? `vazio = 0 a 28 (aberta: ${aberta})` : "02:03:04"} value={cfg.entidades} onChange={(e) => onCfg({ entidades: e.target.value })} />
        {orgaos.length > 0 && (
          <ul className="max-h-56 divide-y divide-border overflow-y-auto">
            {orgaos.map(([chave, o]) => (
              <li key={chave} className="flex items-center gap-2 py-1 text-sm">
                <span className="min-w-0 flex-1 truncate text-text" title={`${o.nome} · ${o.n} DFD(s)`}>
                  {o.nome}
                </span>
                <input
                  aria-label={`Entidade da Centi de ${o.nome}`}
                  className={`${cellCls} w-16 shrink-0 text-center`}
                  placeholder="auto"
                  defaultValue={mapa[chave] ?? ""}
                  key={mapa[chave] ?? ""}
                  onBlur={(e) => onEntidade(chave, e.target.value)}
                />
                {aberta && mapa[chave] !== aberta && (
                  <Button size="xs" variant="ghost" onClick={() => onEntidade(chave, aberta)} title="Usar a entidade aberta na Centi agora">
                    {aberta}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Grupo>
      <Grupo titulo="Avançado">
        <TextField label="Modelo de assinatura do DFD" value={cfg.assinaturaDfd} inputMode="numeric" onChange={(e) => onCfg({ assinaturaDfd: e.target.value })} />
        <TextField label="ModuleKey" value={String(cfg.moduleKey)} inputMode="numeric" onChange={(e) => onCfg({ moduleKey: Number(e.target.value) })} />
        <TextField label="Guid da operação" value={cfg.guid} onChange={(e) => onCfg({ guid: e.target.value })} />
      </Grupo>
    </div>
  );
}

/** A ANÁLISE ao lado: cada DFD do que vai ser baixado (por pasta), com o estado — antes, durante e depois. */
function Analise({ linhas, rodando, destino }: { linhas: Linha[]; rodando: boolean; destino: string | null }) {
  const rotuloOk = destino ? "Anexado" : ROTULO.ok;
  const grupos = useMemo(() => {
    const m = new Map<string, Linha[]>();
    for (const l of linhas) m.set(l.grupo, [...(m.get(l.grupo) ?? []), l]);
    return [...m.entries()];
  }, [linhas]);
  const validas = linhas.filter((l) => l.estado !== "pulado" && l.estado !== "repetido");
  const feitos = validas.filter((l) => l.estado === "ok" || l.estado === "falha").length;
  const ok = validas.filter((l) => l.estado === "ok").length;
  const falhas = validas.length - ok - validas.filter((l) => l.estado === "fila" || l.estado === "baixando").length;
  return (
    <section className={`${CARTAO} flex min-h-0 flex-col gap-2 p-[var(--pad-card)] max-xl:max-h-[70vh]`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="min-w-0 truncate font-bold text-text" title={destino ?? undefined}>
          Análise{destino ? ` · ${destino}` : ""}
        </h2>
        <span className="text-sm tabular-nums text-muted">
          {validas.length} DFD(s){falhas ? ` · ${falhas} falha(s)` : ""}
        </span>
      </div>
      {(rodando || feitos > 0) && (
        <Progress value={validas.length ? (feitos / validas.length) * 100 : 0} label={`${ok} ${destino ? "anexado(s)" : "salvo(s)"} de ${validas.length}`} />
      )}
      {linhas.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Nada escolhido.</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {grupos.map(([g, ls]) => (
            <li key={g} className="space-y-1">
              {g && (
                <div className="flex items-center gap-2 text-sm">
                  <IconPasta className="h-4 w-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate font-semibold text-text" title={g}>
                    {g}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {ls.filter((l) => l.estado === "ok").length}/{ls.filter((l) => l.estado !== "pulado" && l.estado !== "repetido").length}
                  </span>
                </div>
              )}
              {ls.map((l) => (
                <div key={l.chave} className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm ${g ? "pl-6" : ""}`}>
                  <span className="font-medium tabular-nums text-text">{l.id ? `Planej. ${l.id}` : "—"}</span>
                  {l.dfd && <span className="tabular-nums text-muted">DFD {l.dfd}</span>}
                  {l.orgaoNome && (
                    <span className="min-w-0 max-w-40 truncate text-xs text-muted" title={l.orgaoNome}>
                      {l.orgaoNome}
                      {l.entidade ? ` · ${l.entidade}` : ""}
                    </span>
                  )}
                  <span className="ml-auto">
                    <EstadoPonto cor={COR[l.estado]} rotulo={l.estado === "ok" ? rotuloOk : ROTULO[l.estado]} />
                  </span>
                  {l.erro && <span className="w-full text-xs text-muted">{l.erro}</span>}
                  {l.amostra && <code className="w-full break-all rounded bg-surface-2 p-2 text-[12px] text-text-2">{l.amostra}</code>}
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AutomacaoAdmin({ protocolos, banners }: { protocolos: ProtocoloAutomacao[]; banners: ContextoBannersAutomacao }) {
  const router = useRouter();
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
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [rodando, setRodando] = useState(false);
  const [aberto, setAberto] = useState<AberturaMesa | null>(null);
  const [podePasta, setPodePasta] = useState(false);
  const [alvoTexto, setAlvoTexto] = useState<TextoAlvo>({ id: "", numero: "" });
  const [conferencia, setConferencia] = useState<{ carregando?: boolean; protocolo?: ProtocoloCenti; erro?: string } | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();
  // No desktop a tela cabe no display (sem rolar o navegador): a tabela e a análise vão até o fim e rolam por dentro.
  const corpo = useRef<HTMLDivElement>(null);
  const altura = useAlturaTela(corpo, 420);

  useEffect(() => {
    setPodePasta("showDirectoryPicker" in window);
    setCfg(lerLocal(CHAVE_CONFIG, lerConfigCenti, CONFIG_CENTI_PADRAO));
    setSaida(lerLocal(CHAVE_SAIDA, lerOpcoesSaida, OPCOES_SAIDA_PADRAO));
    setAlvoTexto(lerLocal(CHAVE_ALVO, lerTextoAlvo, { id: "", numero: "" }));
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
    if (!n.escolherPasta) setPasta(null);
  };
  const mudarAlvo = (p: Partial<TextoAlvo>) => {
    const n = { ...alvoTexto, ...p };
    setAlvoTexto(n);
    setConferencia(null);
    gravarLocal(CHAVE_ALVO, n);
  };
  const anexando = saida.destino === "protocolo";
  const lidoAlvo = lerAlvoCenti(alvoTexto.id, alvoTexto.numero);
  const alvo: AlvoCenti | null = "alvo" in lidoAlvo ? lidoAlvo.alvo : null;
  const rotuloAlvo = alvo ? `Protocolo ${alvo.numero}${alvo.ano ? `/${alvo.ano}` : ""}` : null;

  // Abre o protocolo na Centi (só leitura) e confere Id + nº — antes de anexar, e no "Conferir na Centi".
  const conferirAlvo = useCallback(
    async (a: AlvoCenti | null): Promise<ProtocoloCenti | string> => {
      if (!a) return "erro" in lidoAlvo ? lidoAlvo.erro : "Informe o protocolo.";
      const r = await pedir("protocolo", a, 60_000);
      return r.ok && r.protocolo ? r.protocolo : (r.erro ?? "Não consegui abrir o protocolo na Centi.");
    },
    [pedir, lidoAlvo],
  );
  const conferirNaCenti = async () => {
    setConferencia({ carregando: true });
    const r = await conferirAlvo(alvo);
    setConferencia(typeof r === "string" ? { erro: r } : { protocolo: r });
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
  const doProtocolo = useMemo(() => planoDosProtocolos(escolhidos, saida), [escolhidos, saida]);
  const arquivos = useMemo(() => (modo === "protocolo" ? doProtocolo.arquivos : planoDosIds(ids, protocolos, saida)), [modo, doProtocolo, ids, protocolos, saida]);
  const totalDfds = arquivos.reduce((s, a) => s + a.partes.length, 0);
  // A análise antes de baixar: cada DFD do plano (na ordem) + os pulados por não terem planejamento.
  const previa = useMemo<Linha[]>(() => {
    const vistos = new Set<string>();
    const fila: Linha[] = [];
    for (const a of arquivos)
      for (const t of a.partes)
        if (!vistos.has(t.chave)) {
          vistos.add(t.chave);
          fila.push({ ...t, estado: "fila" });
        }
    if (modo === "protocolo")
      for (const x of doProtocolo.semPlanejamento)
        fila.push({ chave: `sem:${x.protocolo}:${x.dfd}`, id: "", dfd: x.dfd, orgao: null, orgaoNome: null, grupo: x.grupo, estado: "pulado" });
    if (modo === "protocolo")
      for (const x of doProtocolo.repetidos)
        fila.push({ chave: x.chave, id: x.id, dfd: x.dfd, orgao: null, orgaoNome: null, grupo: x.grupo, estado: "repetido", erro: x.motivo });
    return fila;
  }, [arquivos, modo, doProtocolo]);

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

  // Emite e CONFERE: o PDF tem de trazer o planejamento (e o DFD) pedidos — um PDF de outro DFD nunca é salvo.
  async function emitirConferido(t: TarefaCenti, entidade?: string): Promise<Emissao> {
    const r = await emitirUm(t.id, entidade);
    if (!r.pdf || !saida.conferir) return r;
    const erro = conferirConteudoDfd(await textoDoPdf(r.pdf).catch(() => ""), t);
    return erro ? { erro } : r;
  }

  // A ENTIDADE do DFD: a do órgão (mapa); sem ela, a aberta na Centi. Falhou e "descobrir" está ligado → tenta as outras
  // entidades e lembra a que deu certo para o órgão (os próximos DFDs dele vão direto).
  async function emitirNaEntidade(t: TarefaCenti, semSaida: Set<string>, atual: string | null): Promise<Emissao> {
    const mapeada = t.orgao ? mapaRef.current[t.orgao] : undefined;
    const r = await emitirConferido(t, mapeada);
    if (r.pdf) {
      if (t.orgao && !mapeada && atual) definirEntidade(t.orgao, atual);
      return { ...r, entidade: mapeada ?? atual ?? undefined };
    }
    if (r.ambiente || !cfg.descobrirEntidade || (t.orgao && semSaida.has(t.orgao))) return r;
    const ja = mapeada ?? atual;
    const tentar = [...new Set([...Object.values(mapaRef.current), ...candidatosEntidade(cfg.entidades, atual)])].filter((e) => e !== ja);
    for (const e of tentar) {
      const x = await emitirConferido(t, e);
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
    const plano = arquivos;
    const tipo = saida.tipoDocumento;
    if (anexando) {
      if (!alvo) return;
      const n = plano.length;
      const ok = await confirmar({
        titulo: `Anexar ${n} PDF(s) ao ${rotuloAlvo} da Centi?`,
        texto: `Cada PDF entra como um documento novo (tipo ${tipo}), com a descrição igual ao nome do arquivo. O que já estiver lá com a mesma descrição não é anexado de novo.`,
        confirmar: "Anexar",
      });
      if (!ok) return;
    }
    setRodando(true);
    setLinhas(previa);
    const marcar = (chave: string, l: Partial<Linha>) => setLinhas((ls) => (ls ?? []).map((x) => (x.chave === chave ? { ...x, ...l } : x)));
    // Anexar: o protocolo é conferido ANTES de emitir qualquer DFD (Id + nº) — errado, nada é feito.
    if (anexando) {
      const p = await conferirAlvo(alvo);
      setConferencia(typeof p === "string" ? { erro: p } : { protocolo: p });
      if (typeof p === "string") {
        setLinhas(previa.map((x) => (x.estado === "fila" ? { ...x, estado: "falha", erro: p } : x)));
        setRodando(false);
        return;
      }
    }
    const destino = !anexando && saida.escolherPasta ? pasta : null;
    const zip = !anexando && !destino && (plano.length > 1 || plano[0].pastas.length > 0) ? new ZipArmazenar() : null;
    const pedacos: Blob[] = [];
    // Devolve a nota da linha (o anexo: o nº do documento na Centi). Falha → lança com o motivo.
    const gravar = async (a: ArquivoSaida, bytes: Uint8Array): Promise<string | undefined> => {
      if (anexando && alvo) {
        const r = await pedir(
          "anexar",
          { ...alvo, tipo, descricao: descricaoDoArquivo(a.nome), arquivo: a.nome, pdf: paraBase64(bytes) },
          320_000,
        );
        if (!r.ok) throw new Error(r.erro ?? "A Centi não gravou.");
        return r.jaAnexado ? `Já estava no protocolo (documento ${r.sequencial}) — não anexado de novo.` : `Documento ${r.sequencial} do protocolo.`;
      }
      if (destino) await gravarNaPasta(destino, a.pastas, a.nome, comoBlob(bytes));
      else if (zip) pedacos.push(...zip.adicionar([...a.pastas, a.nome].join("/"), bytes).map((b) => comoBlob(b)));
      else baixarNoNavegador(a.nome, comoBlob(bytes));
      return undefined;
    };
    const falhaGravar = (e: unknown, unido: boolean) =>
      anexando && e instanceof Error
        ? e.message
        : unido
          ? "Não consegui gravar o PDF unido."
          : "Não consegui gravar (o tamanho não bateu) — escolha a pasta de novo.";
    const semSaida = new Set<string>();
    const atual = logado?.entidade ?? null;
    let parar = false;
    for (const a of plano) {
      if (parar) break;
      const uniao = a.partes.length > 1 ? await novaUniao() : null;
      const unidas: string[] = [];
      for (const t of a.partes) {
        marcar(t.chave, { estado: "baixando" });
        const r = await emitirNaEntidade(t, semSaida, atual);
        if (!r.pdf) {
          const erro = r.erro ?? "Falha ao emitir.";
          // Falha do AMBIENTE (extensão/aba/sessão): os demais falhariam igual — para o lote (o que já veio é salvo).
          if (r.ambiente) {
            setLinhas((ls) => (ls ?? []).map((x) => (x.estado === "fila" || x.chave === t.chave ? { ...x, estado: "falha", erro } : x)));
            void verificar();
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
          } else {
            const nota = await gravar(a, r.pdf);
            marcar(t.chave, { estado: "ok", entidade: r.entidade, erro: nota });
          }
        } catch (e) {
          marcar(t.chave, { estado: "falha", erro: uniao ? "PDF ilegível — não entrou no arquivo unido." : falhaGravar(e, false) });
        }
      }
      if (uniao && !uniao.vazio) {
        const res = await uniao
          .salvar()
          .then((b) => gravar(a, b))
          .then((nota) => ({ ok: true as const, nota }))
          .catch((e: unknown) => ({ ok: false as const, nota: falhaGravar(e, true) }));
        setLinhas((ls) =>
          (ls ?? []).map((x) => (unidas.includes(x.chave) ? { ...x, estado: res.ok ? "ok" : "falha", erro: res.nota } : x)),
        );
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

  const atualizada = !!ext && versaoAtende(ext.versao);
  const pronto = atualizada && !!logado?.ok && !!logado.logado;
  const precisaPasta = !anexando && saida.escolherPasta && podePasta;
  const semAlvo = anexando && !alvo;
  const desabilitado = !pronto || !totalDfds || (precisaPasta && !pasta) || semAlvo;
  const motivo = !atualizada
    ? "Instale a extensão (botão no topo)."
    : !pronto
      ? "Abra a Centi logada e clique em Verificar."
      : semAlvo
        ? "Informe o protocolo da Centi em Ajustes → Destino."
        : precisaPasta && !pasta
          ? "Escolha a pasta."
          : undefined;
  const verbo = anexando ? "Anexar" : "Baixar";
  // A análise mostra o plano até a 1ª execução; depois, o resultado (mudou a escolha, volta ao plano).
  const vista = rodando || (linhas && mesmasChaves(linhas, previa)) ? (linhas ?? []) : previa;

  const acoes = (
    <>
      {precisaPasta && (
        <Button size="sm" variant="secondary" onClick={escolherPasta} disabled={rodando} title={pasta ? `Pasta: ${pasta.name}` : "Escolher a pasta de destino"}>
          <IconPastaAberta className="h-4 w-4" />
          <span className="max-w-40 truncate">{pasta ? pasta.name : "Pasta"}</span>
        </Button>
      )}
      <Button size="sm" onClick={baixar} loading={rodando} disabled={desabilitado} title={motivo}>
        <IconDownload className="h-4 w-4" />
        {modo === "protocolo" ? `${verbo} ${escolhidos.length} · ${totalDfds} DFD(s)` : `${verbo} ${totalDfds} DFD(s)`}
      </Button>
    </>
  );

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center gap-2">
        <IconRobo className="h-5 w-5 text-muted" />
        <h1 className="text-lg font-bold text-text">Automação</h1>
        <Ajuda titulo="Automação — baixar DFDs da Centi">
          <p>
            A extensão do Chrome repete, na Centi, Planejamento → Operações → Emitir DFD → Processar para cada planejamento,
            com o login já feito na Centi (aba aberta). Nada entra na Mesa; a emissão é sempre PDF, sem vincular
            ao protocolo, sem assinar, sem enviar e-mail, sem segundo plano.
          </p>
          <p>
            <strong>Destino:</strong> uma pasta (Downloads ou a escolhida) ou <strong>Protocolo da Centi</strong> — informe o Id
            (o “Id” do cadastro do protocolo na Centi, o mesmo da capa) e o nº (“156844” ou “156844/2026”). Cada PDF entra como
            um documento novo do tipo escolhido (padrão 1039 — DFD), com a descrição igual ao nome do arquivo. A extensão abre o
            protocolo, confere Id e nº (diferente = nada é gravado) e não anexa duas vezes a mesma descrição; se a Centi pedir
            uma confirmação, para e mostra a pergunta. Só isso é gravado na Centi.
          </p>
          <p>
            <strong>Instalar/atualizar a extensão:</strong> “Baixar extensão” → descompacte (na atualização, substitua os
            arquivos) → chrome://extensions → Modo do desenvolvedor → Carregar sem compactação (ou ↻ no cartão dela) → F5
            nesta tela. A aba da Centi não precisa ser recarregada. Cada versão nova avisa no sino.
          </p>
          <p>
            <strong>Por protocolo:</strong> marque um ou vários (tocar na linha abre o protocolo). Cada um vira a pasta “SIGLA - PCA
            ano - (nº) - ano” com os PDFs “Planejamento P - DFD N - PCA ano - (nº) - ano” — o protocolo sempre no fim (vários:
            “(1222, 2212) - 2026”). DFD sem nº de planejamento é pulado; cada planejamento é baixado UMA vez (a análise avisa
            o duplicado no protocolo e o que já veio de outro protocolo).
            <strong> Por Id:</strong> nºs de planejamento separados por “:” ({MAX_IDS_CENTI} no máximo).
          </p>
          <p>
            <strong>Ajustes:</strong> PDFs separados, unidos por protocolo, por unidade ou num único; pasta “PCA ano”; ordem pelo planejamento;
            escolher a pasta (desligado = Downloads, vários arquivos num .zip com as pastas); conferir cada PDF (precisa
            trazer o planejamento e o DFD pedidos, senão não é salvo).
          </p>
          <p>
            <strong>Entidade (órgão):</strong> cada DFD é emitido na entidade da Centi do órgão dele. Sem ela cadastrada, usa
            a aberta e, se o DFD não estiver nela, tenta as outras e lembra a que deu certo. À mão: abra a entidade na Centi,
            Verificar e toque no código ao lado do órgão.
          </p>
        </Ajuda>
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
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!ext ? (
            <Badge tone="amber" dot>
              Sem extensão
            </Badge>
          ) : !atualizada ? (
            <Badge tone="amber" dot>
              Extensão v{ext.versao} desatualizada
            </Badge>
          ) : logado?.ok && logado.logado ? (
            <Badge tone="emerald" dot>
              Centi logada{logado.entidade ? ` · ${logado.entidade}` : ""}
            </Badge>
          ) : (
            <Badge tone="amber" dot>
              {logado?.erro ?? "Centi sem login"}
            </Badge>
          )}
          <Button size="sm" variant="secondary" onClick={() => (ext ? void verificar() : window.location.reload())} title="Verificar a extensão e a Centi" aria-label="Verificar">
            <IconRefresh className="h-4 w-4" />
          </Button>
          <Button size="sm" variant={atualizada ? "secondary" : "primary"} onClick={baixarExtensao} title={`Baixar a extensão ${VERSAO_EXTENSAO_CENTI}`}>
            <IconDownload className="h-4 w-4" /> Extensão {VERSAO_EXTENSAO_CENTI}
          </Button>
          <Dropdown
            papel="dialog"
            ariaLabel="Ajustes"
            align="end"
            width={360}
            trigger={
              <span className="inline-flex h-11 items-center gap-2 rounded-control border border-border-2 bg-surface px-3 text-sm font-semibold text-text lg:h-[var(--h-control-sm)]">
                <IconSettings className="h-4 w-4" /> Ajustes
              </span>
            }
          >
            <Ajustes
              saida={saida}
              onSaida={mudarSaida}
              cfg={cfg}
              onCfg={mudar}
              orgaos={orgaos}
              mapa={mapa}
              onEntidade={definirEntidade}
              aberta={logado?.entidade ?? null}
              alvo={alvoTexto}
              onAlvo={mudarAlvo}
              conferir={conferirNaCenti}
              conferencia={conferencia}
            />
          </Dropdown>
        </div>
      </div>

      <div
        ref={corpo}
        style={{ "--h-automacao": altura ? `${altura}px` : undefined } as React.CSSProperties}
        className="grid gap-[var(--gap-block)] xl:h-[var(--h-automacao)] xl:grid-cols-[minmax(0,1fr)_24rem]"
      >
        <div className="min-w-0 xl:min-h-0">
          {modo === "protocolo" ? (
            <DataTable
              columns={COLUNAS}
              rows={protocolos}
              getKey={(p) => p.id}
              selectable
              selected={sel}
              onSelected={setSel}
              onRowClick={(p) => setAberto({ tipo: "protocolo", id: p.id })}
              activeKey={aberto?.tipo === "protocolo" ? aberto.id : null}
              density="compact"
              scrollInterno
              acoesRodape={acoes}
              vazio="Nenhum protocolo no sistema."
              resumo={(ls) =>
                `${ls.length} protocolo(s) · ${ls.reduce((s, p) => s + p.dfds.length, 0)} DFD(s) · ${brl(ls.reduce((s, p) => s + p.valor, 0))}`
              }
            />
          ) : (
            <section className={`${CARTAO} space-y-3 p-[var(--pad-card)]`}>
              <TextField
                label="Nºs de planejamento"
                placeholder="1154:1155:1160"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                error={excedente ? `Só os ${MAX_IDS_CENTI} primeiros (${excedente} a mais).` : undefined}
              />
              <div className="flex flex-wrap items-center justify-end gap-2">{acoes}</div>
            </section>
          )}
        </div>
        <Analise linhas={vista} rodando={rodando} destino={anexando ? (rotuloAlvo ?? "protocolo da Centi") : null} />
      </div>

      <BannersMesa
        abrir={aberto}
        onFechar={() => setAberto(null)}
        onAbrir={setAberto}
        pode={banners.pode}
        reparticoes={banners.reparticoes}
        reparticaoAtivaId={null}
        regras={banners.regras}
        orgaos={banners.orgaos}
        pcas={banners.pcas}
        onAlterado={() => router.refresh()}
      />
      {confirmacao}
    </div>
  );
}
