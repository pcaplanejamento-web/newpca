"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ConfigCenti,
  CONFIG_CENTI_PADRAO,
  lerConfigCenti,
  lerIdsCenti,
  MAX_IDS_CENTI,
  nomeArquivoDfd,
  pedidoEmitirDfd,
} from "@/lib/automacao-centi-core";
import { Ajuda } from "./Ajuda";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { EstadoPonto } from "./EstadoCelula";
import { TextField } from "./Field";
import { IconDownload, IconPastaAberta, IconRefresh, IconRobo } from "./icons";
import { Progress } from "./Progress";
import { Switch } from "./Switch";

// Tela AUTOMAÇÃO (só ADM): baixa DFDs da Centi ("Emitir DFD" do CM002 Planejamento) para uma pasta escolhida. Quem fala
// com a Centi é a EXTENSÃO do Chrome (extensao-centi/, baixada aqui), usando a sessão da Centi já aberta no navegador —
// nenhuma senha fica no sistema e nada é gravado na Centi (as travas são forçadas também na extensão).

const CHAVE_CONFIG = "automacao:centi";

type Resposta = { ok: boolean; erro?: string; pdf?: string; logado?: boolean; captcha?: boolean };
type Linha = { id: string; estado: "fila" | "baixando" | "ok" | "falha"; erro?: string };
type Ext = { versao: string } | null;

/** Conversa com a extensão pela ponte da página (window.postMessage). */
function useExtensaoCenti() {
  const [ext, setExt] = useState<Ext>(null);
  const seq = useRef(0);
  const pendentes = useRef(new Map<number, (r: Resposta) => void>());
  useEffect(() => {
    const ouvir = (e: MessageEvent) => {
      if (e.source !== window || e.data?.fonte !== "pca-ext") return;
      if (e.data.tipo === "pronto") setExt({ versao: String(e.data.versao ?? "") });
      const f = pendentes.current.get(e.data.id);
      if (f) {
        pendentes.current.delete(e.data.id);
        f(e.data.resposta ?? { ok: false, erro: "Sem resposta da extensão." });
      }
    };
    window.addEventListener("message", ouvir);
    window.postMessage({ fonte: "pca-pagina", tipo: "ola" }, window.location.origin);
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
      window.postMessage({ fonte: "pca-pagina", id, acao, dados }, window.location.origin);
    });
  }, []);
  return { ext, pedir };
}

type Pasta = { getFileHandle: (n: string, o: { create: boolean }) => Promise<{ createWritable: () => Promise<WritableStreamDefaultWriter & { write: (d: Blob) => Promise<void>; close: () => Promise<void> }> }>; name: string };

function pdfDoBase64(b64: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "application/pdf" });
}

async function salvar(pasta: Pasta | null, nome: string, blob: Blob) {
  if (pasta) {
    const arq = await pasta.getFileHandle(nome, { create: true });
    const w = await arq.createWritable();
    await w.write(blob);
    await w.close();
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const COR: Record<Linha["estado"], string> = { fila: "var(--muted)", baixando: "var(--info)", ok: "var(--ok)", falha: "var(--danger)" };
const ROTULO: Record<Linha["estado"], string> = { fila: "Na fila", baixando: "Baixando…", ok: "Salvo", falha: "Falhou" };

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
      <h2 className="font-bold text-text">{titulo}</h2>
      {children}
    </section>
  );
}

