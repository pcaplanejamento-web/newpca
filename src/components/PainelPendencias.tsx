"use client";

import { type ReactNode, useMemo, useState } from "react";
import type { MensagemDfd } from "@/lib/dfd-tratamento";
import { STATUS_MENSAGEM_COR } from "@/lib/dfd-tratamento";
import { dataIsoBrasilia } from "@/lib/format";
import {
  type AlvoPendencia,
  blocosPendenciasPdf,
  contarDfd,
  contarProtocolo,
  type DfdPendente,
  type FiltroPendencias,
  filtrarPendencias,
  filtroCompleto,
  FORMATOS_TEXTO,
  type FormatoTexto,
  type ItemPendente,
  type Pendencia,
  type ProtocoloPendente,
  type StatusPendencia,
  textoPendencias,
  tiposDePendencia,
} from "@/lib/pendencias-core";
import { tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import { BotaoAcao } from "./BotaoAcao";
import { copiarTexto } from "./BotaoCopiar";
import { Button } from "./Button";
import { useQuemExporta } from "./ConfigTabelas";
import { usePodeExportar } from "./ExportarTabelas";
import { Checkbox } from "./Field";
import { IconChevronDown, IconClipboard, IconDownload, IconFile, IconList, IconWhatsapp } from "./icons";
import { Modal } from "./Modal";
import { PreviaDocumento } from "./PreviaDocumento";
import { Segmented } from "./Segmented";
import { toast } from "./Toast";

export type EscopoPendencias = "protocolo" | "dfd" | "item";

const ROTULO: Record<StatusPendencia, string> = { erro: "erro", atencao: "atenção" };
const corDe = (p: { status: StatusPendencia; cor?: string }) => p.cor ?? STATUS_MENSAGEM_COR[p.status];

function Chips({ erros, atencoes }: { erros: number; atencoes: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(["erro", "atencao"] as const).map((s) => {
        const n = s === "erro" ? erros : atencoes;
        return (
          <span
            key={s}
            className="inline-flex items-center gap-1.5 rounded-control border border-border-2 bg-surface-2 px-2.5 py-1 text-[12px] font-semibold"
            style={{ color: STATUS_MENSAGEM_COR[s] }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: STATUS_MENSAGEM_COR[s] }} />
            {n} {n === 1 ? ROTULO[s] : s === "erro" ? "erros" : "atenções"}
          </span>
        );
      })}
    </div>
  );
}

/** Uma linha tocável: o ponto na cor do ADM, o lugar e o texto — leva ao componente (`onIrPara`). */
function Linha({ p, onIrPara }: { p: Pendencia; onIrPara: (a: AlvoPendencia, cor: string) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onIrPara(p.alvo, corDe(p))}
        title={`Ir para: ${p.onde}`}
        className="flex min-h-11 w-full items-start gap-2.5 rounded-card border border-border bg-surface px-3 py-2 text-left text-[13px] text-text-2 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: corDe(p) }} />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">{p.onde}</span>
          <span className="block break-words leading-snug">{p.texto}</span>
        </span>
      </button>
    </li>
  );
}

