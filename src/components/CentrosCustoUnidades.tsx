"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { lerJsonGuardado } from "@/lib/dados-cliente";
import { type LinhaMapaCentro, ROTULO_MODO } from "@/lib/subunidades-core";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { type Aviso, Avisos } from "./Avisos";
import { Badge } from "./Badge";
import { CelulaCopiavel } from "./BotaoCopiar";
import { CelulaLista, CelulaTexto } from "./CelulaLista";
import { type Column, DataTable } from "./DataTable";
import { ErroCarga } from "./ErroCarga";
import { SearchField } from "./Field";
import { Modal } from "./Modal";
import { Segmented } from "./Segmented";
import { SkeletonCartao } from "./Skeleton";
import { StatMini } from "./StatMini";

/** Onde a pesquisa procura. */
type Escopo = "tudo" | "centro" | "unidade" | "subunidade";

const ESCOPOS: { value: Escopo; label: string; dica: string }[] = [
  { value: "tudo", label: "Tudo", dica: "Procura no centro de custo, na unidade e na subunidade" },
  { value: "centro", label: "Centro de custo", dica: "Procura só no texto do centro de custo" },
  { value: "unidade", label: "Unidade", dica: "Procura na sigla e no nome da unidade" },
  { value: "subunidade", label: "Subunidade", dica: "Procura no nome da subunidade" },
];

/** Os campos de cada escopo da pesquisa. */
function camposDaBusca(l: LinhaMapaCentro, escopo: Escopo): string[] {
  const unidade = [l.unidade, l.unidadeNome];
  if (escopo === "centro") return [l.centro];
  if (escopo === "unidade") return unidade;
  if (escopo === "subunidade") return l.subunidades;
  return [l.centro, ...unidade, ...l.subunidades, l.orgao];
}

const chaveLinha = (l: LinhaMapaCentro) => `${l.reparticaoId}:${l.subunidadeId ?? "u"}:${l.chave}`;

/**
 * CENTROS DE CUSTO — o banner que mostra ONDE cada centro de custo cadastrado está vinculado (a unidade e a subunidade),
 * em TODAS as unidades do sistema. A pesquisa procura no centro, na unidade ou na subunidade; as colunas filtram como
 * qualquer tabela e o mesmo centro em dois cadastros é apontado no (!). Tocar numa linha abre a unidade (`onAbrir`).
 */
