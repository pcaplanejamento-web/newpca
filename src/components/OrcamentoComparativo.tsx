"use client";

import { useMemo, useState } from "react";
import { exportarCruzamentoXlsx } from "@/lib/exportar-orcamento";
import { brl, num } from "@/lib/format";
import type { OrcamentoItemRow } from "@/lib/orcamento";
import {
  COL_EXTRA,
  COL_TOTAL,
  chaveLayoutComparativo,
  coerceLayout,
  colunaPermitida,
  cruzar,
  LARGURA_MAX,
  LARGURA_MIN,
  type LayoutCruzamento,
  lancamentosDoRecorte,
  layoutIgual,
  MEDIDAS_ORCAMENTO,
  type MedidaOrcamento,
  type ModoCruzamento,
  matrizCruzamento,
  medidaOrcamento,
  type OrdemColunas,
  type OrdemCruzamento,
  ordenarLinhas,
  percentual,
  permissoesColunas,
  permissoesLinhas,
  reordenarColunas,
  semVazios,
} from "@/lib/orcamento-cruzamento";
import { type AlvoVinculo, mapaVinculos, type VinculoOrcamento } from "@/lib/orcamento-vinculo";
import { aplicarVisao, DIMENSOES_ORCAMENTO, type DimensaoOrcamento, type VisaoOrcamento, valorDimensao } from "@/lib/orcamento-visao";
import { opcoesDaBusca, predicadoBusca } from "@/lib/tabela-filtros";
import { FerramentasAba } from "./AbasEspaco";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Button } from "./Button";
import { type Column, DataTable } from "./DataTable";
import { Checkbox, SearchField, SelectField } from "./Field";
import { IconColunas, IconDesafixar, IconDownload, IconFixar, IconSave, IconTrocar } from "./icons";
import { Modal } from "./Modal";
import { OrigemDados } from "./OrigemDados";
import { Segmented } from "./Segmented";
import { TabelaCruzada } from "./TabelaCruzada";

const rotuloDim = (d: DimensaoOrcamento) => DIMENSOES_ORCAMENTO.find((x) => x.key === d)?.rotulo ?? d;
const TIPO_VINCULO: Partial<Record<DimensaoOrcamento, "orgao" | "unidade">> = { orgao: "orgao", unidade: "unidade" };

const MODOS: { value: ModoCruzamento; label: string; curto: string }[] = [
  { value: "valor", label: "R$", curto: "R$" },
  { value: "linha", label: "% linha", curto: "% lin." },
  { value: "coluna", label: "% coluna", curto: "% col." },
  { value: "total", label: "% total", curto: "% tot." },
];
const ORDENS_COLUNAS: { value: OrdemColunas; label: string }[] = [
  { value: "rotulo", label: "A–Z" },
  { value: "rotulo-desc", label: "Z–A" },
  { value: "total-desc", label: "Maior total" },
  { value: "total-asc", label: "Menor total" },
];

/**
 * Aba COMPARATIVO da tela do orçamento — a TABELA CRUZADA (horizontal, como a planilha da Prefeitura): o usuário LIGA
 * duas colunas do CUBO (uma nas LINHAS, outra nas COLUNAS — ex.: Unidade × Elemento de despesa) e compara os valores da
 * MEDIDA escolhida. Ao escolher as linhas, o seletor das colunas APONTA as permitidas (as demais aparecem desabilitadas
 * com o motivo — `permissoesColunas`). AJUSTES da tabela — largura de cada coluna (arrastar a borda do cabeçalho),
 * colunas congeladas e OCULTAS, a ordem das linhas (qualquer cabeçalho) e a das colunas — ficam num layout por PAR de
 * colunas ligadas que o usuário SALVA na conta dele (`PUT /api/preferencias/tabela`) e volta ao padrão quando quiser.
 * O painel "Colunas" concentra ocultar/congelar (uma a uma ou todas), a ordem das colunas e as opções de exibição.
 */
