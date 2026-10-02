"use client";

import { type MutableRefObject, useEffect, useMemo, useRef, useState } from "react";
import { baixarNoNavegador, comoBlob, deBase64, gunzip } from "@/lib/arquivo-navegador";
import { analisarRespostaCenti, caminhosDoArquivo, ehPdf, linkDaResposta, type ProtocoloAutomacao } from "@/lib/automacao-centi-core";
import { cancelarExecucao, concluirPassos, iniciarExecucaoLeitura } from "@/lib/automacao-cliente";
import {
  corpoEmissao,
  itensDaLista,
  juntarProtocolos,
  lerLinhas,
  MAX_PAGINAS_TELA,
  type ModeloTela,
  nomePdfProtocolo,
  type PedidoAprendido,
  type ProtocoloTela,
  proximaPagina,
} from "@/lib/automacao-tela-protocolo";
import { AprendizTelaProtocolo } from "./AprendizTelaProtocolo";
import { Badge } from "./Badge";
import { CelulaCopiavel } from "./BotaoCopiar";
import { Button } from "./Button";
import { CelulaLista } from "./CelulaLista";
import { type Column, DataTable } from "./DataTable";
import { EstadoPonto } from "./EstadoCelula";
import { IconDownload } from "./icons";
import { ProtocoloUploadForm } from "./ProtocoloUploadForm";
import { toast } from "./Toast";

/** A resposta da extensão (o pedido à aba da Centi). */
export type RespostaTela = {
  ok: boolean;
  erro?: string;
  status?: number;
  b64?: string;
  j?: unknown;
  aprendendo?: boolean;
  pedidos?: unknown[];
  interrompido?: boolean;
  loteId?: string;
};
type Pedir = (acao: string, dados: unknown, ms: number) => Promise<RespostaTela>;
type Analise = Pick<Parameters<typeof ProtocoloUploadForm>[0], "reparticoes" | "regras" | "orgaos" | "pcas">;

type EstadoFila = "fila" | "emitindo" | "analise" | "feito" | "falha";
const COR: Record<EstadoFila, string> = { fila: "var(--muted)", emitindo: "var(--info)", analise: "var(--accent)", feito: "var(--ok)", falha: "var(--danger)" };
const ROTULO: Record<EstadoFila, string> = { fila: "Na fila", emitindo: "Emitindo…", analise: "Em análise", feito: "Analisado", falha: "Falhou" };