export function AutomacaoAdmin() {
  const { ext, pedir } = useExtensaoCenti();
  const [cfg, setCfg] = useState<ConfigCenti>(CONFIG_CENTI_PADRAO);
  const [logado, setLogado] = useState<Resposta | null>(null);
  const [texto, setTexto] = useState("");
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
    if (ext) void verificar();
  }, [ext, verificar]);

  const { ids, excedente } = lerIdsCenti(texto);

  async function escolherPasta() {
    try {
      const p = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<Pasta> }).showDirectoryPicker({ mode: "readwrite" });
      setPasta(p);
    } catch {}
  }

  async function baixar() {
    if (!ids.length || rodando) return;
    setRodando(true);
    const fila: Linha[] = ids.map((id) => ({ id, estado: "fila" }));
    setLinhas(fila);
    const marcar = (id: string, l: Partial<Linha>) => setLinhas((ls) => ls.map((x) => (x.id === id ? { ...x, ...l } : x)));
    for (const id of ids) {
      marcar(id, { estado: "baixando" });
      const r = await pedir("emitir", pedidoEmitirDfd(id, cfg, new Date()), 150_000);
      if (!r.ok || !r.pdf) {
        marcar(id, { estado: "falha", erro: r.erro ?? "Falha ao emitir." });
        continue;
      }
      try {
        await salvar(pasta, nomeArquivoDfd(id), pdfDoBase64(r.pdf));
        marcar(id, { estado: "ok" });
      } catch {
        marcar(id, { estado: "falha", erro: "Não consegui gravar na pasta — escolha a pasta de novo." });
      }
    }
    setRodando(false);
  }

  const feitos = linhas.filter((l) => l.estado === "ok" || l.estado === "falha").length;
  const falhas = linhas.filter((l) => l.estado === "falha").length;
  const pronto = !!ext && !!logado?.ok && !!logado.logado;

  return (
    <div className="mx-auto max-w-4xl space-y-[var(--gap-block)]">
      <div className="flex items-center gap-2">
        <IconRobo className="h-5 w-5 text-muted" />
        <h1 className="text-lg font-bold text-text">Automação</h1>
        <Ajuda titulo="Automação — baixar DFDs da Centi">
          <p>
            A extensão do Chrome repete, na Centi, o caminho Planejamento → Operações → Emitir DFD → Processar para cada Id,
            usando o login que você já fez na Centi. Os PDFs vão para a pasta escolhida. Nada entra na Mesa e nada é gravado
            na Centi: não vincula ao protocolo, não assina e não envia e-mail.
          </p>
        </Ajuda>
      </div>

      <Secao titulo="1. Extensão e Centi">
        <div className="flex flex-wrap items-center gap-2">
          {ext ? <Badge tone="emerald" dot>Extensão conectada (v{ext.versao})</Badge> : <Badge tone="amber" dot>Extensão não encontrada</Badge>}
          {ext && (logado?.ok && logado.logado ? <Badge tone="emerald" dot>Centi logada</Badge> : <Badge tone="amber" dot>{logado?.erro ?? "Centi sem login"}</Badge>)}
          <Button size="sm" variant="secondary" onClick={() => (ext ? void verificar() : window.location.reload())}>
            <IconRefresh className="h-4 w-4" /> Verificar
          </Button>
        </div>
        {!ext && (
          <Callout kind="info">
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Baixe a extensão:{" "}
                <a className="font-semibold text-accent underline" href="/extensao-centi.zip" download>
                  extensao-centi.zip
                </a>{" "}
                e descompacte numa pasta.
              </li>
              <li>No Chrome, abra chrome://extensions, ligue o Modo do desenvolvedor e clique em Carregar sem compactação → escolha a pasta.</li>
              <li>Recarregue esta tela e a aba da Centi (F5). Faça o login na Centi e abra o Planejamento.</li>
            </ol>
          </Callout>
        )}
      </Secao>

      <Secao titulo="2. Opções da emissão">
        <div className="grid gap-3 sm:grid-cols-2">
          <Switch checked={cfg.valorReferencia} onChange={(v) => mudar({ valorReferencia: v })} label="Emitir valor de referência" />
          <Switch checked={cfg.emitirData} onChange={(v) => mudar({ emitirData: v })} label="Emitir data" />
        </div>
        <Callout kind="ok">Sempre: saída em PDF, sem vincular ao protocolo, sem assinar, sem enviar e-mail, sem processar em segundo plano.</Callout>
        <details className="text-sm text-muted">
          <summary className="cursor-pointer select-none py-2">Avançado (identificação da operação na Centi)</summary>
          <div className="grid gap-3 pt-2 sm:grid-cols-3">
            <TextField label="Modelo de assinatura do DFD" value={cfg.assinaturaDfd} inputMode="numeric" onChange={(e) => mudar({ assinaturaDfd: e.target.value })} />
            <TextField label="ModuleKey" value={String(cfg.moduleKey)} inputMode="numeric" onChange={(e) => mudar({ moduleKey: Number(e.target.value) })} />
            <TextField label="Guid da operação" value={cfg.guid} onChange={(e) => mudar({ guid: e.target.value })} />
          </div>
        </details>
      </Secao>

      <Secao titulo="3. Baixar DFDs">
        <TextField
          label="Ids do planejamento"
          placeholder="1154:1155:1160"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          hint={`${ids.length} Id(s)${excedente ? ` — só os ${MAX_IDS_CENTI} primeiros (${excedente} a mais)` : ""} · separe por ":" (o formato do "Copiar planejamentos")`}
        />
        <div className="flex flex-wrap items-center gap-2">
          {podePasta && (
            <Button variant="secondary" onClick={escolherPasta} disabled={rodando}>
              <IconPastaAberta className="h-4 w-4" /> {pasta ? `Pasta: ${pasta.name}` : "Escolher pasta"}
            </Button>
          )}
          <Button onClick={baixar} loading={rodando} disabled={!pronto || !ids.length || (podePasta && !pasta)}>
            <IconDownload className="h-4 w-4" /> Baixar {ids.length || ""}
          </Button>
          {!podePasta && <span className="text-sm text-muted">Este navegador não escolhe pasta: os PDFs vão para Downloads.</span>}
        </div>
        {linhas.length > 0 && (
          <div className="space-y-2">
            <Progress value={(feitos / linhas.length) * 100} label={`${feitos} de ${linhas.length}${falhas ? ` · ${falhas} com falha` : ""}`} />
            <ul className="divide-y divide-border">
              {linhas.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm">
                  <span className="min-w-28 font-semibold text-text">Planej. {l.id}</span>
                  <EstadoPonto cor={COR[l.estado]} rotulo={ROTULO[l.estado]} />
                  {l.erro && <span className="text-muted">{l.erro}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Secao>
    </div>
  );
}
