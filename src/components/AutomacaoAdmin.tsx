"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  analisarRespostaCenti,
  caminhosDoArquivo,
  type ConfigCenti,
  CONFIG_CENTI_PADRAO,
  ehPdf,
  lerConfigCenti,
  lerIdsCenti,
  linkDaResposta,
  MAX_IDS_CENTI,
  maiorVersao,
  pedidoEmitirDfd,
  type ProtocoloAutomacao,
  type TarefaCenti,
  tarefasDosIds,
  tarefasDosProtocolos,
  VERSAO_EXTENSAO_CENTI,
  versaoAtende,
} from "@/lib/automacao-centi-core";
import { Ajuda } from "./Ajuda";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { EstadoPonto } from "./EstadoCelula";
import { TextField } from "./Field";
import { IconDownload, IconPasta, IconPastaAberta, IconRefresh, IconRobo } from "./icons";
import { Progress } from "./Progress";
import { Segmented } from "./Segmented";
import { Switch } from "./Switch";

// Tela AUTOMAÇÃO (só ADM): baixa DFDs da Centi ("Emitir DFD" do CM002 Planejamento) para uma pasta escolhida. Quem fala
// com a Centi é a EXTENSÃO do Chrome (extensao-centi/, baixada aqui), usando a sessão da Centi já aberta no navegador —
// nenhuma senha fica no sistema e nada é gravado na Centi (as travas são forçadas também na extensão).

const CHAVE_CONFIG = "automacao:centi";

type Resposta = { ok: boolean; erro?: string; logado?: boolean; status?: number; b64?: string };
type Linha = TarefaCenti & { estado: "fila" | "baixando" | "ok" | "falha"; erro?: string; amostra?: string };
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

/** Grava na pasta escolhida (na SUBPASTA do protocolo, criada na 1ª vez); sem a escolha de pasta, vai para Downloads com
 * o nome da pasta à frente do arquivo. */