export function CentrosCustoUnidades({ aberto, onFechar, onAbrir }: { aberto: boolean; onFechar: () => void; onAbrir: (l: LinhaMapaCentro) => void }) {
  const [linhas, setLinhas] = useState<LinhaMapaCentro[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [escopo, setEscopo] = useState<Escopo>("tudo");

  const carregar = useCallback(async (fresco = false) => {
    setErro(null);
    try {
      const j = await lerJsonGuardado<{ linhas?: LinhaMapaCentro[] }>("adm.centros-custo", "/api/admin/reparticoes/centros-custo", "Erro ao carregar os centros de custo.", fresco);
      setLinhas(j.linhas ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar os centros de custo.");
    }
  }, []);

  useEffect(() => {
    if (aberto) void carregar();
  }, [aberto, carregar]);

  const filtradas = useMemo(() => {
    const p = predicadoBusca(busca);
    return !linhas ? [] : p ? linhas.filter((l) => p(camposDaBusca(l, escopo))) : linhas;
  }, [linhas, busca, escopo]);

  const nomes = useMemo(() => new Map((linhas ?? []).map((l) => [l.unidade, l.unidadeNome])), [linhas]);

  const resumo = useMemo(() => {
    const l = filtradas;
    return {
      centros: new Set(l.map((x) => x.chave)).size,
      unidades: new Set(l.map((x) => x.reparticaoId)).size,
      subunidades: new Set(l.filter((x) => x.subunidadeId != null).map((x) => x.subunidadeId)).size,
      dfds: l.reduce((s, x) => s + x.dfds, 0),
    };
  }, [filtradas]);

  const avisos = useMemo<Aviso[]>(() => {
    const rep = new Map<string, LinhaMapaCentro[]>();
    for (const l of linhas ?? []) if (l.repetido) rep.set(l.chave, [...(rep.get(l.chave) ?? []), l]);
    return [...rep.values()].map((ls) => ({
      id: ls[0].chave,
      tom: "danger",
      texto: `“${ls[0].centro}” está em mais de um cadastro: ${ls.map((l) => (l.subunidadeId != null ? `${l.unidade} › ${l.subunidades[0]}` : l.unidade)).join("; ")} — deixe-o em um só.`,
    }));
  }, [linhas]);

  const colunas = useMemo<Column<LinhaMapaCentro>[]>(
    () => [
      {
        key: "centro",
        header: "Centro de custo",
        align: "left",
        minWidth: 260,
        value: (l) => l.centro,
        render: (l) => (
          <span className="inline-flex max-w-full items-center gap-1.5">
            <CelulaCopiavel copiar={l.centro} rotulo="centro de custo">
              <CelulaTexto texto={l.centro} />
            </CelulaCopiavel>
            {l.repetido && (
              <Badge tone="red" title="O mesmo centro de custo está em mais de um cadastro">
                Repetido
              </Badge>
            )}
          </span>
        ),
      },
      {
        key: "unidade",
        header: "Unidade",
        nowrap: true,
        value: (l) => l.unidade,
        detalhe: (s) => nomes.get(s),
        render: (l) => <span title={l.unidadeNome}>{l.unidade}</span>,
      },
      { key: "orgao", header: "Órgão", nowrap: true, value: (l) => l.orgao || "—", render: (l) => l.orgao || <span className="text-faint">—</span> },
      {
        key: "subunidade",
        header: "Subunidade",
        value: (l) => l.subunidades.join(", "),
        valores: (l) => l.subunidades,
        render: (l) => (
          <CelulaLista valores={l.subunidades} dica={l.modo === "unico" && l.subunidadeId == null ? "Escolhida em cada DFD entre estas" : undefined} />
        ),
      },
      {
        key: "modo",
        header: "Modo",
        nowrap: true,
        value: (l) => ROTULO_MODO[l.modo],
        render: (l) => <span className="text-muted">{ROTULO_MODO[l.modo]}</span>,
      },
      {
        key: "dfds",
        header: "DFDs",
        nowrap: true,
        filter: "range",
        numero: (l) => l.dfds,
        formatarFaixa: (n) => String(Math.round(n)),
        value: (l) => String(l.dfds),
        render: (l) => <span className="tabular-nums">{l.dfds || <span className="text-faint">0</span>}</span>,
      },
    ],
    [nomes],
  );

  return (
    <Modal
      open={aberto}
      onClose={onFechar}
      titulo="Centros de custo"
      size="full"
      acoesCabecalho={
        <>
          <Avisos avisos={avisos} titulo="Centros de custo" />
          <Ajuda titulo="Centros de custo">
            <p>Todos os centros de custo cadastrados nas unidades do sistema e onde cada um está vinculado.</p>
            <TopicoAjuda titulo="Pesquisar">Escolha onde procurar — no centro de custo, na unidade (sigla ou nome) ou na subunidade. Vários termos separados por “:” acham qualquer um.</TopicoAjuda>
            <TopicoAjuda titulo="Subunidade">
              No modo “{ROTULO_MODO.unico}”, o centro é da unidade e a subunidade é escolhida em cada DFD (a coluna mostra as cadastradas). No modo “{ROTULO_MODO.subunidades}”, o centro é da subunidade.
            </TopicoAjuda>
            <TopicoAjuda titulo="DFDs">Quantos DFDs da unidade têm o centro de custo (o mesmo texto ou o mesmo último nome, como na conferência do DFD).</TopicoAjuda>
            <TopicoAjuda titulo="Abrir">Toque numa linha para abrir a unidade e editar o cadastro.</TopicoAjuda>
          </Ajuda>
        </>
      }
    >
      <div className="space-y-[var(--gap-block)]">
        {erro && <ErroCarga msg={erro} onTentar={() => void carregar(true)} kind={linhas ? "warn" : "danger"} />}
        {!linhas ? (
          !erro && <SkeletonCartao linhas={8} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-4">
              <StatMini label="Centros de custo" value={resumo.centros} />
              <StatMini label="Unidades" value={resumo.unidades} />
              <StatMini label="Subunidades" value={resumo.subunidades} hint="As donas de um centro (modo por subunidade)" />
              <StatMini label="DFDs" value={resumo.dfds} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-[14rem] flex-1">
                <SearchField
                  compacto
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  onClear={() => setBusca("")}
                  placeholder={`Pesquisar ${escopo === "tudo" ? "centro, unidade ou subunidade" : ESCOPOS.find((x) => x.value === escopo)?.label.toLowerCase()}…`}
                  aria-label="Pesquisar centros de custo"
                />
              </div>
              <Segmented ariaLabel="Onde pesquisar" value={escopo} onChange={setEscopo} options={ESCOPOS} />
            </div>
            <DataTable
              columns={colunas}
              rows={filtradas}
              getKey={chaveLinha}
              onRowClick={onAbrir}
              density="compact"
              linhasSalvas="centros-custo"
              exportar={{ nome: "Centros de custo" }}
              vazio={linhas.length ? "Nenhum centro de custo com esta pesquisa." : "Nenhum centro de custo cadastrado nas unidades."}
              resumo={(ls) => `${ls.length} vínculo${ls.length === 1 ? "" : "s"} · ${ls.reduce((s, l) => s + l.dfds, 0)} DFDs`}
            />
          </>
        )}
      </div>
    </Modal>
  );
}
