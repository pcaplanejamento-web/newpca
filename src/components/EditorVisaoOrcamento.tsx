"use client";

import { useEffect, useMemo, useState } from "react";
import { brl, num } from "@/lib/format";
import {
  aplicarVisao,
  contarAusentes,
  DIMENSOES_VISAO,
  type DimensaoVisao,
  type FiltrosVisao,
  type LinhaOrcamentoVisao,
  opcoesDaDimensao,
  semAusentes,
  type VisaoOrcamento,
  valoresAusentes,
} from "@/lib/orcamento-visao";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { TextField } from "./Field";
import { Modal } from "./Modal";
import { SeletorMultiplo } from "./SeletorMultiplo";

/** Um lançamento do orçamento como a visão o enxerga (as dimensões + a dotação inicial, a prévia do Σ). */
export type LinhaVisaoOrcamento = LinhaOrcamentoVisao & { valorInicial: number };

/**
 * EDITOR de uma VISÃO do orçamento — o BANNER padrão (`Modal`): nome + uma lista suspensa por dimensão da visão
 * (`DIMENSOES_VISAO`; unidade, ações e órgão são dos Vínculos), opções CONECTADAS e a prévia do Σ no rodapé. O MESMO na
 * aba Visões do orçamento e na engrenagem do orçamento do PCA. Avisa os PCAs que usam a visão (ela é global) e os
 * valores escolhidos que o orçamento atual NÃO traz (sobra de um QDD anterior) — com "Remover ausentes". Grava pela rota
 * das visões e devolve o id ao host (`onSalva`), que recarrega a tela.
 */
export function EditorVisaoOrcamento({
  aberta,
  itens,
  podeEditar,
  onFechar,
  onSalva,
}: {
  /** A visão aberta, "nova" ou `null` (fechado). */
  aberta: VisaoOrcamento | "nova" | null;
  itens: LinhaVisaoOrcamento[];
  podeEditar: boolean;
  onFechar: () => void;
  onSalva: (r: { id: number; nova: boolean; nome: string }) => void;
}) {
  const [nome, setNome] = useState("");
  const [filtros, setFiltros] = useState<FiltrosVisao>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();

  // Cada abertura começa do que está gravado.
  useEffect(() => {
    if (!aberta) return;
    setNome(aberta === "nova" ? "" : aberta.nome);
    setFiltros(aberta === "nova" ? {} : aberta.filtros);
    setErro(null);
  }, [aberta]);

  const total = useMemo(() => itens.reduce((s, i) => s + i.valorInicial, 0), [itens]);
  const naVisao = useMemo(() => aplicarVisao(itens, filtros), [itens, filtros]);
  const somaVisao = naVisao.reduce((s, i) => s + i.valorInicial, 0);
  const ausentes = useMemo(() => valoresAusentes(itens, filtros), [itens, filtros]);
  const opcoes = useMemo(() => {
    const m = new Map<DimensaoVisao, { valor: string; contagem: number }[]>();
    if (!aberta) return m;
    for (const d of DIMENSOES_VISAO) m.set(d.key, opcoesDaDimensao(itens, d.key, filtros).map((o) => ({ valor: o.valor, contagem: o.linhas })));
    return m;
  }, [itens, filtros, aberta]);
  const usos = aberta && aberta !== "nova" ? (aberta.pcas ?? []) : [];

  async function removerAusentes() {
    const r = semAusentes(filtros, ausentes);
    if (r.esvaziadas.length) {
      const ok = await confirmar({
        titulo: "Remover os valores ausentes?",
        texto: `Nada do que foi escolhido em ${r.esvaziadas.join(", ")} existe neste orçamento — sem eles, a visão passa a considerar TODOS os valores dessa(s) dimensão(ões).`,
        confirmar: "Remover",
      });
      if (!ok) return;
    }
    setFiltros(r.filtros);
  }

  async function salvar() {
    if (!aberta || !nome.trim() || salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      const nova = aberta === "nova";
      const r = await fetch(nova ? "/api/orcamento/visoes" : `/api/orcamento/visoes/${aberta.id}`, {
        method: nova ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), filtros }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; id?: number };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível salvar a visão.");
      onSalva({ id: nova ? Number(j.id) : aberta.id, nova, nome: nome.trim() });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar a visão.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Modal
        open={aberta != null}
        onClose={onFechar}
        bloqueado={salvando}
        size="lg"
        titulo={aberta === "nova" ? "Nova visão" : podeEditar ? "Editar visão" : "Visão"}
        rodape={
          // Altura FIXA: a prévia numa linha própria (truncada) e os botões abaixo — marcar um item não muda o banner.
          <div className="flex flex-wrap items-center justify-end gap-2">
            <p className="w-full truncate text-sm text-text-2">
              Na visão: <b className="tabular-nums">{brl(somaVisao)}</b> de <span className="tabular-nums">{brl(total)}</span> ·{" "}
              {num(naVisao.length)} {naVisao.length === 1 ? "lançamento" : "lançamentos"}
            </p>
            <Button size="sm" variant="ghost" onClick={onFechar} disabled={salvando}>
              {podeEditar ? "Cancelar" : "Fechar"}
            </Button>
            {podeEditar && (
              <Button size="sm" onClick={salvar} loading={salvando} disabled={!nome.trim()}>
                {aberta === "nova" ? "Criar visão" : "Atualizar visão"}
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-[var(--gap-block)]">
          {erro && <Callout kind="danger">{erro}</Callout>}
          <TextField label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: PCA" maxLength={80} disabled={!podeEditar} />
          {usos.length > 0 && (
            <Callout kind="info">
              Usada por {usos.length === 1 ? "1 PCA" : `${num(usos.length)} PCAs`}: <b>{usos.join("; ")}</b> — alterar a visão muda o orçamento
              de todos eles.
            </Callout>
          )}
          {contarAusentes(ausentes) > 0 && (
            <Callout kind="warn">
              <div className="space-y-1.5">
                <p>
                  <b>{num(contarAusentes(ausentes))} valor(es) da visão não existem neste orçamento</b> (o QDD foi reenviado ou o texto
                  mudou) e não contam nada:
                </p>
                <ul className="list-disc pl-5 text-[13px]">
                  {ausentes.map((a) => (
                    <li key={a.dimensao}>
                      {a.rotulo}: {a.valores.join("; ")}
                    </li>
                  ))}
                </ul>
                {podeEditar && (
                  <Button size="sm" variant="secondary" onClick={removerAusentes} disabled={salvando}>
                    Remover ausentes
                  </Button>
                )}
              </div>
            </Callout>
          )}
          <Callout kind="info">Unidades, ações e órgãos são definidos nos Vínculos — a visão filtra só o restante do orçamento.</Callout>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {DIMENSOES_VISAO.map((d) => (
              <SeletorMultiplo
                key={d.key}
                suspenso
                rotulo={d.rotulo}
                opcoes={opcoes.get(d.key) ?? []}
                selecionados={filtros[d.key] ?? []}
                disabled={!podeEditar || salvando}
                onChange={(vals) => setFiltros((f) => ({ ...f, [d.key]: vals.length ? vals : undefined }))}
              />
            ))}
          </div>
        </div>
      </Modal>
      {confirmacao}
    </>
  );
}