async function salvar(pasta: Pasta | null, sub: string | null, nome: string, blob: Blob) {
  if (pasta) {
    const destino = sub ? await pasta.getDirectoryHandle(sub, { create: true }) : pasta;
    const arq = await destino.getFileHandle(nome, { create: true });
    const w = await arq.createWritable();
    await w.write(blob);
    await w.close();
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = sub ? `${sub} - ${nome}` : nome;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

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

const pcaDe = (p: ProtocoloAutomacao) => (p.anoPca ? String(p.anoPca) : "—");
const semPlan = (p: ProtocoloAutomacao) => p.dfds.filter((d) => !(d.planejamento ?? "").replace(/\D/g, "")).length;

const COLUNAS: Column<ProtocoloAutomacao>[] = [
  { key: "numero", header: "Nº protocolo", nowrap: true, value: (p) => p.numero, render: (p) => <span className="font-semibold text-text">{p.numero}</span> },
  { key: "id", header: "Id", nowrap: true, value: (p) => p.idExterno ?? "—" },
  { key: "assunto", header: "Assunto", minWidth: 220, align: "left", value: (p) => p.assunto ?? "—", render: (p) => <span className="line-clamp-1" title={p.assunto ?? ""}>{p.assunto ?? "—"}</span> },
  { key: "interessado", header: "Interessado", minWidth: 220, align: "left", value: (p) => p.interessado ?? "—", render: (p) => <span className="line-clamp-1" title={p.interessado ?? ""}>{p.interessado ?? "—"}</span> },
  { key: "pca", header: "PCA", nowrap: true, value: pcaDe },
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

export function AutomacaoAdmin({ protocolos }: { protocolos: ProtocoloAutomacao[] }) {
  const { ext, pedir } = useExtensaoCenti();
  const [cfg, setCfg] = useState<ConfigCenti>(CONFIG_CENTI_PADRAO);
  const [logado, setLogado] = useState<Resposta | null>(null);
  const [modo, setModo] = useState<Modo>("protocolo");
  const [texto, setTexto] = useState("");
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const [pasta, setPasta] = useState<Pasta | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [rodando, setRodando] = useState(false);
  const podePasta = typeof window !== "undefined" && "showDirectoryPicker" in window;

  useEffect(() => {
    try {
      setCfg(lerConfigCenti(JSON.parse(localStorage.getItem(CHAVE_CONFIG) ?? "null")));
    } catch {}
  }, []);
  const mudar = (p: Partial<ConfigCenti>) => {
    const n = lerConfigCenti({ ...cfg, ...p });
    setCfg(n);
    try {
      localStorage.setItem(CHAVE_CONFIG, JSON.stringify(n));
    } catch {}
  };

  const verificar = useCallback(async () => setLogado(await pedir("estado", null, 8000)), [pedir]);
  useEffect(() => {
    if (ext && versaoAtende(ext.versao)) void verificar();
  }, [ext, verificar]);

  const { ids, excedente } = lerIdsCenti(texto);
  const escolhidos = useMemo(() => protocolos.filter((p) => sel.has(p.id)), [protocolos, sel]);
  const doProtocolo = useMemo(() => tarefasDosProtocolos(escolhidos), [escolhidos]);
  const tarefas = modo === "protocolo" ? doProtocolo.tarefas : tarefasDosIds(ids);

  async function escolherPasta() {
    try {
      const p = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<Pasta> }).showDirectoryPicker({ mode: "readwrite" });
      setPasta(p);
    } catch {}
  }

  type Emissao = { pdf?: Uint8Array; erro?: string; amostra?: string; ambiente?: boolean };
  // A LÓGICA da emissão (a extensão só leva o pedido à aba da Centi): Processar → o PDF, ou a chave do arquivo → baixa.
  async function emitirUm(id: string): Promise<Emissao> {
    const ambiente = (r: Resposta): Emissao => ({ erro: r.erro ?? "Falha na extensão.", ambiente: true });
    const r = await pedir("pedir", { metodo: "POST", caminho: "restauth/operation", corpo: pedidoEmitirDfd(id, cfg, new Date()) }, 150_000);
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
      const d = await pedir("pedir", { metodo: "GET", caminho }, 150_000);
      if (!d.ok || d.b64 == null || (d.status ?? 0) >= 400) continue;
      const b = deBase64(d.b64);
      if (ehPdf(b)) return { pdf: b };
      const link = linkDaResposta(b);
      if (link) {
        const z = await pedir("pedir", { metodo: "GET", caminho: link }, 150_000);
        const c = z.ok && z.b64 ? deBase64(z.b64) : null;
        if (c && ehPdf(c)) return { pdf: c };
      }
    }
    return { erro: "A Centi gerou o PDF, mas não consegui baixá-lo pela chave." };
  }

  // Um protocolo após o outro, um DFD após o outro (a Centi processa um pedido por vez na aba).
  async function baixar() {
    if (!tarefas.length || rodando) return;
    setRodando(true);
    const lote = tarefas;
    setLinhas(lote.map((t) => ({ ...t, estado: "fila" })));
    const marcar = (chave: string, l: Partial<Linha>) => setLinhas((ls) => ls.map((x) => (x.chave === chave ? { ...x, ...l } : x)));
    for (const t of lote) {
      marcar(t.chave, { estado: "baixando" });
      const r = await emitirUm(t.id);
      if (!r.pdf) {
        const erro = r.erro ?? "Falha ao emitir.";
        // Falha do AMBIENTE (extensão/aba/sessão), não do Id: os demais falhariam igual — para o lote e revalida.
        if (r.ambiente) {
          setLinhas((ls) => ls.map((x) => (x.estado === "fila" || x.chave === t.chave ? { ...x, estado: "falha", erro } : x)));
          void verificar();
          break;
        }
        marcar(t.chave, { estado: "falha", erro, amostra: r.amostra });
        continue;
      }
      try {
        await salvar(pasta, t.pasta, t.arquivo, new Blob([r.pdf as Uint8Array<ArrayBuffer>], { type: "application/pdf" }));
        marcar(t.chave, { estado: "ok" });
      } catch {
        marcar(t.chave, { estado: "falha", erro: "Não consegui gravar na pasta — escolha a pasta de novo." });
      }
    }
    setRodando(false);
  }

  const feitos = linhas.filter((l) => l.estado === "ok" || l.estado === "falha").length;
  const falhas = linhas.filter((l) => l.estado === "falha").length;
  const atualizada = !!ext && versaoAtende(ext.versao);
  const pronto = atualizada && !!logado?.ok && !!logado.logado;
  const grupos = useMemo(() => {
    const m = new Map<string, Linha[]>();
    for (const l of linhas) {
      const k = l.pasta ?? "";
      m.set(k, [...(m.get(k) ?? []), l]);
    }
    return [...m.entries()];
  }, [linhas]);

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
            <strong>Por protocolo:</strong> marque um ou vários protocolos do sistema. Para cada um, a automação cria, dentro da
            pasta escolhida, a pasta “Nº do protocolo - assunto” e salva nela os DFDs do protocolo (pelo nº de planejamento),
            um protocolo após o outro. DFD sem nº de planejamento é pulado e avisado.
          </p>
          <p>
            <strong>Por Id:</strong> digite os nºs de planejamento (separados por “:”) — os PDFs vão para a raiz da pasta.
          </p>
        </Ajuda>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {ext ? <Badge tone="emerald" dot>Extensão v{ext.versao}</Badge> : <Badge tone="amber" dot>Extensão não encontrada</Badge>}
          {atualizada && (logado?.ok && logado.logado ? <Badge tone="emerald" dot>Centi logada</Badge> : <Badge tone="amber" dot>{logado?.erro ?? "Centi sem login"}</Badge>)}
          <Button size="sm" variant="secondary" onClick={() => (ext ? void verificar() : window.location.reload())}>
            <IconRefresh className="h-4 w-4" /> Verificar
          </Button>
        </div>
      </div>

      {ext && !atualizada && (
        <Callout kind="warn">
          Instale a extensão {VERSAO_EXTENSAO_CENTI} (a última que pede reinstalação — as melhorias seguintes chegam com o
          sistema): baixe o zip abaixo, substitua os arquivos da pasta e clique em ↻ no cartão dela em chrome://extensions.
        </Callout>
      )}
      {(!ext || !atualizada) && (
        <Callout kind="info">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Baixe a extensão:{" "}
              <a className="font-semibold text-accent underline" href={`/extensao-centi.zip?v=${VERSAO_EXTENSAO_CENTI}`} download>
                extensao-centi.zip
              </a>{" "}
              e descompacte numa pasta (na atualização, substitua os arquivos).
            </li>
            <li>No Chrome, abra chrome://extensions, ligue o Modo do desenvolvedor e clique em Carregar sem compactação → escolha a pasta (na atualização, clique em ↻ no cartão da extensão).</li>
            <li>Recarregue esta tela (F5). A aba da Centi NÃO precisa ser recarregada: a extensão entra nela sozinha e usa o login dela.</li>
          </ol>
        </Callout>
      )}

      <div className="grid gap-[var(--gap-block)] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Secao
          titulo="Baixar DFDs"
          className="min-w-0"
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
          {modo === "protocolo" ? (
            <>
              <DataTable
                columns={COLUNAS}
                rows={protocolos}
                getKey={(p) => p.id}
                selectable
                selected={sel}
                onSelected={setSel}
                density="compact"
                pageSize={20}
                vazio="Nenhum protocolo no sistema."
                resumo={(ls) => `${ls.length} protocolo(s) · ${ls.reduce((s, p) => s + p.dfds.length, 0)} DFD(s)`}
              />
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

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {podePasta && (
              <Button variant="secondary" onClick={escolherPasta} disabled={rodando}>
                <IconPastaAberta className="h-4 w-4" /> {pasta ? `Pasta: ${pasta.name}` : "Escolher pasta"}
              </Button>
            )}
            <Button onClick={baixar} loading={rodando} disabled={!pronto || !tarefas.length || (podePasta && !pasta)}>
              <IconDownload className="h-4 w-4" />
              {modo === "protocolo" ? `Baixar ${escolhidos.length} protocolo(s) · ${tarefas.length} DFD(s)` : `Baixar ${ids.length || ""}`}
            </Button>
            <span className="text-sm text-muted">
              {!podePasta
                ? "Este navegador não escolhe pasta: os PDFs vão para Downloads (com o nome da pasta à frente)."
                : modo === "protocolo"
                  ? "Uma pasta por protocolo é criada dentro da escolhida."
                  : "Os PDFs vão para a raiz da pasta escolhida."}
            </span>
          </div>
        </Secao>

        <div className="space-y-[var(--gap-block)]">
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

          {linhas.length > 0 && (
            <Secao titulo="Andamento">
              <Progress value={(feitos / linhas.length) * 100} label={`${feitos} de ${linhas.length}${falhas ? ` · ${falhas} com falha` : ""}`} />
              <ul className="max-h-[60vh] space-y-3 overflow-y-auto">
                {grupos.map(([g, ls]) => {
                  const ok = ls.filter((l) => l.estado === "ok").length;
                  const visiveis = ls.filter((l) => l.estado !== "ok" && l.estado !== "fila");
                  return (
                    <li key={g} className="space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <IconPasta className="h-4 w-4 shrink-0 text-muted" />
                        <span className="min-w-0 flex-1 truncate font-semibold text-text" title={g || "Raiz da pasta"}>
                          {g || "Raiz da pasta"}
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
        </div>
      </div>
    </div>
  );
}