/** Um ITEM com pendência: tocar abre o item (o 1º problema); cada problema também leva ao campo. */
function LinhaItem({ it, onIrPara }: { it: ItemPendente; onIrPara: (a: AlvoPendencia, cor: string) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onIrPara(it.problemas[0].alvo, corDe(it.problemas[0]))}
        title="Abrir o item"
        className="flex min-h-11 w-full items-start gap-2.5 rounded-card border border-border bg-surface px-3 py-2 text-left text-[13px] text-text-2 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: corDe(it) }} />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold text-muted">
            Item {it.item ?? it.idx + 1}
            {it.codigo ? ` · cód. ${it.codigo}` : ""}
          </span>
          {it.descricao && <span className="block truncate text-[12px] text-muted">{it.descricao}</span>}
          <span className="block break-words leading-snug">
            {it.problemas.map((x, i) => (
              <span key={x.chave} style={{ color: corDe(x) }}>
                {i > 0 ? " · " : ""}
                {x.texto}
              </span>
            ))}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Grupo recolhível (DFD, Itens, Acertos) — cabeçalho de 44px com a contagem. */
function Grupo({ titulo, detalhe, cor, aberto: inicial = true, children }: { titulo: string; detalhe?: ReactNode; cor?: string; aberto?: boolean; children: ReactNode }) {
  const [aberto, setAberto] = useState(inicial);
  return (
    <section>
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className="flex min-h-11 w-full items-center gap-2 rounded-control px-1 text-left text-[13px] font-bold text-text hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <IconChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${aberto ? "" : "-rotate-90"}`} />
        {cor && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cor }} />}
        <span className="min-w-0 flex-1 truncate">{titulo}</span>
        {detalhe && <span className="shrink-0 text-[12px] font-semibold text-muted">{detalhe}</span>}
      </button>
      {aberto && <div className="mt-1.5 space-y-1.5 pl-1">{children}</div>}
    </section>
  );
}

function CorpoDfd({ d, escopo, onIrPara }: { d: DfdPendente; escopo: EscopoPendencias; onIrPara: (a: AlvoPendencia, cor: string) => void }) {
  // O resumo agregado de um ponto de item só aparece quando ele não tem itens a listar (ex.: "Nenhum item na tabela",
  // ou o catálogo ainda não conferido item a item).
  const agregados = d.resumoItens.filter((r) => !d.itens.some((it) => it.problemas.some((p) => p.chave === r.chave)));
  return (
    <ul className="space-y-1.5">
      {d.pendencias.map((p) => (
        <Linha key={p.chave} p={p} onIrPara={onIrPara} />
      ))}
      {agregados.map((p) => (
        <Linha key={p.chave} p={p} onIrPara={onIrPara} />
      ))}
      {d.itens.length > 0 &&
        (escopo === "item" ? (
          d.itens[0].problemas.map((p) => <Linha key={p.chave} p={p} onIrPara={onIrPara} />)
        ) : (
          <li>
            <Grupo titulo="Itens (Seção 4)" detalhe={`${d.itens.length} com pendência`} cor={corDe({ status: d.itens.some((i) => i.status === "erro") ? "erro" : "atencao" })}>
              <ul className="space-y-1.5">
                {d.itens.map((it) => (
                  <LinhaItem key={it.idx} it={it} onIrPara={onIrPara} />
                ))}
              </ul>
            </Grupo>
          </li>
        ))}
    </ul>
  );
}

type Formato = FormatoTexto | "pdf";

/** Uma lista de caixas com "Todos | Nenhum" — situação, tipos de problema, DFDs. */
function ListaEscolha({
  titulo,
  itens,
  marcados,
  onMudar,
}: {
  titulo: string;
  itens: { valor: string; rotulo: string; detalhe?: string; cor?: string }[];
  marcados: Set<string>;
  onMudar: (s: Set<string>) => void;
}) {
  return (
    <fieldset className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <legend className="text-[12px] font-bold uppercase tracking-wide text-muted">{titulo}</legend>
        <span className="flex gap-1">
          <Button size="xs" variant="ghost" onClick={() => onMudar(new Set(itens.map((i) => i.valor)))} disabled={marcados.size === itens.length}>
            Todos
          </Button>
          <Button size="xs" variant="ghost" onClick={() => onMudar(new Set())} disabled={marcados.size === 0}>
            Nenhum
          </Button>
        </span>
      </div>
      {itens.map((i) => (
        <div key={i.valor} className="flex min-h-11 items-center gap-2 lg:min-h-9">
          {i.cor && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: i.cor }} />}
          <Checkbox
            label={`${i.rotulo}${i.detalhe ? ` — ${i.detalhe}` : ""}`}
            checked={marcados.has(i.valor)}
            onChange={(e) => {
              const n = new Set(marcados);
              if (e.target.checked) n.add(i.valor);
              else n.delete(i.valor);
              onMudar(n);
            }}
          />
        </div>
      ))}
    </fieldset>
  );
}

