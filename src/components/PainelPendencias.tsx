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
  FORMATOS_TEXTO,
  type FormatoTexto,
  type ItemPendente,
  type Pendencia,
  type ProtocoloPendente,
  soErros,
  type StatusPendencia,
  textoPendencias,
} from "@/lib/pendencias-core";
import { tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import { copiarTexto } from "./BotaoCopiar";
import { Button } from "./Button";
import { useQuemExporta } from "./ConfigTabelas";
import { Dropdown } from "./Dropdown";
import { usePodeExportar } from "./ExportarTabelas";
import { Checkbox } from "./Field";
import { IconChevronDown, IconClipboard, IconFile, IconWhatsapp, IconList } from "./icons";
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
  const podeExportar = usePodeExportar();
  const quem = useQuemExporta();
  const [incluirAtencoes, setIncluirAtencoes] = useState(true);
  const [gerando, setGerando] = useState(false);
  const c = contarProtocolo(pendencias);
  const total = c.erros + c.atencoes;
  const exportado = useMemo(() => (incluirAtencoes ? pendencias : soErros(pendencias)), [incluirAtencoes, pendencias]);
  const nomeBase =
    escopo === "protocolo"
      ? `Pendências - Protocolo ${pendencias.numero}`
      : `Pendências - DFD ${pendencias.dfds[0]?.numero ?? ""}${escopo === "item" ? ` - Item ${pendencias.dfds[0]?.itens[0]?.item ?? ""}` : ""}`;

  async function copiar(formato: FormatoTexto) {
    const ok = await copiarTexto(textoPendencias(exportado, formato, escopo));
    if (ok) toast.success(`Copiado (${FORMATOS_TEXTO.find((f) => f.valor === formato)?.rotulo}).`);
    else toast.error("Não foi possível copiar — o navegador bloqueou a área de transferência.");
  }

  async function pdf() {
    if (gerando) return;
    setGerando(true);
    try {
      const [{ baixarDocumentoPdf }, { nomeArquivoPdf }] = await Promise.all([import("@/lib/documento-pdf"), import("@/lib/exportar-pdf-core")]);
      await baixarDocumentoPdf(nomeArquivoPdf(nomeBase, dataIsoBrasilia(new Date().toISOString())), blocosPendenciasPdf(exportado, escopo), { usuario: quem });
    } catch {
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setGerando(false);
    }
  }

  const ICONE: Record<FormatoTexto, ReactNode> = {
    despacho: <IconFile className="h-4 w-4" />,
    whatsapp: <IconWhatsapp className="h-4 w-4" />,
    lista: <IconList className="h-4 w-4" />,
  };

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Chips erros={c.erros} atencoes={c.atencoes} />
        {total > 0 && (
          <div className="flex items-center gap-1.5">
            <Dropdown
              align="end"
              width={280}
              ariaLabel="Copiar as pendências"
              title="Copiar as pendências (despacho, WhatsApp ou lista)"
              triggerClassName="h-11 gap-1.5 rounded-control border border-border-2 bg-surface px-3 text-[13px] font-semibold text-text hover:bg-surface-2 lg:h-[var(--h-control-sm)]"
              trigger={
                <>
                  <IconClipboard className="h-4 w-4" />
                  <span>Copiar</span>
                  <IconChevronDown className="h-3.5 w-3.5 text-muted" />
                </>
              }
            >
              {(fechar) => (
                <div className="space-y-0.5">
                  {FORMATOS_TEXTO.map((f) => (
                    <button
                      key={f.valor}
                      type="button"
                      onClick={() => {
                        fechar();
                        void copiar(f.valor);
                      }}
                      className="flex min-h-11 w-full items-start gap-2 rounded-control px-2 py-1.5 text-left hover:bg-surface-2 lg:min-h-9"
                    >
                      <span className="mt-0.5 text-muted">{ICONE[f.valor]}</span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-text">{f.rotulo}</span>
                        <span className="block text-[11.5px] leading-snug text-muted">{f.dica}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Dropdown>
            {podeExportar && (
              <Button size="sm" variant="secondary" icon={<IconFile className="h-4 w-4" />} loading={gerando} onClick={pdf} title="Baixar o PDF das pendências">
                PDF
              </Button>
            )}
          </div>
        )}
      </div>
      {c.erros > 0 && c.atencoes > 0 && (
        <Checkbox label="Incluir as atenções na cópia e no PDF" checked={incluirAtencoes} onChange={(e) => setIncluirAtencoes(e.target.checked)} />
      )}

      {total === 0 ? (
        <p className="rounded-card border border-border bg-surface p-6 text-center text-sm text-muted">Nenhuma pendência — tudo confere.</p>
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