export function OrcamentoComparativo({
  titulo,
  itens,
  visoes,
  vinculos,
  alvos,
  layoutsSalvos,
}: {
  titulo: string;
  itens: OrcamentoItemRow[];
  visoes: VisaoOrcamento[];
  vinculos: VinculoOrcamento[];
  alvos: { orgaos: AlvoVinculo[]; unidades: AlvoVinculo[] };
  /** Os ajustes SALVOS do usuário, por chave (`chaveLayoutComparativo`). */
  layoutsSalvos: Record<string, unknown>;
}) {
  const [dimLinha, setDimLinha] = useState<DimensaoOrcamento>("unidade");
  const [dimColuna, setDimColuna] = useState<DimensaoOrcamento>("nomeElemento");
  const [medida, setMedida] = useState<MedidaOrcamento>("inicial");
  const [visaoId, setVisaoId] = useState<number | null>(null);
  const [modo, setModo] = useState<ModoCruzamento>("valor");
  const [calor, setCalor] = useState(false);
  const [ocultarZerados, setOcultarZerados] = useState(true);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<{ linha: string | null; coluna: string | null } | null>(null);
  const [painel, setPainel] = useState(false);
  const [buscaColunas, setBuscaColunas] = useState("");
  const [salvos, setSalvos] = useState(layoutsSalvos);
  const [edicao, setEdicao] = useState<{ chave: string; layout: LayoutCruzamento } | null>(null);
  const [gravando, setGravando] = useState(false);
  const [aviso, setAviso] = useState<{ kind: "ok" | "danger"; texto: string } | null>(null);

  const visao = visoes.find((v) => v.id === visaoId) ?? null;
  const base = useMemo(() => (visao ? aplicarVisao(itens, visao.filtros) : itens), [itens, visao]);

  // As duas colunas LIGADAS: a das linhas (com dados) e a das colunas (a permitida — senão a 1ª permitida).
  const permLinhas = useMemo(() => permissoesLinhas(base), [base]);
  const linha = permLinhas[dimLinha].permitida ? dimLinha : (DIMENSOES_ORCAMENTO.find((d) => permLinhas[d.key].permitida)?.key ?? dimLinha);
  const permColunas = useMemo(() => permissoesColunas(base, linha), [base, linha]);
  const coluna = colunaPermitida(permColunas, dimColuna);
  const podeTrocar = useMemo(() => coluna != null && permissoesColunas(base, coluna)[linha].permitida, [base, coluna, linha]);

  // AJUSTES do par ligado: o SALVO (ou o padrão) até o usuário mexer; a edição vale só para o par em que foi feita.
  const chave = coluna ? chaveLayoutComparativo(linha, coluna) : "";
  const salvo = useMemo(() => coerceLayout(salvos[chave]), [salvos, chave]);
  const layout = edicao?.chave === chave ? edicao.layout : salvo;
  const sujo = !layoutIgual(layout, salvo);
  const temSalvo = chave in salvos;
  const mudar = (f: (l: LayoutCruzamento) => LayoutCruzamento) => setEdicao({ chave, layout: f(layout) });

  // O cruzamento (sem zerados, se pedido) na ordem das colunas → e sem as OCULTAS (o que a tabela mostra).
  const cruzBase = useMemo(() => {
    if (!coluna) return null;
    const c = cruzar(base, linha, coluna, medida);
    return reordenarColunas(ocultarZerados ? semVazios(c) : c, layout.ordemColunas);
  }, [base, linha, coluna, medida, ocultarZerados, layout.ordemColunas]);
  const cruz = useMemo(() => (cruzBase ? reordenarColunas(cruzBase, layout.ordemColunas, layout.ocultas) : null), [cruzBase, layout.ordemColunas, layout.ocultas]);

  // A sigla do CADASTRO (Vínculos) ao lado de Órgão/Unidade — a chave do vínculo é a MESMA do agrupamento.
  const tipo = TIPO_VINCULO[linha];
  const siglaDe = useMemo(() => {
    if (!tipo) return null;
    const mapa = mapaVinculos(vinculos);
    const porId = new Map((tipo === "orgao" ? alvos.orgaos : alvos.unidades).map((a) => [a.id, a.sigla]));
    return (k: string) => porId.get(mapa.get(`${tipo}|${k}`) ?? -1) ?? "";
  }, [tipo, vinculos, alvos]);
  const comSigla = siglaDe != null && !layout.ocultas.includes(COL_EXTRA);
  const comTotal = !layout.ocultas.includes(COL_TOTAL);

  const linhas = useMemo(() => {
    if (!cruz) return [];
    const casa = predicadoBusca(busca);
    const ordenadas = ordenarLinhas(cruz, layout.ordemLinhas, siglaDe ?? undefined).map((l) => ({ ...l, extra: siglaDe?.(l.chave) }));
    return casa ? ordenadas.filter((l) => casa([l.rotulo, l.extra ?? ""])) : ordenadas;
  }, [cruz, layout.ordemLinhas, busca, siglaDe]);

  // Trocar uma das colunas ligadas fecha o detalhe (o layout segue o PAR — o salvo dele, se houver).
  const escolherLinha = (d: DimensaoOrcamento) => {
    setDimLinha(d);
    setAberto(null);
  };
  const escolherColuna = (d: DimensaoOrcamento) => {
    setDimColuna(d);
    setAberto(null);
  };
  const trocarEixos = () => {
    if (!coluna) return;
    setDimLinha(coluna);
    setDimColuna(linha);
    setAberto(null);
  };
  const ordenar = (por: OrdemCruzamento["por"]) =>
    mudar((l) => {
      const o = l.ordemLinhas;
      const mesma = typeof por === "object" ? typeof o.por === "object" && o.por.coluna === por.coluna : o.por === por;
      // 1º clique: textos em ordem crescente, valores do MAIOR para o menor; o 2º inverte.
      return { ...l, ordemLinhas: mesma ? { por, desc: !o.desc } : { por, desc: por !== "rotulo" && por !== "extra" } };
    });
  const definirLargura = (k: string, px: number | null) =>
    mudar((l) => {
      const larguras = { ...l.larguras };
      if (px == null) delete larguras[k];
      else larguras[k] = Math.round(Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, px)));
      return { ...l, larguras };
    });
  const alternar = (lista: "fixadas" | "ocultas", k: string) =>
    mudar((l) => ({ ...l, [lista]: l[lista].includes(k) ? l[lista].filter((x) => x !== k) : [...l[lista], k] }));

  async function preferencia(metodo: "PUT" | "DELETE", corpo: object): Promise<boolean> {
    setGravando(true);
    const r = await fetch("/api/preferencias/tabela", {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    }).catch(() => null);
    setGravando(false);
    return r?.ok === true;
  }
  async function salvar() {
    if (!chave) return;
    if (!(await preferencia("PUT", { chave, valor: layout }))) return setAviso({ kind: "danger", texto: "Não foi possível salvar os ajustes." });
    setSalvos((s) => ({ ...s, [chave]: layout }));
    setEdicao(null);
    setAviso({ kind: "ok", texto: `Ajustes salvos para ${rotuloDim(linha)} × ${coluna ? rotuloDim(coluna) : ""}.` });
  }
  async function restaurar() {
    if (!chave) return;
    if (temSalvo) {
      if (!(await preferencia("DELETE", { chave }))) return setAviso({ kind: "danger", texto: "Não foi possível restaurar o padrão." });
      setSalvos((s) => {
        const { [chave]: _, ...resto } = s;
        return resto;
      });
    }
    setEdicao(null);
    setAviso({ kind: "ok", texto: "Tabela no padrão." });
  }

  const m = medidaOrcamento(medida);
  const exportar = () => {
    if (!cruz || !coluna) return;
    const extra = comSigla && siglaDe ? { rotulo: "Sigla", de: siglaDe } : undefined;
    exportarCruzamentoXlsx(`${titulo} - ${rotuloDim(linha)} x ${rotuloDim(coluna)}`, matrizCruzamento(cruz, linhas, rotuloDim(linha), extra), extra != null);
  };

  // As colunas do PAINEL (todas, inclusive as ocultas, na ordem das colunas) — com a busca (vários com ":").
  const colunasPainel = useMemo(() => {
    const todas = [
      ...(siglaDe ? [{ chave: COL_EXTRA, rotulo: "Sigla", fixa: true }] : []),
      { chave: COL_TOTAL, rotulo: "Total", fixa: true },
      ...(cruzBase?.colunas ?? []).map((c) => ({ chave: c.chave, rotulo: c.rotulo, fixa: false })),
    ];
    const casam = new Set(opcoesDaBusca(todas.map((c) => c.rotulo), buscaColunas));
    return casam.size === todas.length ? todas : todas.filter((c) => casam.has(c.rotulo));
  }, [siglaDe, cruzBase, buscaColunas]);
  const dados = (cruzBase?.colunas ?? []).map((c) => c.chave);
  const visiveisDados = dados.filter((k) => !layout.ocultas.includes(k));

  // ORIGEM do número clicado: os lançamentos do recorte (a MESMA chave do cruzamento — a soma bate).
  const recorte = useMemo(
    () => (aberto && coluna ? lancamentosDoRecorte(base, linha, coluna, aberto.linha, aberto.coluna) : []),
    [aberto, base, linha, coluna],
  );
  const somaRecorte = recorte.reduce((s, l) => s + m.valor(l), 0);
  const pctDoTotal = percentual(somaRecorte, cruz?.total ?? 0);
  const rotuloRecorte = aberto
    ? [
        aberto.linha != null ? cruz?.linhas.find((l) => l.chave === aberto.linha)?.rotulo : null,
        aberto.coluna != null ? cruzBase?.colunas.find((c) => c.chave === aberto.coluna)?.rotulo : null,
      ]
        .filter(Boolean)
        .join(" × ") || "Total geral"
    : "";
  const colunasRecorte: Column<OrcamentoItemRow>[] = [
    ...DIMENSOES_ORCAMENTO.filter((d) => ["orgao", "unidade", "nomeElemento", "codigoElemento", "ficha", "fonte"].includes(d.key)).map(
      (d): Column<OrcamentoItemRow> => ({
        key: d.key,
        header: d.rotulo,
        minWidth: d.key === "codigoElemento" || d.key === "ficha" ? undefined : 180,
        nowrap: d.key === "codigoElemento" || d.key === "ficha",
        value: (r) => valorDimensao(r, d.key),
        render: (r) => (
          <span className="block max-w-[260px] truncate text-text-2" title={valorDimensao(r, d.key)}>
            {valorDimensao(r, d.key)}
          </span>
        ),
      }),
    ),
    {
      key: "medida",
      header: m.rotulo,
      align: "right",
      nowrap: true,
      filter: "range",
      numero: (r) => m.valor(r),
      render: (r) => <span className="font-semibold tabular-nums text-text">{brl(m.valor(r))}</span>,
    },
  ];

  const opcaoDim = (d: (typeof DIMENSOES_ORCAMENTO)[number], p: { permitida: boolean; motivo: string | null; valores: number }) => (
    <option key={d.key} value={d.key} disabled={!p.permitida}>
      {p.permitida ? `${d.rotulo} (${num(p.valores)})` : `${d.rotulo} — ${p.motivo}`}
    </option>
  );
  const nAjustes = layout.ocultas.length + layout.fixadas.length;

  return (
    <>
      <FerramentasAba>
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <SearchField
            compacto
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onClear={() => setBusca("")}
            placeholder={`Buscar ${rotuloDim(linha).toLowerCase()}… (vários com :)`}
            aria-label="Buscar nas linhas"
          />
        </div>
        <Button size="sm" variant="secondary" icon={<IconDownload className="h-4 w-4" />} onClick={exportar} disabled={!cruz || linhas.length === 0}>
          XLSX
        </Button>
      </FerramentasAba>

      <div className="mb-[var(--gap-block)] flex flex-wrap items-center gap-2">
        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:flex sm:w-auto">
          <div className="min-w-0 sm:w-52">
            <SelectField compacto label="Linhas" value={linha} onChange={(e) => escolherLinha(e.target.value as DimensaoOrcamento)}>
              {DIMENSOES_ORCAMENTO.map((d) => opcaoDim(d, permLinhas[d.key]))}
            </SelectField>
          </div>
          <Button
            size="sm"
            variant="icon"
            icon={<IconTrocar className="h-4 w-4" />}
            onClick={trocarEixos}
            disabled={!podeTrocar}
            aria-label="Inverter linhas e colunas"
            title={podeTrocar ? "Inverter linhas e colunas" : "Não dá para inverter: a dimensão das linhas não é permitida nas colunas"}
          />
          <div className="min-w-0 sm:w-60">
            <SelectField compacto label="Colunas" value={coluna ?? ""} onChange={(e) => escolherColuna(e.target.value as DimensaoOrcamento)}>
              {coluna == null && <option value="">Nenhuma permitida</option>}
              {DIMENSOES_ORCAMENTO.map((d) => opcaoDim(d, permColunas[d.key]))}
            </SelectField>
          </div>
        </div>
        <div className="w-full sm:w-52">
          <SelectField compacto label="Medida" value={medida} onChange={(e) => setMedida(e.target.value as MedidaOrcamento)}>
            {MEDIDAS_ORCAMENTO.map((x) => (
              <option key={x.key} value={x.key}>
                {x.rotulo}
              </option>
            ))}
          </SelectField>
        </div>
        {visoes.length > 0 && (
          <div className="w-full sm:w-52">
            <SelectField
              compacto
              label="Visão"
              value={visaoId ?? ""}
              onChange={(e) => {
                setVisaoId(e.target.value ? Number(e.target.value) : null);
                setAberto(null);
              }}
            >
              <option value="">Orçamento inteiro</option>
              {visoes.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </SelectField>
          </div>
        )}
        <div className="flex items-center gap-2 lg:ml-auto">
          <Segmented<ModoCruzamento> ariaLabel="Ler as células como" value={modo} onChange={setModo} options={MODOS} />
          <Button size="sm" variant="secondary" icon={<IconColunas className="h-4 w-4" />} onClick={() => setPainel(true)} disabled={!cruzBase}>
            Colunas{nAjustes > 0 ? ` · ${nAjustes}` : ""}
          </Button>
        </div>
      </div>

      <TabelaCruzada
        rotuloLinhas={rotuloDim(linha)}
        rotuloExtra={comSigla ? "Sigla" : undefined}
        mostrarTotal={comTotal}
        linhas={linhas}
        colunas={cruz?.colunas ?? []}
        total={cruz?.total ?? 0}
        formatar={brl}
        modo={modo}
        calor={calor}
        fixadas={layout.fixadas}
        larguras={layout.larguras}
        onLargura={definirLargura}
        ordem={layout.ordemLinhas}
        onOrdenar={ordenar}
        onAbrir={(l, c) => setAberto({ linha: l, coluna: c })}
        ativa={aberto}
        vazio={
          !coluna
            ? "Nenhuma coluna permitida para cruzar com estas linhas."
            : cruzBase && cruzBase.colunas.length > 0 && cruz?.colunas.length === 0
              ? "Todas as colunas estão ocultas — mostre alguma em “Colunas”."
              : busca
                ? "Nenhuma linha para esta busca."
                : "Nenhum lançamento para comparar."
        }
        resumo={
          cruz && coluna
            ? `${num(linhas.length)} ${linhas.length === 1 ? "linha" : "linhas"} × ${num(cruz.colunas.length)} ${cruz.colunas.length === 1 ? "coluna" : "colunas"} · ${m.rotulo} ${brl(cruz.total)}`
            : undefined
        }
        acoesRodape={
          sujo || temSalvo ? (
            <>
              {sujo && <span className="text-[12px] text-muted">Ajustes não salvos</span>}
              <Button size="sm" variant="ghost" onClick={restaurar} disabled={gravando}>
                Padrão
              </Button>
              {sujo && (
                <Button size="sm" icon={<IconSave className="h-4 w-4" />} onClick={salvar} loading={gravando}>
                  Salvar
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      <Modal
        open={painel}
        onClose={() => setPainel(false)}
        titulo="Colunas"
        size="md"
        rodape={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={restaurar} disabled={gravando || (!sujo && !temSalvo)}>
              Restaurar padrão
            </Button>
            <Button size="sm" icon={<IconSave className="h-4 w-4" />} onClick={salvar} loading={gravando} disabled={!sujo}>
              Salvar ajustes
            </Button>
          </div>
        }
      >
        <div className="space-y-[var(--gap-block)]">
          <div className="space-y-2">
            <p className="text-[12px] font-medium text-muted">Ordem das colunas</p>
            <Segmented<OrdemColunas>
              ariaLabel="Ordem das colunas"
              value={layout.ordemColunas}
              onChange={(v) => mudar((l) => ({ ...l, ordemColunas: v }))}
              options={ORDENS_COLUNAS}
            />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <div className="flex min-h-11 items-center lg:min-h-0">
              <Checkbox checked={calor} onChange={(e) => setCalor(e.target.checked)} label="Mapa de calor" />
            </div>
            <div className="flex min-h-11 items-center lg:min-h-0">
              <Checkbox checked={ocultarZerados} onChange={(e) => setOcultarZerados(e.target.checked)} label="Ocultar linhas e colunas zeradas" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<IconFixar className="h-4 w-4" />}
              onClick={() => mudar((l) => ({ ...l, fixadas: visiveisDados }))}
              disabled={visiveisDados.length === 0}
            >
              Fixar todas
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<IconDesafixar className="h-4 w-4" />}
              onClick={() => mudar((l) => ({ ...l, fixadas: [] }))}
              disabled={layout.fixadas.length === 0}
            >
              Desfixar todas
            </Button>
            <Button size="sm" variant="ghost" onClick={() => mudar((l) => ({ ...l, ocultas: [] }))} disabled={layout.ocultas.length === 0}>
              Mostrar todas
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => mudar((l) => ({ ...l, ocultas: [...new Set([...l.ocultas, ...dados])] }))}
              disabled={visiveisDados.length === 0}
            >
              Ocultar todas
            </Button>
            <Button size="sm" variant="ghost" onClick={() => mudar((l) => ({ ...l, larguras: {} }))} disabled={Object.keys(layout.larguras).length === 0}>
              Larguras padrão
            </Button>
          </div>
          <SearchField
            compacto
            value={buscaColunas}
            onChange={(e) => setBuscaColunas(e.target.value)}
            onClear={() => setBuscaColunas("")}
            placeholder="Buscar coluna… (vários com :)"
            aria-label="Buscar coluna"
          />
          <ul className="divide-y divide-border/60 rounded-control border border-border">
            {colunasPainel.map((c) => {
              const visivel = !layout.ocultas.includes(c.chave);
              const fixa = layout.fixadas.includes(c.chave);
              const Pino = fixa ? IconDesafixar : IconFixar;
              return (
                <li key={c.chave} className="flex min-h-11 items-center gap-2 px-3 lg:min-h-9">
                  <div className="min-w-0 flex-1 truncate">
                    <Checkbox checked={visivel} onChange={() => alternar("ocultas", c.chave)} label={c.rotulo} />
                  </div>
                  {c.fixa ? (
                    <span className="shrink-0 text-[12px] text-faint">sempre à esquerda</span>
                  ) : (
                    <Button
                      size="xs"
                      variant="ghost"
                      aria-pressed={fixa}
                      aria-label={fixa ? `Desfixar ${c.rotulo}` : `Fixar ${c.rotulo}`}
                      title={fixa ? "Desfixar" : "Fixar à esquerda"}
                      disabled={!visivel}
                      icon={<Pino className={`h-4 w-4 ${fixa ? "text-accent" : "text-faint"}`} />}
                      onClick={() => alternar("fixadas", c.chave)}
                    />
                  )}
                </li>
              );
            })}
            {colunasPainel.length === 0 && <li className="px-3 py-3 text-[13px] text-faint">Nenhuma coluna para esta busca.</li>}
          </ul>
          <p className="text-[12px] text-muted">
            Ajuste a largura arrastando a borda do cabeçalho (duplo clique volta ao padrão) e ordene as linhas tocando no cabeçalho de qualquer coluna. Os ajustes
            valem para {rotuloDim(linha)} × {coluna ? rotuloDim(coluna) : "—"}.
          </p>
        </div>
      </Modal>

      <OrigemDados
        aberto={aberto != null}
        onClose={() => setAberto(null)}
        titulo={`Comparativo · ${m.rotulo}`}
        recorte={rotuloRecorte}
        resumo={[
          { label: m.rotulo, value: brl(somaRecorte) },
          { label: "Lançamentos", value: num(recorte.length) },
          { label: "Do total", value: pctDoTotal == null ? "—" : `${pctDoTotal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` },
          { label: "Visão", value: visao?.nome ?? "Orçamento inteiro" },
        ]}
        fonte={`Lançamentos do relatório CUBO importado neste orçamento (${titulo}), agrupados por ${rotuloDim(linha).toLowerCase()}${coluna ? ` e ${rotuloDim(coluna).toLowerCase()}` : ""}. A soma da tabela abaixo é o número clicado.`}
      >
        <DataTable
          columns={colunasRecorte}
          rows={recorte}
          getKey={(r) => r.id}
          pageSize={20}
          density="compact"
          minWidth={1100}
          resumo={(ls) => `${num(ls.length)} ${ls.length === 1 ? "lançamento" : "lançamentos"} · ${brl(ls.reduce((s, r) => s + m.valor(r), 0))}`}
        />
      </OrigemDados>

      {aviso && (
        <AvisoFlutuante kind={aviso.kind} titulo={aviso.kind === "ok" ? "Pronto" : "Atenção"} onClose={() => setAviso(null)} duracao={aviso.kind === "ok" ? 3000 : undefined}>
          {aviso.texto}
        </AvisoFlutuante>
      )}
    </>
  );
}
