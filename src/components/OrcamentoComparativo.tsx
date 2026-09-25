"use client";

import { useMemo, useState } from "react";
import { exportarCruzamentoXlsx } from "@/lib/exportar-orcamento";
import { brl, num } from "@/lib/format";
import type { OrcamentoItemRow } from "@/lib/orcamento";
import {
  colunaPermitida,
  cruzar,
  lancamentosDoRecorte,
  MEDIDAS_ORCAMENTO,
  type MedidaOrcamento,
  type ModoCruzamento,
  matrizCruzamento,
  medidaOrcamento,
  type OrdemCruzamento,
  ordenarLinhas,
  percentual,
  permissoesColunas,
  permissoesLinhas,
  semVazios,
} from "@/lib/orcamento-cruzamento";
import { type AlvoVinculo, mapaVinculos, type VinculoOrcamento } from "@/lib/orcamento-vinculo";
import { aplicarVisao, DIMENSOES_ORCAMENTO, type DimensaoOrcamento, type VisaoOrcamento, valorDimensao } from "@/lib/orcamento-visao";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { FerramentasAba } from "./AbasEspaco";
import { Button } from "./Button";
import { type Column, DataTable } from "./DataTable";
import { Checkbox, SearchField, SelectField } from "./Field";
import { IconDesafixar, IconDownload, IconTrocar } from "./icons";
import { OrigemDados } from "./OrigemDados";
import { Segmented } from "./Segmented";
import { TabelaCruzada } from "./TabelaCruzada";

const rotuloDim = (d: DimensaoOrcamento) => DIMENSOES_ORCAMENTO.find((x) => x.key === d)?.rotulo ?? d;
const TIPO_VINCULO: Partial<Record<DimensaoOrcamento, "orgao" | "unidade">> = { orgao: "orgao", unidade: "unidade" };

const MODOS: { value: ModoCruzamento; label: string; curto: string }[] = [
  { value: "valor", label: "R$", curto: "R$" },
  { value: "linha", label: "% da linha", curto: "% lin." },
  { value: "coluna", label: "% da coluna", curto: "% col." },
  { value: "total", label: "% do total", curto: "% tot." },
];

/**
 * Aba COMPARATIVO da tela do orçamento — a TABELA CRUZADA (horizontal, como a planilha da Prefeitura): o usuário LIGA
 * duas colunas do CUBO (uma nas LINHAS, outra nas COLUNAS — ex.: Unidade × Elemento de despesa) e compara os valores da
 * MEDIDA escolhida. Ao escolher as linhas, o seletor das colunas APONTA as permitidas (as demais aparecem desabilitadas
 * com o motivo — a mesma, sem dados, valores demais, 1 para 1; `permissoesColunas`). Congelar colunas, ordenar,
 * percentuais, mapa de calor, ocultar zerados, restringir por uma VISÃO salva, a sigla do cadastro (Vínculos) ao lado de
 * Órgão/Unidade, exportar .xlsx e a ORIGEM de cada número (os lançamentos da célula/linha/coluna — a soma bate).
 */
