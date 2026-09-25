"use client";

import { useMemo, useState } from "react";
import { exportarCruzamentoXlsx } from "@/lib/exportar-orcamento";
import { brl, num } from "@/lib/format";
import type { OrcamentoItemRow } from "@/lib/orcamento";
import {
  COL_EXTRA,
  COL_ROTULO,
  COL_TOTAL,
  type Cruzamento,
  colunasNaOrdem,
  chaveLayoutComparativo,
  coerceLayout,
  colunaPermitida,
  cruzar,
  LARGURA_MAX,
  LARGURA_MIN,
  LAYOUT_PADRAO,
  type LayoutCruzamento,
  lancamentosDoRecorte,
  layoutIgual,
  MEDIDAS_ORCAMENTO,
  type MedidaOrcamento,
  type ModoCruzamento,
  matrizCruzamento,
  medidaOrcamento,
  type OrdemCruzamento,
  ordemDasColunas,
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
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Button } from "./Button";
import { type Column, DataTable } from "./DataTable";
import { Checkbox, SearchField, SelectField } from "./Field";
import { IconDesafixar, IconDownload, IconEye, IconFixar, IconPencil, IconSave, IconTrocar, IconUndo } from "./icons";
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
/**
 * Aba COMPARATIVO da tela do orçamento — a TABELA CRUZADA (horizontal, como a planilha da Prefeitura): o usuário LIGA
 * duas colunas do CUBO (uma nas LINHAS, outra nas COLUNAS — ex.: Unidade × Elemento de despesa) e compara os valores da
 * MEDIDA escolhida. Ao escolher as linhas, o seletor das colunas APONTA as permitidas (as demais aparecem desabilitadas
 * com o motivo — `permissoesColunas`). Tocar num cabeçalho ordena as linhas só na VISTA. **"Editar"** transforma a PRÓPRIA
 * planilha no editor do layout, DIRETO na coluna — TODAS, inclusive o nome das linhas, a Sigla e o Total: arrastar o nome
 * move (com a sombra do destino; soltar entre as congeladas congela), o alfinete congela, o olho oculta, a borda ajusta a
 * largura; a barra de edição (enxuta) traz mapa de calor, ocultar zerados e congelar/descongelar/mostrar todas. A
 * explicação de tudo fica na AJUDA (?); **"Salvar"** grava o layout do PAR de colunas ligadas na conta do usuário
 * (`PUT /api/preferencias/tabela`; o layout igual ao padrão apaga o salvo) e "Cancelar" descarta.
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
  /** Os layouts SALVOS do usuário, por chave (`chaveLayoutComparativo`). */
  layoutsSalvos: Record<string, unknown>;
}) {
  const [dimLinha, setDimLinha] = useState<DimensaoOrcamento>("unidade");
  const [dimColuna, setDimColuna] = useState<DimensaoOrcamento>("nomeElemento");
  const [medida, setMedida] = useState<MedidaOrcamento>("inicial");
  const [visaoId, setVisaoId] = useState<number | null>(null);
  const [modo, setModo] = useState<ModoCruzamento>("valor");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<{ linha: string | null; coluna: string | null } | null>(null);
  const [salvos, setSalvos] = useState(layoutsSalvos);
  const [rascunho, setRascunho] = useState<LayoutCruzamento | null>(null); // ≠ null = EDITANDO a planilha
  const [ordemVista, setOrdemVista] = useState<OrdemCruzamento | null>(null); // ordenação só da vista (fora da edição)
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

  // O LAYOUT do par ligado: o rascunho enquanto edita; senão o SALVO (ou o padrão).
  const chave = coluna ? chaveLayoutComparativo(linha, coluna) : "";
  const salvo = useMemo(() => coerceLayout(salvos[chave]), [salvos, chave]);
  const editando = rascunho != null;
  const layout = rascunho ?? salvo;
  const ordem = editando ? layout.ordemLinhas : (ordemVista ?? layout.ordemLinhas);
  const mudar = (f: (l: LayoutCruzamento) => LayoutCruzamento) => setRascunho((r) => (r ? f(r) : r));

  // O cruzamento (sem zerados, se pedido) — a tabela ordena/oculta as colunas pelo layout.
  const cruzBase = useMemo(() => {
    if (!coluna) return null;
    const c = cruzar(base, linha, coluna, medida);
    return layout.zerados ? semVazios(c) : c;
  }, [base, linha, coluna, medida, layout.zerados]);

  // A sigla do CADASTRO (Vínculos) ao lado de Órgão/Unidade — a chave do vínculo é a MESMA do agrupamento.
  const tipo = TIPO_VINCULO[linha];
  const siglaDe = useMemo(() => {
    if (!tipo) return null;
    const mapa = mapaVinculos(vinculos);
    const porId = new Map((tipo === "orgao" ? alvos.orgaos : alvos.unidades).map((a) => [a.id, a.sigla]));
    return (k: string) => porId.get(mapa.get(`${tipo}|${k}`) ?? -1) ?? "";
  }, [tipo, vinculos, alvos]);

  const casa = useMemo(() => predicadoBusca(busca), [busca]);
  const linhasDe = (c: Cruzamento) => {
    const ordenadas = ordenarLinhas(c, ordem, siglaDe ?? undefined).map((l) => ({ ...l, extra: siglaDe?.(l.chave) }));
    return casa ? ordenadas.filter((l) => casa([l.rotulo, l.extra ?? ""])) : ordenadas;
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: linhasDe lê ordem/siglaDe/casa (as dependências listadas).
  const linhas = useMemo(() => (cruzBase ? linhasDe(cruzBase) : []), [cruzBase, ordem, siglaDe, casa]);

  // Trocar uma das colunas ligadas fecha o detalhe e volta à ordem salva (o layout segue o PAR).
  const reiniciarVista = () => {
    setAberto(null);
    setOrdemVista(null);
  };
  const escolherLinha = (d: DimensaoOrcamento) => {
    setDimLinha(d);
    reiniciarVista();
  };
  const escolherColuna = (d: DimensaoOrcamento) => {
    setDimColuna(d);
    reiniciarVista();
  };
  const trocarEixos = () => {
    if (!coluna) return;
    setDimLinha(coluna);
    setDimColuna(linha);
    reiniciarVista();
  };
  // Ordenar: na edição vai ao rascunho (salvo com o layout); fora dela, só a vista. 1º toque: textos crescente, valores
  // do MAIOR para o menor; o 2º inverte.
  const ordenar = (por: OrdemCruzamento["por"]) => {
    const o = ordem;
    const mesma = typeof por === "object" ? typeof o.por === "object" && o.por.coluna === por.coluna : o.por === por;
    const nova = { por, desc: mesma ? !o.desc : por !== "rotulo" && por !== "extra" };
    if (editando) mudar((l) => ({ ...l, ordemLinhas: nova }));
    else setOrdemVista(nova);
  };

  // TODAS as colunas da tabela (as estruturais + as de valores) na ordem PADRÃO e na ordem do LAYOUT; as VISÍVEIS de
  // valores formam o que se exporta e o resumo.
  const padrao = useMemo(
    () => [COL_ROTULO, ...(siglaDe ? [COL_EXTRA] : []), COL_TOTAL, ...(cruzBase?.colunas ?? []).map((c) => c.chave)],
    [siglaDe, cruzBase],
  );
  const cruz = useMemo(() => {
    if (!cruzBase) return null;
    const o = ordemDasColunas(padrao, layout.fixadas, layout.ordemManual);
    return colunasNaOrdem(cruzBase, [...o.fixadas, ...o.livres].filter((k) => !layout.ocultas.includes(k)));
  }, [cruzBase, padrao, layout.fixadas, layout.ordemManual, layout.ocultas]);

  // EDIÇÃO da planilha (direto na coluna): largura, ocultar e a ORDEM (arrastar/congelar). As colunas fora da vista
  // (ex.: zeradas ocultas) mantêm o que tinham.
  const edicao = {
    onLargura: (k: string, px: number | null) =>
      mudar((l) => {
        const larguras = { ...l.larguras };
        if (px == null) delete larguras[k];
        else larguras[k] = Math.round(Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, px)));
        return { ...l, larguras };
      }),
    onOcultar: (k: string) => mudar((l) => ({ ...l, ocultas: l.ocultas.includes(k) ? l.ocultas.filter((x) => x !== k) : [...l.ocultas, k] })),
    onOrdem: (fixadas: string[], livres: string[]) =>
      mudar((l) => {
        const presentes = new Set(padrao);
        return {
          ...l,
          fixadas: [...fixadas, ...l.fixadas.filter((x) => !presentes.has(x))],
          ordemManual: [...livres, ...l.ordemManual.filter((x) => !presentes.has(x))],
        };
      }),
  };

  function editar() {
    setRascunho(layout);
    setOrdemVista(null);
    setAberto(null);
  }
  function cancelar() {
    if (rascunho && !layoutIgual(rascunho, salvo) && !confirm("Descartar as edições da planilha?")) return;
    setRascunho(null);
  }
  async function salvar() {
    if (!rascunho || !chave) return;
    if (layoutIgual(rascunho, salvo)) return setRascunho(null);
    const padrao = layoutIgual(rascunho, LAYOUT_PADRAO); // o padrão não precisa ficar gravado
    setGravando(true);
    const r = await fetch("/api/preferencias/tabela", {
      method: padrao ? "DELETE" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(padrao ? { chave } : { chave, valor: rascunho }),
    }).catch(() => null);
    setGravando(false);
    if (!r?.ok) return setAviso({ kind: "danger", texto: "Não foi possível salvar a planilha." });
    setSalvos((s) => {
      const { [chave]: _, ...resto } = s;
      return padrao ? resto : { ...resto, [chave]: rascunho };
    });
    setRascunho(null);
    setAviso({ kind: "ok", texto: `Planilha salva para ${rotuloDim(linha)} × ${coluna ? rotuloDim(coluna) : ""}.` });
  }

  const m = medidaOrcamento(medida);
  const comSigla = siglaDe != null && !layout.ocultas.includes(COL_EXTRA);
  const exportar = () => {
    if (!cruz || !coluna) return;
    const extra = comSigla && siglaDe ? { rotulo: "Sigla", de: siglaDe } : undefined;
    exportarCruzamentoXlsx(`${titulo} - ${rotuloDim(linha)} x ${rotuloDim(coluna)}`, matrizCruzamento(cruz, linhasDe(cruz), rotuloDim(linha), extra), extra != null);
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
        aberto.linha != null ? cruzBase?.linhas.find((l) => l.chave === aberto.linha)?.rotulo : null,
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
  const nVisiveis = cruz?.colunas.length ?? 0;

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
        <Button size="sm" variant="secondary" icon={<IconDownload className="h-4 w-4" />} onClick={exportar} disabled={!cruz || nVisiveis === 0}>
          XLSX
        </Button>
      </FerramentasAba>

      <div className="mb-[var(--gap-block)] flex flex-wrap items-center gap-2">
        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:flex sm:w-auto">
          <div className="min-w-0 sm:w-52">
            <SelectField compacto label="Linhas" value={linha} disabled={editando} onChange={(e) => escolherLinha(e.target.value as DimensaoOrcamento)}>
              {DIMENSOES_ORCAMENTO.map((d) => opcaoDim(d, permLinhas[d.key]))}
            </SelectField>
          </div>
          <Button
            size="sm"
            variant="icon"
            icon={<IconTrocar className="h-4 w-4" />}
            onClick={trocarEixos}
            disabled={!podeTrocar || editando}
            aria-label="Inverter linhas e colunas"
            title={podeTrocar ? "Inverter linhas e colunas" : "Não dá para inverter: a dimensão das linhas não é permitida nas colunas"}
          />
          <div className="min-w-0 sm:w-60">
            <SelectField compacto label="Colunas" value={coluna ?? ""} disabled={editando} onChange={(e) => escolherColuna(e.target.value as DimensaoOrcamento)}>
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
          {!editando && (
            <Button size="sm" variant="secondary" icon={<IconPencil className="h-4 w-4" />} onClick={editar} disabled={!cruzBase}>
              Editar
            </Button>
          )}
          <Ajuda titulo="Comparativo">
            <TopicoAjuda icone={<IconTrocar className="h-4 w-4" />} titulo="Linhas × Colunas">
              Escolha duas colunas do CUBO para cruzar. As que não combinam aparecem desabilitadas com o motivo; o botão entre elas inverte.
            </TopicoAjuda>
            <TopicoAjuda icone={<IconDownload className="h-4 w-4" />} titulo="Medida, visão e leitura">
              A medida define o valor somado; a visão restringe os lançamentos; R$ ou % da linha, da coluna ou do total. Tocar numa célula mostra os lançamentos
              que formam o número; tocar no nome de uma coluna ordena as linhas.
            </TopicoAjuda>
            <TopicoAjuda icone={<IconPencil className="h-4 w-4" />} titulo="Editar a planilha">
              Todas as colunas — inclusive o nome das linhas, a Sigla e o Total — se editam direto no cabeçalho: arraste o nome para mover (a sombra mostra onde vai
              ficar; soltar entre as congeladas congela), o alfinete congela, o olho oculta e a borda ajusta a largura (duplo clique volta ao padrão).
            </TopicoAjuda>
            <TopicoAjuda icone={<IconSave className="h-4 w-4" />} titulo="Salvar">
              Os ajustes valem para o par de colunas escolhido e ficam na sua conta. "Padrão" volta ao original; "Cancelar" descarta.
            </TopicoAjuda>
          </Ajuda>
        </div>
      </div>

      {editando && (
        <div className="mb-[var(--gap-block)] flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-accent/40 bg-surface px-[var(--pad-card)] py-1.5">
          <span className="text-[13px] font-semibold text-text">Editando</span>
          <div className="flex min-h-11 flex-wrap items-center gap-x-4 lg:min-h-0">
            <Checkbox checked={layout.calor} onChange={(e) => mudar((l) => ({ ...l, calor: e.target.checked }))} label="Mapa de calor" />
            <Checkbox checked={layout.zerados} onChange={(e) => mudar((l) => ({ ...l, zerados: e.target.checked }))} label="Ocultar zerados" />
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="icon"
              title="Congelar todas"
              aria-label="Congelar todas as colunas"
              icon={<IconFixar className="h-4 w-4" />}
              onClick={() => mudar((l) => ({ ...l, fixadas: padrao.filter((k) => !l.ocultas.includes(k)) }))}
            />
            <Button
              size="sm"
              variant="icon"
              title="Descongelar todas (o nome das linhas segue congelado)"
              aria-label="Descongelar todas as colunas"
              icon={<IconDesafixar className="h-4 w-4" />}
              onClick={() => mudar((l) => ({ ...l, fixadas: [COL_ROTULO] }))}
            />
            <Button
              size="sm"
              variant="icon"
              title="Mostrar todas"
              aria-label="Mostrar todas as colunas"
              icon={<IconEye className="h-4 w-4" />}
              onClick={() => mudar((l) => ({ ...l, ocultas: [] }))}
              disabled={layout.ocultas.length === 0}
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="ghost" icon={<IconUndo className="h-4 w-4" />} onClick={() => setRascunho(LAYOUT_PADRAO)} disabled={gravando}>
              Padrão
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelar} disabled={gravando}>
              Cancelar
            </Button>
            <Button size="sm" icon={<IconSave className="h-4 w-4" />} onClick={salvar} loading={gravando}>
              Salvar
            </Button>
          </div>
        </div>
      )}

      <TabelaCruzada
        rotuloLinhas={rotuloDim(linha)}
        rotuloExtra={siglaDe ? "Sigla" : undefined}
        linhas={linhas}
        colunas={cruzBase?.colunas ?? []}
        total={cruzBase?.total ?? 0}
        formatar={brl}
        modo={modo}
        calor={layout.calor}
        fixadas={layout.fixadas}
        ordemManual={layout.ordemManual}
        larguras={layout.larguras}
        ocultas={layout.ocultas}
        ordem={ordem}
        onOrdenar={ordenar}
        onAbrir={editando ? undefined : (l, c) => setAberto({ linha: l, coluna: c })}
        ativa={aberto}
        edicao={editando ? edicao : undefined}
        vazio={
          !coluna
            ? "Nenhuma coluna permitida para cruzar com estas linhas."
            : cruzBase && cruzBase.colunas.length > 0 && nVisiveis === 0
              ? "Todas as colunas estão ocultas — use “Editar” para mostrar alguma."
              : busca
                ? "Nenhuma linha para esta busca."
                : "Nenhum lançamento para comparar."
        }
        resumo={
          cruz && coluna
            ? `${num(linhas.length)} ${linhas.length === 1 ? "linha" : "linhas"} × ${num(nVisiveis)} ${nVisiveis === 1 ? "coluna" : "colunas"} · ${m.rotulo} ${brl(cruz.total)}`
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

      {aviso && (
        <AvisoFlutuante kind={aviso.kind} titulo={aviso.kind === "ok" ? "Pronto" : "Atenção"} onClose={() => setAviso(null)} duracao={aviso.kind === "ok" ? 3000 : undefined}>
          {aviso.texto}
        </AvisoFlutuante>
      )}
    </>
  );
}