const qtd = (t: { erros: number; atencoes: number }) =>
  [t.erros ? `${t.erros} ${t.erros === 1 ? "erro" : "erros"}` : "", t.atencoes ? `${t.atencoes} ${t.atencoes === 1 ? "atenção" : "atenções"}` : ""].filter(Boolean).join(" · ");

/**
 * MONTAR O DOCUMENTO das pendências: escolher O QUE entra (situação · tipos de problema · DFDs) e conferir na PRÉVIA ao vivo
 * o texto (Despacho · WhatsApp · Lista) ou o PDF, antes de copiar/baixar. No celular, "Escolher | Prévia" alternam; no
 * desktop ficam lado a lado. O PDF segue a ação Exportar do papel; o código do PDF só carrega no "Baixar".
 */
function MontarPendencias({ pendencias, escopo, onFechar }: { pendencias: ProtocoloPendente; escopo: EscopoPendencias; onFechar: () => void }) {
  const podeExportar = usePodeExportar();
  const quem = useQuemExporta();
  const [filtro, setFiltro] = useState<FiltroPendencias>(() => filtroCompleto(pendencias));
  const [formato, setFormato] = useState<Formato>("despacho");
  const [aba, setAba] = useState<"escolher" | "previa">("escolher");
  const [gerando, setGerando] = useState(false);
  const tipos = useMemo(() => tiposDePendencia(pendencias), [pendencias]);
  const total = contarProtocolo(pendencias);
  const escolhido = useMemo(() => filtrarPendencias(pendencias, filtro), [pendencias, filtro]);
  const cont = contarProtocolo(escolhido);
  const vazio = cont.erros + cont.atencoes === 0;
  const texto = useMemo(() => (formato === "pdf" ? "" : textoPendencias(escolhido, formato, escopo)), [escolhido, formato, escopo]);
  const doc = useMemo(() => (formato === "pdf" ? blocosPendenciasPdf(escolhido, escopo) : null), [escolhido, formato, escopo]);
  const nomeBase =
    escopo === "protocolo"
      ? `Pendências - Protocolo ${pendencias.numero}`
      : `Pendências - DFD ${pendencias.dfds[0]?.numero ?? ""}${escopo === "item" ? ` - Item ${pendencias.dfds[0]?.itens[0]?.item ?? ""}` : ""}`;

  async function copiar() {
    const ok = await copiarTexto(texto);
    if (ok) {
      toast.success(`Copiado (${FORMATOS_TEXTO.find((f) => f.valor === formato)?.rotulo}).`);
      onFechar();
    } else toast.error("Não foi possível copiar — o navegador bloqueou a área de transferência.");
  }
  async function baixar() {
    if (gerando || !doc) return;
    setGerando(true);
    try {
      const [{ baixarDocumentoPdf }, { nomeArquivoPdf }] = await Promise.all([import("@/lib/documento-pdf"), import("@/lib/exportar-pdf-core")]);
      await baixarDocumentoPdf(nomeArquivoPdf(nomeBase, dataIsoBrasilia(new Date().toISOString())), doc, { usuario: quem });
      onFechar();
    } catch {
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setGerando(false);
    }
  }

  const formatos = [
    ...FORMATOS_TEXTO.map((f) => ({ value: f.valor as Formato, label: f.rotulo, icone: ICONE[f.valor], curto: f.valor === "lista" ? "Lista" : undefined })),
    ...(podeExportar ? [{ value: "pdf" as Formato, label: "PDF", icone: <IconFile className="h-4 w-4" /> }] : []),
  ];
  const escolha = (
    <div className="space-y-4">
      {total.erros > 0 && total.atencoes > 0 && (
        <ListaEscolha
          titulo="Situação"
          itens={[
            { valor: "erro", rotulo: "Erros", detalhe: String(total.erros), cor: STATUS_MENSAGEM_COR.erro },
            { valor: "atencao", rotulo: "Atenções", detalhe: String(total.atencoes), cor: STATUS_MENSAGEM_COR.atencao },
          ]}
          marcados={filtro.status}
          onMudar={(s) => setFiltro((f) => ({ ...f, status: s as Set<StatusPendencia> }))}
        />
      )}
      <ListaEscolha
        titulo="Problemas"
        itens={tipos.map((t) => ({ valor: t.chave, rotulo: t.rotulo, detalhe: qtd(t), cor: t.erros ? STATUS_MENSAGEM_COR.erro : STATUS_MENSAGEM_COR.atencao }))}
        marcados={filtro.chaves}
        onMudar={(s) => setFiltro((f) => ({ ...f, chaves: s }))}
      />
      {escopo === "protocolo" && pendencias.dfds.length > 1 && (
        <ListaEscolha
          titulo="DFDs"
          itens={pendencias.dfds.map((d) => ({
            valor: String(d.chave),
            rotulo: `DFD ${d.numero}${d.planejamento ? ` · Planej. ${d.planejamento}` : ""}`,
            detalhe: qtd(contarDfd(d)),
            cor: corDe(d),
          }))}
          marcados={filtro.dfds}
          onMudar={(s) => setFiltro((f) => ({ ...f, dfds: s }))}
        />
      )}
    </div>
  );
  const previa = (
    <div className="min-w-0 space-y-2">
      <Segmented<Formato> ariaLabel="Formato" value={formato} onChange={setFormato} options={formatos} />
      {vazio ? (
        <p className="rounded-card border border-border bg-surface p-[var(--pad-card)] text-center text-sm text-muted">Nada escolhido — marque ao menos um problema.</p>
      ) : doc ? (
        <PreviaDocumento blocos={doc.blocos} />
      ) : (
        <pre className="whitespace-pre-wrap break-words rounded-card border border-border bg-surface-2 p-[var(--pad-card)] font-mono text-[12.5px] leading-relaxed text-text-2">{texto}</pre>
      )}
    </div>
  );
  return (
    <Modal
      open
      onClose={onFechar}
      titulo={escopo === "protocolo" ? `Copiar / PDF — Protocolo ${pendencias.numero}` : "Copiar / PDF — pendências"}
      size="xl"
      rodape={
        <div className="flex flex-nowrap items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{vazio ? "Nada escolhido" : `No documento: ${qtd(cont)}`}</span>
          {formato === "pdf" ? (
            <BotaoAcao texto variant="primary" rotulo="Baixar PDF" icon={<IconDownload className="h-4 w-4" />} onClick={baixar} loading={gerando} disabled={vazio} />
          ) : (
            <BotaoAcao texto variant="primary" rotulo="Copiar texto" icon={<IconClipboard className="h-4 w-4" />} onClick={() => void copiar()} disabled={vazio} />
          )}
        </div>
      }
    >
      <div className="lg:hidden mb-3">
        <Segmented<"escolher" | "previa">
          ariaLabel="Montar o documento"
          value={aba}
          onChange={setAba}
          options={[
            { value: "escolher", label: `Escolher (${qtd(cont) || "nada"})` },
            { value: "previa", label: "Prévia" },
          ]}
        />
      </div>
      <div className="grid gap-[var(--gap-block)] lg:grid-cols-[minmax(15rem,20rem)_minmax(0,1fr)]">
        <div className={aba === "escolher" ? "" : "max-lg:hidden"}>{escolha}</div>
        <div className={aba === "previa" ? "" : "max-lg:hidden"}>{previa}</div>
      </div>
    </Modal>
  );
}