async function gravarConfig(corpo: unknown): Promise<string | null> {
  try {
    const r = await fetch("/api/admin/automacao/config", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
    const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    return r.ok && j?.ok ? null : (j?.error ?? `Falha ao salvar (erro ${r.status}).`);
  } catch {
    return "Sem conexão com o sistema.";
  }
}

/**
 * Tarefa "LER A TELA PROTOCOLO": a extensão APRENDE clicando (Pesquisar + as abas + emitir o PDF de um protocolo), o
 * sistema repete as consultas (só leitura) e lista os protocolos das repartições; os escolhidos são EMITIDOS na Centi e
 * abertos, um por vez, na MESMA análise da importação de protocolo da Mesa (nada é gravado sozinho).
 */
export function TarefaTelaProtocolo({
  pedir,
  lote,
  interrompido,
  pronto,
  protocolos,
  analise,
  onRodando,
}: {
  pedir: Pedir;
  lote: MutableRefObject<string | null>;
  interrompido: MutableRefObject<boolean>;
  /** A extensão atualizada e a Centi logada. */
  pronto: boolean;
  /** Os protocolos do sistema (a coluna "No sistema"). */
  protocolos: ProtocoloAutomacao[];
  analise: Analise;
  onRodando: (v: boolean) => void;
}) {
  const [modelo, setModelo] = useState<ModeloTela | null | undefined>(undefined);
  const [aprendendo, setAprendendo] = useState(false);
  const [aprendido, setAprendido] = useState<PedidoAprendido[] | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [lendo, setLendo] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<ProtocoloTela[] | null>(null);
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const [fila, setFila] = useState<Map<string, { estado: EstadoFila; erro?: string }>>(new Map());
  const [arquivo, setArquivo] = useState<{ file: File; n: number } | null>(null);
  const pendentes = useRef<ProtocoloTela[]>([]);
  const atual = useRef<ProtocoloTela | null>(null);
  const pdfs = useRef(new Map<string, File>());
  const execucao = useRef<{ id: number; feitos: { chave: string; estado: "ok" | "falhou"; texto: string }[] } | null>(null);
  const total = useRef(0);

  useEffect(() => {
    fetch("/api/admin/automacao/config")
      .then((r) => r.json() as Promise<{ ok?: boolean; config?: { telaProtocolo?: ModeloTela | null } }>)
      .then((x) => setModelo(x?.ok ? (x.config?.telaProtocolo ?? null) : null))
      .catch(() => setModelo(null));
  }, []);

  const rodando = !!lendo || fila.size > 0 && [...fila.values()].some((f) => f.estado === "fila" || f.estado === "emitindo" || f.estado === "analise");
  useEffect(() => onRodando(rodando), [rodando, onRodando]);

  // ---------------------------------------------------------------- APRENDER
  async function aprender(acao: "iniciar" | "parar") {
    const r = await pedir("aprender", { acao }, 60_000);
    if (!r.ok) return toast.error(r.erro ?? "A extensão não respondeu.");
    if (acao === "iniciar") {
      setAprendendo(true);
      const l = await pedir("lote", { fase: "inicio", titulo: "Aprendendo a Tela Protocolo", total: 0 }, 8000);
      lote.current = l.loteId ?? null;
      await pedir("lote", { fase: "passo", loteId: lote.current, feito: 0, texto: "Escolha os departamentos, clique em Pesquisar, abra as 4 abas e emita o PDF de UM protocolo." }, 8000);
      toast.info("Na aba da automação: escolha os departamentos, Pesquisar, abra as abas e emita o PDF de um protocolo. Depois, Parar.", 12000);
      return;
    }
    setAprendendo(false);
    if (lote.current) await pedir("lote", { fase: "fim", loteId: lote.current, resumo: "Aprendizado terminado." }, 8000);
    lote.current = null;
    setAprendido(Array.isArray(r.pedidos) ? (r.pedidos as PedidoAprendido[]) : []);
  }

  async function salvarModelo(m: ModeloTela) {
    setSalvando(true);
    const erro = await gravarConfig({ telaProtocolo: m });
    setSalvando(false);
    if (erro) return toast.error(erro);
    setModelo(m);
    setAprendido(null);
    void pedir("aprender", { acao: "limpar" }, 8000);
    toast.success("Modelo da Tela Protocolo salvo — vale para todos os administradores.");
  }

  // ---------------------------------------------------------------- LER
  async function ler() {
    if (!modelo) return;
    const consultas = modelo.consultas;
    setLendo("Começando…");
    setSel(new Set());
    interrompido.current = false;
    const l = await pedir("lote", { fase: "inicio", titulo: "Ler a Tela Protocolo", total: consultas.length }, 8000);
    lote.current = l.loteId ?? null;
    const ex = await iniciarExecucaoLeitura(
      "protocolos-por-reparticao",
      "consultar",
      consultas.map((c, i) => ({ chave: `consulta-${i + 1}`, alvo: c.rotulo })),
      { consultas: consultas.length },
    );
    const execId = "id" in ex ? ex.id : null;
    const resultados: { chave: string; estado: "ok" | "falhou"; texto: string }[] = [];
    const listas: ProtocoloTela[][] = [];
    let falhou: string | null = null;
    for (const [i, c] of consultas.entries()) {
      if (interrompido.current) break;
      setLendo(`Lendo ${c.rotulo} (${i + 1} de ${consultas.length})…`);
      await pedir("lote", { fase: "passo", loteId: lote.current, feito: i, total: consultas.length, texto: `Lendo ${c.rotulo}` }, 8000);
      let caminho = c.caminho;
      let corpo = c.corpo;
      const daConsulta: ProtocoloTela[] = [];
      let erro: string | null = null;
      for (let pag = 0; pag < MAX_PAGINAS_TELA; pag++) {
        const r = await pedir("ler", { metodo: c.metodo, caminho, corpo }, 120_000);
        if (r.interrompido) interrompido.current = true;
        if (!r.ok) {
          erro = r.erro ?? "Falha na consulta.";
          break;
        }
        daConsulta.push(...lerLinhas(r.j, c, modelo.colunas));
        const prox = proximaPagina(caminho, corpo, itensDaLista(r.j, c.lista).length);
        if (!prox || interrompido.current) break;
        ({ caminho, corpo } = prox);
      }
      listas.push(daConsulta);
      resultados.push({ chave: `consulta-${i + 1}`, estado: erro ? "falhou" : "ok", texto: erro ?? `${daConsulta.length} protocolo(s)` });
      if (erro) {
        falhou = `${c.rotulo}: ${erro}`;
        break;
      }
    }
    const todos = juntarProtocolos(listas);
    setLinhas(todos);
    setLendo(null);
    if (execId) {
      await concluirPassos(execId, resultados);
      if (interrompido.current || falhou) await cancelarExecucao(execId);
    }
    if (lote.current)
      await pedir("lote", { fase: "fim", loteId: lote.current, resumo: interrompido.current ? "Interrompido." : `${todos.length} protocolo(s) lidos.` }, 8000);
    lote.current = null;
    if (interrompido.current) toast.warning("Leitura interrompida na extensão.");
    else if (falhou) toast.error(`A leitura parou — ${falhou}`, 12000);
    else toast.success(`${todos.length} protocolo(s) lidos da Tela Protocolo.`);
  }

  // ---------------------------------------------------------------- EMITIR + ANALISAR (um por vez)
  async function emitirPdf(p: ProtocoloTela): Promise<{ pdf: Uint8Array } | { erro: string }> {
    if (!modelo?.emissao) return { erro: "A emissão do PDF não foi aprendida." };
    const corpo = corpoEmissao(modelo.emissao, p);
    if (!corpo) return { erro: `A linha não traz o campo ${modelo.emissao.campo}.` };
    const r = await pedir("pedir", { metodo: "POST", caminho: "restauth/operation", corpo }, 150_000);
    if (r.interrompido) interrompido.current = true;
    if (!r.ok || r.b64 == null) return { erro: r.erro ?? "Falha na extensão." };
    const a = analisarRespostaCenti(deBase64(r.b64), r.status ?? 0);
    if (a.tipo === "pdf") return { pdf: a.bytes };
    if (a.tipo === "base64") return { pdf: deBase64(a.b64) };
    if (a.tipo === "gzip") {
      const b = await gunzip(deBase64(a.b64)).catch(() => null);
      return b && ehPdf(b) ? { pdf: b } : { erro: "Não consegui abrir o PDF compactado da Centi." };
    }
    if (a.tipo === "nada") return { erro: a.erro };
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
    return { erro: "A Centi gerou o PDF, mas não consegui baixá-lo." };
  }

  const marcar = (chave: string, estado: EstadoFila, erro?: string) =>
    setFila((f) => {
      const n = new Map(f);
      n.set(chave, { estado, erro });
      return n;
    });

  /** O próximo da fila: emite e abre a análise (ou marca a falha e segue). */
  async function proximo() {
    const p = pendentes.current.shift();
    atual.current = p ?? null;
    if (!p) {
      if (execucao.current) {
        await concluirPassos(execucao.current.id, execucao.current.feitos);
        if (interrompido.current) await cancelarExecucao(execucao.current.id);
      }
      execucao.current = null;
      if (lote.current) await pedir("lote", { fase: "fim", loteId: lote.current, resumo: interrompido.current ? "Interrompido." : "Protocolos analisados." }, 8000);
      lote.current = null;
      if (interrompido.current) {
        setFila((f) => new Map([...f].map(([k, v]) => [k, v.estado === "fila" ? { estado: "falha" as const, erro: "Interrompido na extensão." } : v])));
        toast.warning("Interrompido na extensão.");
      }
      return;
    }
    const feito = total.current - pendentes.current.length;
    await pedir("lote", { fase: "passo", loteId: lote.current, feito: feito - 1, total: total.current, texto: `Emitindo o protocolo ${p.processo || p.id}` }, 8000);
    marcar(p.chave, "emitindo");
    const ja = pdfs.current.get(p.chave);
    const r = ja ? { pdf: null as Uint8Array | null } : await emitirPdf(p);
    if ("erro" in r) {
      marcar(p.chave, "falha", r.erro);
      execucao.current?.feitos.push({ chave: p.chave, estado: "falhou", texto: r.erro });
      if (interrompido.current) pendentes.current = [];
      return void proximo();
    }
    const file = ja ?? new File([comoBlob(r.pdf as Uint8Array)], nomePdfProtocolo(p), { type: "application/pdf" });
    pdfs.current.set(p.chave, file);
    marcar(p.chave, "analise");
    setArquivo((a) => ({ file, n: (a?.n ?? 0) + 1 }));
  }

  /** A análise foi fechada (ou o PDF não abriu): o atual termina e segue o próximo. */
  function aoFechar(erro?: string) {
    const p = atual.current;
    if (!p) return;
    marcar(p.chave, erro ? "falha" : "feito", erro);
    execucao.current?.feitos.push({ chave: p.chave, estado: erro ? "falhou" : "ok", texto: erro ?? "Aberto na análise da importação." });
    void proximo();
  }

  async function analisar(lista: ProtocoloTela[]) {
    if (!lista.length || rodando) return;
    interrompido.current = false;
    pendentes.current = [...lista];
    total.current = lista.length;
    setFila(new Map(lista.map((p) => [p.chave, { estado: "fila" as EstadoFila }])));
    const l = await pedir("lote", { fase: "inicio", titulo: "Emitir e analisar protocolos", total: lista.length }, 8000);
    lote.current = l.loteId ?? null;
    const ex = await iniciarExecucaoLeitura(
      "protocolos-por-reparticao",
      "baixar",
      lista.map((p) => ({ chave: p.chave, alvo: `Protocolo ${p.processo || p.id}` })),
      { protocolos: lista.length },
    );
    execucao.current = "id" in ex ? { id: ex.id, feitos: [] } : null;
    void proximo();
  }

  // ---------------------------------------------------------------- A TABELA
  const noSistema = useMemo(() => {
    const porId = new Map<string, ProtocoloAutomacao>();
    const porNumero = new Map<string, ProtocoloAutomacao>();
    for (const p of protocolos) {
      if (p.idExterno) porId.set(p.idExterno.replace(/^0+(?=\d)/, ""), p);
      porNumero.set(p.numero.replace(/\/.*$/, "").replace(/^0+(?=\d)/, ""), p);
    }
    return (l: ProtocoloTela) => (l.id && porId.get(l.id.replace(/^0+(?=\d)/, ""))) || (l.numero ? porNumero.get(l.numero) : undefined) || null;
  }, [protocolos]);

  const colunas = useMemo<Column<ProtocoloTela>[]>(() => {
    const c = modelo?.colunas ?? {};
    const r: Column<ProtocoloTela>[] = [
      {
        key: "fila",
        header: "Estado",
        value: (l) => ROTULO[fila.get(l.chave)?.estado ?? "fila"] ?? "",
        render: (l) => {
          const f = fila.get(l.chave);
          return f ? <EstadoPonto cor={COR[f.estado]} rotulo={ROTULO[f.estado]} title={f.erro} /> : <span className="text-faint">—</span>;
        },
        nowrap: true,
      },
      { key: "abas", header: "Abas", value: (l) => l.abas.join(", "), valores: (l) => l.abas, render: (l) => <CelulaLista valores={l.abas} />, nowrap: true },
      {
        key: "sistema",
        header: "No sistema",
        value: (l) => (noSistema(l) ? "No sistema" : "Novo"),
        render: (l) =>
          noSistema(l) ? (
            <Badge tone="emerald" dot>
              No sistema
            </Badge>
          ) : (
            <Badge tone="slate">Novo</Badge>
          ),
        nowrap: true,
      },
    ];
    if (c.id) r.push({ key: "id", header: "ID", value: (l) => l.id, render: (l) => (
        <CelulaCopiavel copiar={l.id} rotulo="ID">
          {l.id}
        </CelulaCopiavel>
      ), nowrap: true });
    if (c.processo) r.push({ key: "processo", header: "Processo", value: (l) => l.processo, render: (l) => (
        <CelulaCopiavel copiar={l.processo} rotulo="processo">
          {l.processo}
        </CelulaCopiavel>
      ), nowrap: true });
    if (c.data) r.push({ key: "data", header: "Data", value: (l) => l.data, render: (l) => l.data, nowrap: true });
    if (c.usuario) r.push({ key: "usuario", header: "Usuário origem", value: (l) => l.usuario, render: (l) => l.usuario });
    if (c.origem) r.push({ key: "origem", header: "Depto. origem", value: (l) => l.origem, render: (l) => l.origem });
    if (c.destino) r.push({ key: "destino", header: "Depto. destino", value: (l) => l.destino, render: (l) => l.destino });
    if (c.assunto) r.push({ key: "assunto", header: "Assunto", value: (l) => l.assunto, render: (l) => l.assunto });
    if (c.interessado) r.push({ key: "interessado", header: "Interessado", value: (l) => l.interessado, render: (l) => l.interessado });
    r.push({
      key: "pdf",
      header: "PDF",
      filter: "none",
      render: (l) =>
        pdfs.current.has(l.chave) ? (
          <Button
            size="xs"
            variant="ghost"
            aria-label="Baixar o PDF"
            onClick={(e) => {
              e.stopPropagation();
              const f = pdfs.current.get(l.chave);
              if (f) baixarNoNavegador(f.name, f);
            }}
          >
            <IconDownload className="h-4 w-4" />
          </Button>
        ) : null,
    });
    return r;
  }, [modelo, fila, noSistema]);

  const escolhidos = (linhas ?? []).filter((l) => sel.has(l.chave));
  const podeLer = pronto && !!modelo && !rodando && !aprendendo;
  const podeAnalisar = pronto && !!modelo?.emissao && !rodando && !aprendendo;

  const acoes = (
    <div className="flex flex-wrap items-center gap-2">
      {aprendendo ? (
        <Button size="sm" variant="danger" onClick={() => void aprender("parar")}>
          Parar de aprender
        </Button>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => void aprender("iniciar")} disabled={!pronto || rodando} title="Ensinar a Tela Protocolo clicando na aba da automação">
          {modelo ? "Aprender de novo" : "Aprender a Tela Protocolo"}
        </Button>
      )}
      <Button size="sm" variant={linhas ? "secondary" : "primary"} onClick={() => void ler()} disabled={!podeLer} loading={!!lendo}>
        Ler protocolos
      </Button>
      <Button
        size="sm"
        onClick={() => void analisar(escolhidos)}
        disabled={!podeAnalisar || !escolhidos.length}
        title={modelo && !modelo.emissao ? "Ensine a emissão: ao aprender, emita o PDF de UM protocolo" : undefined}
      >
        Emitir e analisar ({escolhidos.length})
      </Button>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-col gap-[var(--gap-block)] xl:h-full">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {modelo === undefined ? (
          <span className="text-muted">Carregando o modelo…</span>
        ) : modelo ? (
          <>
            <Badge tone="emerald" dot>
              Modelo: {modelo.consultas.map((c) => c.rotulo).join(" · ")}
            </Badge>
            {modelo.emissao ? (
              <Badge tone="emerald">Emissão do PDF aprendida</Badge>
            ) : (
              <Badge tone="amber" dot>
                Emissão do PDF não aprendida
              </Badge>
            )}
          </>
        ) : (
          <Badge tone="amber" dot>
            Ainda não aprendida — toque em “Aprender a Tela Protocolo”
          </Badge>
        )}
        {lendo && <span className="text-muted">{lendo}</span>}
        {aprendendo && (
          <Badge tone="blue" dot>
            Aprendendo na aba da automação…
          </Badge>
        )}
      </div>
      <div className="min-h-0 min-w-0 flex-1">
        <DataTable
          columns={colunas}
          rows={linhas ?? []}
          getKey={(l) => l.chave}
          selectable
          selected={sel}
          onSelected={setSel}
          onRowClick={podeAnalisar ? (l) => void analisar([l]) : undefined}
          activeKey={atual.current?.chave ?? null}
          density="compact"
          scrollInterno
          acoesRodape={acoes}
          exportar={{ nome: "Tela Protocolo" }}
          vazio={modelo ? "Toque em “Ler protocolos” para listar os protocolos das suas repartições." : "Ensine a Tela Protocolo primeiro."}
          resumo={(ls) => `${ls.length} protocolo(s) · ${ls.filter((l) => noSistema(l)).length} no sistema`}
        />
      </div>
      <ProtocoloUploadForm
        reparticoes={analise.reparticoes}
        reparticaoAtivaId={null}
        pcas={analise.pcas}
        regras={analise.regras}
        orgaos={analise.orgaos}
        arquivo={arquivo}
        onFechado={aoFechar}
      />
      {aprendido && <AprendizTelaProtocolo pedidos={aprendido} salvando={salvando} onSalvar={(m) => void salvarModelo(m)} onFechar={() => setAprendido(null)} />}
    </div>
  );
}
