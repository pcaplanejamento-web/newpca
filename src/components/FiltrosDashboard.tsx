"use client";

import { type ReactNode, useState } from "react";
import { Button } from "./Button";
import { IconFilter } from "./icons";
import { Modal } from "./Modal";
import { SeletorMultiplo } from "./SeletorMultiplo";

/** Uma opção do filtro: a chave (o que o filtro guarda), o texto e quantos itens. */
export type OpcaoFiltroDash = { chave: string; rotulo: string; count: number; detalhe?: string };
export type CampoFiltroDash = { dim: string; rotulo: string; opcoes: OpcaoFiltroDash[]; selecionados: string[] };

/**
 * FILTROS DO DASHBOARD — uma linha de menus suspensos de seleção MÚLTIPLA (busca, marcar todos, limpar), um por
 * dimensão dos gráficos. As opções chegam CONECTADAS (só o que existe com os demais filtros, com a contagem de itens);
 * nenhum marcado = sem filtro. Os mesmos filtros que o toque nos gráficos liga — os dois caminhos ficam em sincronia.
 * A opção é guardada pela CHAVE (dois textos iguais nunca se fundem). `principais` = as dimensões À VISTA na linha; as
 * demais ficam em "Mais filtros (N)" — um banner com os mesmos seletores (N = as dimensões filtradas ali).
 * `grade` = TODOS os filtros à vista, em colunas (muitas dimensões — nenhum escondido).
 */
export function FiltrosDashboard({
  campos,
  onMudar,
  fim,
  principais,
  grade = false,
  antes,
}: {
  campos: CampoFiltroDash[];
  onMudar: (dim: string, chaves: string[]) => void;
  /** Ao fim da MESMA linha (ex.: a ajuda e o PDF). */
  fim?: ReactNode;
  /** As dimensões da linha (sem = todas). */
  principais?: readonly string[];
  /** Todos à vista em colunas (sem "Mais filtros"). */
  grade?: boolean;
  /** No `grade`: as primeiras células (ex.: a Visão e o Período, que filtra o tempo). */
  antes?: ReactNode | ReactNode[];
}) {
  const [mais, setMais] = useState(false);
  if (grade) return <FiltrosEmGrade campos={campos} onMudar={onMudar} antes={antes} />;
  const naLinha = principais ? campos.filter((c) => principais.includes(c.dim)) : campos;
  const escondidos = principais ? campos.filter((c) => !principais.includes(c.dim)) : [];
  const nMais = escondidos.filter((c) => c.selecionados.length > 0).length;
  const seletor = (c: CampoFiltroDash, campo: boolean) => (
    <SeletorMultiplo
      suspenso={!campo}
      campo={campo ? {} : undefined}
      rotulo={c.rotulo}
      textoVazio="Todos"
      opcoes={c.opcoes.map((o) => ({ valor: o.chave, rotulo: o.rotulo, contagem: o.count, detalhe: o.detalhe }))}
      selecionados={c.selecionados}
      onChange={(vs) => onMudar(c.dim, vs)}
    />
  );
  // UMA linha no desktop (cada filtro divide o espaço); no celular quebra, com o `fim` sempre junto.
  return (
    <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
      {naLinha.map((c) => (
        <div key={c.dim} className="min-w-0 flex-1 basis-44">
          {seletor(c, false)}
        </div>
      ))}
      {escondidos.length > 0 && (
        <Button size="sm" variant={nMais ? "primary" : "secondary"} icon={<IconFilter className="h-4 w-4" />} onClick={() => setMais(true)} title="Os demais filtros" className="shrink-0">
          Mais filtros{nMais ? ` (${nMais})` : ""}
        </Button>
      )}
      {fim && <div className="flex shrink-0 items-center gap-1.5">{fim}</div>}
      {escondidos.length > 0 && (
        <Modal
          open={mais}
          onClose={() => setMais(false)}
          titulo="Mais filtros"
          size="lg"
          rodape={
            <div className="flex w-full items-center justify-between gap-2">
              <Button size="sm" variant="secondary" disabled={!nMais} onClick={() => {
                  for (const c of escondidos) if (c.selecionados.length) onMudar(c.dim, []);
                }}>
                Limpar estes filtros
              </Button>
              <Button size="sm" onClick={() => setMais(false)}>
                Pronto
              </Button>
            </div>
          }
        >
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            {escondidos.map((c) => (
              <div key={c.dim} className="min-w-0">
                {seletor(c, true)}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

/** O modo `grade`: um seletor suspenso por dimensão, TODOS à vista, em colunas que acompanham a largura. */
function FiltrosEmGrade({ campos, onMudar, antes }: { campos: CampoFiltroDash[]; onMudar: (dim: string, chaves: string[]) => void; antes?: ReactNode | ReactNode[] }) {
  const primeiras = (Array.isArray(antes) ? antes : [antes]).filter(Boolean);
  // Na tela larga, as células em linhas cheias (até 14 = 2 × 7; mais = 2 × 8).
  const largas = primeiras.length + campos.length > 14 ? "2xl:grid-cols-8" : "2xl:grid-cols-7";
  return (
    <div className={`grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 ${largas}`}>
      {primeiras.map((n, i) => (
        <div key={i} className="min-w-0">
          {n}
        </div>
      ))}
      {campos.map((c) => (
        <div key={c.dim} className="min-w-0">
          <SeletorMultiplo
            suspenso
            rotulo={c.rotulo}
            textoVazio="Todos"
            opcoes={c.opcoes.map((o) => ({ valor: o.chave, rotulo: o.rotulo, contagem: o.count, detalhe: o.detalhe }))}
            selecionados={c.selecionados}
            onChange={(vs) => onMudar(c.dim, vs)}
          />
        </div>
      ))}
    </div>
  );
}