const ICONE: Record<FormatoTexto, ReactNode> = {
  despacho: <IconFile className="h-4 w-4" />,
  whatsapp: <IconWhatsapp className="h-4 w-4" />,
  lista: <IconList className="h-4 w-4" />,
};

/**
 * O BANNER ÚNICO de PENDÊNCIAS — Protocolo, DFD e Item (o mesmo componente nos três): os erros/atenções na cor da
 * importância do ADM, organizados como o documento (capa · DFDs · itens — o protocolo soma os DFDs e o DFD soma os itens).
 * Tocar numa pendência LEVA ao lugar (`onIrPara` — o host abre o DFD/item e destaca o componente). Em cima, COPIAR o texto
 * pronto (Despacho formal · WhatsApp · Lista simples) e baixar o PDF com o conteúdo atual de cada componente (o PDF segue a
 * ação Exportar do papel). Puro de apresentação: a árvore vem de `pendencias-core`.
 */
export function PainelPendencias({
  pendencias,
  escopo,
  onIrPara,
  acertos = [],
}: {
  pendencias: ProtocoloPendente;
  escopo: EscopoPendencias;
  onIrPara: (a: AlvoPendencia, cor: string) => void;
  /** As conferências que PASSARAM (só no DFD) — recolhidas no fim. */
  acertos?: Pick<MensagemDfd, "chave" | "texto" | "ancora">[];
}) {
  const [montar, setMontar] = useState(false);
  const c = contarProtocolo(pendencias);
  const total = c.erros + c.atencoes;

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Chips erros={c.erros} atencoes={c.atencoes} />
        {total > 0 && (
          <Button size="sm" variant="secondary" icon={<IconClipboard className="h-4 w-4" />} onClick={() => setMontar(true)} title="Escolher o que entra e copiar o texto ou baixar o PDF (com a prévia)">
            Copiar / PDF
          </Button>
        )}
      </div>
      {montar && <MontarPendencias pendencias={pendencias} escopo={escopo} onFechar={() => setMontar(false)} />}

      {total === 0 ? (
        <p className="rounded-card border border-border bg-surface p-[var(--pad-card)] text-center text-sm text-muted">Nenhuma pendência — tudo confere.</p>
      ) : (
        <div className="space-y-2">
          {pendencias.capa && (
            <ul>
              <Linha p={pendencias.capa} onIrPara={onIrPara} />
            </ul>
          )}
          {escopo === "protocolo"
            ? pendencias.dfds.map((d) => {
                const cd = contarDfd(d);
                const tipo = tipoCurtoDfd(d.tipo);
                return (
                  <Grupo
                    key={d.chave}
                    titulo={`DFD ${d.numero}${d.planejamento ? ` · Planej. ${d.planejamento}` : ""}${tipo ? ` · ${tipo}` : ""}`}
                    detalhe={[cd.erros ? `${cd.erros} erro(s)` : "", cd.atencoes ? `${cd.atencoes} atenção(ões)` : ""].filter(Boolean).join(" · ")}
                    cor={corDe(d)}
                    aberto={pendencias.dfds.length <= 3}
                  >
                    <CorpoDfd d={d} escopo={escopo} onIrPara={onIrPara} />
                  </Grupo>
                );
              })
            : pendencias.dfds[0] && <CorpoDfd d={pendencias.dfds[0]} escopo={escopo} onIrPara={onIrPara} />}
        </div>
      )}

      {acertos.length > 0 && (
        <Grupo titulo="Conferido" detalhe={`${acertos.length}`} cor={STATUS_MENSAGEM_COR.acerto} aberto={total === 0}>
          <ul className="space-y-1.5">
            {acertos.map((m) => (
              <li key={m.chave}>
                <button
                  type="button"
                  onClick={() => onIrPara({ ancora: m.ancora }, STATUS_MENSAGEM_COR.acerto)}
                  className="flex min-h-11 w-full items-start gap-2.5 rounded-card border border-border bg-surface px-3 py-2 text-left text-[13px] text-text-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_MENSAGEM_COR.acerto }} />
                  <span className="min-w-0 break-words leading-snug">{m.texto}</span>
                </button>
              </li>
            ))}
          </ul>
        </Grupo>
      )}
    </div>
  );
}