export function OrcamentoComparativo({
  titulo,
  itens,
  visoes,
  vinculos,
  alvos,
}: {
  titulo: string;
  itens: OrcamentoItemRow[];
  visoes: VisaoOrcamento[];
  vinculos: VinculoOrcamento[];
  alvos: { orgaos: AlvoVinculo[]; unidades: AlvoVinculo[] };
}) {
  const [dimLinha, setDimLinha] = useState<DimensaoOrcamento>("unidade");
  const [dimColuna, setDimColuna] = useState<DimensaoOrcamento>("nomeElemento");
  const [medida, setMedida] = useState<MedidaOrcamento>("inicial");
  const [visaoId, setVisaoId] = useState<number | null>(null);
  const [modo, setModo] = useState<ModoCruzamento>("valor");
  const [calor, setCalor] = useState(false);
  const [ocultarZerados, setOcultarZerados] = useState(true);
  const [busca, setBusca] = useState("");
  const [fixadas, setFixadas] = useState<string[]>([]);
  const [ordem, setOrdem] = useState<OrdemCruzamento>({ por: "rotulo", desc: false });
  const [aberto, setAberto] = useState<{ linha: string | null; coluna: string | null } | null>(null);

  const visao = visoes.find((v) => v.id === visaoId) ?? null;
  const base = useMemo(() => (visao ? aplicarVisao(itens, visao.filtros) : itens), [itens, visao]);

  // As duas colunas LIGADAS: a das linhas (com dados) e a das colunas (a permitida — senão a 1ª permitida).
  const permLinhas = useMemo(() => permissoesLinhas(base), [base]);
  const linha = permLinhas[dimLinha].permitida ? dimLinha : (DIMENSOES_ORCAMENTO.find((d) => permLinhas[d.key].permitida)?.key ?? dimLinha);
  const permColunas = useMemo(() => permissoesColunas(base, linha), [base, linha]);
  const coluna = colunaPermitida(permColunas, dimColuna);
  const podeTrocar = useMemo(() => coluna != null && permissoesColunas(base, coluna)[linha].permitida, [base, coluna, linha]);

  const cruz = useMemo(() => {
    if (!coluna) return null;
    const c = cruzar(base, linha, coluna, medida);
    return ocultarZerados ? semVazios(c) : c;
  }, [base, linha, coluna, medida, ocultarZerados]);

  // A sigla do CADASTRO (Vínculos) ao lado de Órgão/Unidade — a chave do vínculo é a MESMA do agrupamento.
  const tipo = TIPO_VINCULO[linha];
  const siglaDe = useMemo(() => {
    if (!tipo) return null;
    const mapa = mapaVinculos(vinculos);
    const porId = new Map((tipo === "orgao" ? alvos.orgaos : alvos.unidades).map((a) => [a.id, a.sigla]));
    return (chave: string) => porId.get(mapa.get(`${tipo}|${chave}`) ?? -1) ?? "";
  }, [tipo, vinculos, alvos]);

  const linhas = useMemo(() => {
    if (!cruz) return [];
    const casa = predicadoBusca(busca);
    const ordenadas = ordenarLinhas(cruz, ordem).map((l) => ({ ...l, extra: siglaDe?.(l.chave) }));
    return casa ? ordenadas.filter((l) => casa([l.rotulo, l.extra ?? ""])) : ordenadas;
  }, [cruz, ordem, busca, siglaDe]);

  // Trocar uma das colunas ligadas zera o que dependia dela (colunas congeladas, ordem por coluna, detalhe aberto).
  const reiniciar = () => {
    setFixadas([]);
    setOrdem({ por: "rotulo", desc: false });
    setAberto(null);
  };
  const escolherLinha = (d: DimensaoOrcamento) => {
    setDimLinha(d);
    reiniciar();
  };
  const escolherColuna = (d: DimensaoOrcamento) => {
    setDimColuna(d);
    reiniciar();
  };
  const trocarEixos = () => {
    if (!coluna) return;
    setDimLinha(coluna);
    setDimColuna(linha);
    reiniciar();
  };
  const ordenar = (por: OrdemCruzamento["por"]) =>
    setOrdem((o) => {
      const mesma = typeof por === "object" ? typeof o.por === "object" && o.por.coluna === por.coluna : o.por === por;
      // 1º clique: rótulo em ordem crescente, valores do MAIOR para o menor; o 2º inverte.
      return mesma ? { por, desc: !o.desc } : { por, desc: por !== "rotulo" };
    });
  const fixar = (chave: string) => setFixadas((f) => (f.includes(chave) ? f.filter((k) => k !== chave) : [...f, chave]));

  const m = medidaOrcamento(medida);
  const exportar = () => {
    if (!cruz || !coluna) return;
    const extra = siglaDe ? { rotulo: "Sigla", de: siglaDe } : undefined;
    exportarCruzamentoXlsx(`${titulo} - ${rotuloDim(linha)} x ${rotuloDim(coluna)}`, matrizCruzamento(cruz, linhas, rotuloDim(linha), extra), extra != null);
  };

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
        aberto.coluna != null ? cruz?.colunas.find((c) => c.chave === aberto.coluna)?.rotulo : null,
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
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="w-full sm:w-56">
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
          <div className="w-full sm:w-64">
            <SelectField compacto label="Colunas" value={coluna ?? ""} onChange={(e) => escolherColuna(e.target.value as DimensaoOrcamento)}>
              {coluna == null && <option value="">Nenhuma permitida</option>}
              {DIMENSOES_ORCAMENTO.map((d) => opcaoDim(d, permColunas[d.key]))}
            </SelectField>
          </div>
          <div className="w-full sm:w-56">
            <SelectField compacto label="Medida" value={medida} onChange={(e) => setMedida(e.target.value as MedidaOrcamento)}>
              {MEDIDAS_ORCAMENTO.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.rotulo}
                </option>
              ))}
            </SelectField>
          </div>
          {visoes.length > 0 && (
            <div className="w-full sm:w-56">
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
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 lg:ml-auto">
          <Segmented<ModoCruzamento> ariaLabel="Ler as células como" value={modo} onChange={setModo} options={MODOS} />
          <div className="flex min-h-11 items-center gap-4 lg:min-h-0">
            <Checkbox checked={calor} onChange={(e) => setCalor(e.target.checked)} label="Mapa de calor" />
            <Checkbox checked={ocultarZerados} onChange={(e) => setOcultarZerados(e.target.checked)} label="Ocultar zerados" />
          </div>
          {fixadas.length > 0 && (
            <Button size="sm" variant="ghost" icon={<IconDesafixar className="h-4 w-4" />} onClick={() => setFixadas([])}>
              Descongelar ({fixadas.length})
            </Button>
          )}
        </div>
      </div>

      <TabelaCruzada
        rotuloLinhas={rotuloDim(linha)}
        rotuloExtra={siglaDe ? "Sigla" : undefined}
        linhas={linhas}
        colunas={cruz?.colunas ?? []}
        total={cruz?.total ?? 0}
        formatar={brl}
        modo={modo}
        calor={calor}
        fixadas={fixadas}
        onFixar={fixar}
        ordem={ordem}
        onOrdenar={ordenar}
        onAbrir={(l, c) => setAberto({ linha: l, coluna: c })}
        ativa={aberto}
        vazio={
          !coluna
            ? "Nenhuma coluna permitida para cruzar com estas linhas."
            : busca
              ? "Nenhuma linha para esta busca."
              : "Nenhum lançamento para comparar."
        }
        resumo={
          cruz && coluna
            ? `${num(linhas.length)} ${linhas.length === 1 ? "linha" : "linhas"} × ${num(cruz.colunas.length)} ${cruz.colunas.length === 1 ? "coluna" : "colunas"} · ${m.rotulo} ${brl(cruz.total)}`
            : undefined
        }
      />

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
    </>
  );
}
