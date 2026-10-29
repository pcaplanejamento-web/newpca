"use client";

import { useMemo, useState } from "react";
import type { BlocoDoc } from "@/lib/documento-pdf-core";
import { brl, brlCompact, dataBR, dec, num } from "@/lib/format";
import type { LimitesAlertas } from "@/lib/frota-config-core";
import {
  alertasFrota,
  type Consumo,
  type ContextoFrota,
  fichaDoVeiculo,
  ROTULO_ORIGEM,
  ROTULO_SITUACAO,
  ROTULO_TIPO_VEICULO,
  rotuloMes,
  SEM_ORGAO,
  SEM_UNIDADE,
  TIPOS_ALERTA,
  type Transacao,
} from "@/lib/frota-core";
import { Badge } from "../Badge";
import { BotaoAcao } from "../BotaoAcao";
import { Campo } from "../LiquidacaoDetalhe";
import { BarrasH, Colunas } from "../charts/Barras";
import { useQuemExporta } from "../ConfigTabelas";
import { DataTable } from "../DataTable";
import { usePodeExportar } from "../ExportarTabelas";
import { IconDownload, IconPencil } from "../icons";
import { Modal } from "../Modal";
import { SecaoBanner } from "../SecaoBanner";
import { StatMini } from "../StatMini";
import { CelulaTexto } from "../CelulaLista";

/**
 * A FICHA DO VEÍCULO (banner): o cadastro, os indicadores do ano (gasto, por mês, consumo, custo por km, posição na frota
 * e a comparação com a média), o gasto por mês, os postos/oficinas, os alertas e todos os registros — e o PDF da ficha.
 */
export function FichaVeiculoBanner({
  placa,
  onClose,
  trs,
  ctx,
  consumo,
  ano,
  limites,
  onAbrir,
  acaoExtra,
}: {
  placa: string | null;
  onClose: () => void;
  trs: readonly Transacao[];
  ctx: ContextoFrota;
  consumo: ReadonlyMap<number, Consumo>;
  ano: number | null;
  limites: LimitesAlertas;
  onAbrir?: (id: number) => void;
  /** Editar o cadastro (a tela Veículos, com Manipular). */
  acaoExtra?: () => void;
}) {
  const quem = useQuemExporta();
  const podeExportar = usePodeExportar();
  const [gerando, setGerando] = useState(false);
  const f = useMemo(() => (placa ? fichaDoVeiculo(placa, trs, consumo) : null), [placa, trs, consumo]);
  const doVeiculo = useMemo(() => (placa ? trs.filter((t) => t.placa === placa && !t.removido) : []), [placa, trs]);
  const alertas = useMemo(() => (placa ? alertasFrota(doVeiculo, ctx, consumo, limites) : []), [placa, doVeiculo, ctx, consumo, limites]);
  const v = placa ? ctx.veiculos.get(placa) : undefined;
  const classif = v?.classificacaoId != null ? ctx.classificacoes.get(v.classificacaoId)?.nome : undefined;
  const descricao = [v?.marca, v?.modelo, v?.ano].filter(Boolean).join(" ");

  async function baixarPdf() {
    if (!f || !placa) return;
    setGerando(true);
    try {
      const { baixarDocumentoPdf } = await import("@/lib/documento-pdf");
      const blocos: BlocoDoc[] = [
        { tipo: "titulo", texto: `Ficha do veículo ${placa}` },
        { tipo: "paragrafo", texto: [descricao, classif, v ? ROTULO_TIPO_VEICULO[v.tipo] : null, ano ? `Ano de referência: ${ano}` : null].filter(Boolean).join(" · "), cor: "muted" },
        {
          tipo: "destaques",
          itens: [
            { rotulo: "Gasto total", valor: brl(f.total) },
            { rotulo: "Combustível", valor: brl(f.combustivel) },
            { rotulo: "Manutenção", valor: brl(f.manutencao) },
            { rotulo: "Por mês", valor: brl(f.porMes) },
            { rotulo: "Consumo", valor: f.kmPorLitro ? `${dec(f.kmPorLitro)} km/l` : "—" },
            { rotulo: "Custo por km", valor: f.custoPorKm ? brl(f.custoPorKm) : "—" },
          ],
        },
        { tipo: "secao", texto: "Cadastro" },
        {
          tipo: "tabela",
          colunas: [
            { titulo: "Informação", peso: 1 },
            { titulo: "Valor", peso: 2 },
          ],
          linhas: [
            ["Órgão", f.orgaoAtual ?? SEM_ORGAO],
            ["Unidade", f.unidadeSistemaAtual ?? SEM_UNIDADE],
            ["Situação", v ? ROTULO_SITUACAO[v.situacao] : "—"],
            ["Origem", v?.origem ? ROTULO_ORIGEM[v.origem] : "—"],
            ["FIPE", v?.fipe != null ? brl(v.fipe) : "—"],
            ["Locação (mensal)", v?.locacao != null ? brl(v.locacao) : "—"],
            ["Contrato", v?.contrato ?? "—"],
            ["Capacidade do tanque", v?.capacidadeTanque != null ? `${dec(v.capacidadeTanque)} l` : "—"],
            ["Último hodômetro", f.ultimoHodometro != null ? `${num(f.ultimoHodometro)} km` : "—"],
            ["Posição na frota", `${f.posicao}º de ${f.frota}`],
          ].map((c) => ({ celulas: c })),
        },
        { tipo: "secao", texto: "Gasto por mês" },
        {
          tipo: "tabela",
          colunas: [
            { titulo: "Mês", peso: 1 },
            { titulo: "Combustível", peso: 1, alinhar: "right" },
            { titulo: "Manutenção", peso: 1, alinhar: "right" },
            { titulo: "Total", peso: 1, alinhar: "right" },
          ],
          linhas: [
            ...f.meses.map((m) => ({ celulas: [rotuloMes(m.mes), brl(m.combustivel), brl(m.manutencao), brl(m.total)] })),
            { celulas: ["TOTAL", brl(f.combustivel), brl(f.manutencao), brl(f.total)], destaque: true },
          ],
        },
        { tipo: "secao", texto: "Registros" },
        {
          tipo: "tabela",
          colunas: [
            { titulo: "Data", peso: 1 },
            { titulo: "Tipo", peso: 1 },
            { titulo: "Descrição", peso: 3 },
            { titulo: "Hodômetro", peso: 1, alinhar: "right" },
            { titulo: "Valor", peso: 1, alinhar: "right" },
          ],
          linhas: doVeiculo.map((t) => ({
            celulas: [
              dataBR(t.dia),
              t.tipo === "abastecimento" ? "Abastecimento" : "Manutenção",
              t.tipo === "abastecimento" ? `${t.produto ?? ""} ${t.litros != null ? `${dec(t.litros)} l` : ""} — ${t.estabelecimento ?? ""}` : `${t.tipoManutencao ?? ""} — ${t.estabelecimento ?? ""}`,
              t.hodometro != null ? num(t.hodometro) : "—",
              brl(t.valor),
            ],
          })),
        },
      ];
      if (alertas.length) {
        blocos.push({ tipo: "secao", texto: "Alertas" }, { tipo: "lista", itens: alertas.map((a) => `${dataBR(a.dia)} — ${TIPOS_ALERTA[a.tipo].rotulo}: ${a.texto}`) });
      }
      await baixarDocumentoPdf(`ficha-veiculo-${placa}.pdf`, { titulo: `Ficha do veículo ${placa}`, blocos }, { usuario: quem });
    } finally {
      setGerando(false);
    }
  }

  return (
    <Modal
      open={placa != null}
      onClose={onClose}
      titulo={`Ficha do veículo ${placa ?? ""}`}
      size="xl"
      acoesCabecalho={
        f ? (
          <span className="flex items-center gap-1.5">
            {acaoExtra && <BotaoAcao rotulo="Editar o cadastro" icon={<IconPencil className="h-4 w-4" />} onClick={acaoExtra} />}
            {podeExportar && <BotaoAcao rotulo="Baixar a ficha em PDF" icon={<IconDownload className="h-4 w-4" />} onClick={() => void baixarPdf()} loading={gerando} />}
          </span>
        ) : undefined
      }
    >
      {f && (
        <div className="space-y-[var(--gap-block)]">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="font-semibold text-text">{descricao || "Sem marca/modelo"}</span>
            {classif && <Badge tone="blue">{classif}</Badge>}
            {v && (
              <Badge tone={v.situacao === "ativo" ? "emerald" : "slate"} dot>
                {ROTULO_SITUACAO[v.situacao]}
              </Badge>
            )}
            {v?.origem && <Badge tone="slate">{ROTULO_ORIGEM[v.origem]}</Badge>}
            {!v && <Badge tone="amber">Placa sem cadastro</Badge>}
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3.5 min-[480px]:grid-cols-2 lg:grid-cols-3">
            <Campo label="Órgão" valor={f.orgaoAtual ?? SEM_ORGAO} />
            <Campo label="Unidade" valor={f.unidadeSistemaAtual ?? SEM_UNIDADE} />
            <Campo label="Setor (Vólus)" valor={f.unidadeAtual} />
            <Campo label="Empresa (contrato)" valor={f.contratoAtual ? (ctx.contratos.get(f.contratoAtual) ?? f.contratoAtual) : null} />
            <Campo label="Primeiro registro" valor={f.primeiroDia ? dataBR(f.primeiroDia) : null} />
            <Campo label="Último registro" valor={f.ultimoDia ? dataBR(f.ultimoDia) : null} />
          </dl>
          <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-3 lg:grid-cols-6">
            <StatMini label="Gasto total" value={brl(f.total)} tone="accent" />
            <StatMini label="Combustível" value={brl(f.combustivel)} hint={`${num(f.abastecimentos)} abastecimentos`} />
            <StatMini label="Manutenção" value={brl(f.manutencao)} hint={`${num(f.manutencoes)} manutenções`} />
            <StatMini label="Por mês" value={brl(f.porMes)} />
            <StatMini label="Consumo" value={f.kmPorLitro ? `${dec(f.kmPorLitro)} km/l` : "—"} />
            <StatMini label="Custo por km" value={f.custoPorKm ? brl(f.custoPorKm) : "—"} />
            <StatMini label="Posição na frota" value={`${f.posicao}º de ${f.frota}`} hint="pelo gasto total" />
            <StatMini
              label="Vs. média"
              value={f.vsMedia == null ? "—" : `${f.vsMedia > 0 ? "+" : "−"}${Math.round(Math.abs(f.vsMedia) * 100)}%`}
              tone={f.vsMedia == null ? "default" : f.vsMedia > 0.5 ? "danger" : f.vsMedia > 0 ? "warn" : "ok"}
              hint={`média ${brl(f.mediaFrota)}`}
            />
            <StatMini label="Litros" value={dec(f.litros)} hint={f.precoMedio ? `${brl(f.precoMedio)}/l` : undefined} />
            <StatMini label="Último hodômetro" value={f.ultimoHodometro != null ? `${num(f.ultimoHodometro)} km` : "—"} />
            <StatMini label="Tanque" value={v?.capacidadeTanque != null ? `${dec(v.capacidadeTanque)} l` : "—"} />
            <StatMini label={v?.origem === "contrato" ? "Locação" : "FIPE"} value={v?.origem === "contrato" ? (v.locacao != null ? brl(v.locacao) : "—") : v?.fipe != null ? brl(v.fipe) : "—"} />
          </div>
          <div className="grid gap-[var(--gap-block)] lg:grid-cols-2">
            <SecaoBanner titulo="Gasto por mês">
              <Colunas
                ariaLabel={`Gasto por mês de ${placa}`}
                colunas={f.meses.map((m) => ({ chave: m.mes, rotulo: rotuloMes(m.mes), valor: m.total, dica: { valor: brl(m.total), rotulo: rotuloMes(m.mes) } }))}
                formatar={brlCompact}
              />
            </SecaoBanner>
            <SecaoBanner titulo="Postos e oficinas">
              <BarrasH
                ariaLabel={`Postos e oficinas de ${placa}`}
                linhas={f.postos.map((p) => ({
                  chave: p.nome,
                  rotulo: p.nome,
                  titulo: `${p.nome}: ${brl(p.valor)} em ${p.n} registros`,
                  segmentos: [{ chave: "v", valor: p.valor, cor: "var(--accent)", rotulo: "Valor" }],
                  valor: brlCompact(p.valor),
                  detalhe: num(p.n),
                }))}
              />
            </SecaoBanner>
          </div>
          {alertas.length > 0 && (
            <SecaoBanner titulo={`Alertas (${alertas.length})`}>
              <DataTable
                density="compact"
                rows={alertas}
                getKey={(a) => `${a.id}:${a.tipo}`}
                onRowClick={onAbrir ? (a) => onAbrir(a.id) : undefined}
                exportar={{ nome: `Alertas ${placa}` }}
                columns={[
                  {
                    key: "tipo",
                    header: "Alerta",
                    value: (a) => TIPOS_ALERTA[a.tipo].rotulo,
                    render: (a) => (
                      <Badge tone={TIPOS_ALERTA[a.tipo].gravidade === "erro" ? "red" : "amber"} dot>
                        {TIPOS_ALERTA[a.tipo].rotulo}
                      </Badge>
                    ),
                    nowrap: true,
                  },
                  { key: "dia", header: "Data", filter: "date", value: (a) => a.dia, render: (a) => dataBR(a.dia), nowrap: true },
                  { key: "texto", header: "Por quê", value: (a) => a.texto, render: (a) => <CelulaTexto texto={a.texto} />, align: "left", minWidth: 220 },
                ]}
              />
            </SecaoBanner>
          )}
          <SecaoBanner titulo={`Registros (${doVeiculo.length})`}>
            <DataTable
              density="compact"
              rows={doVeiculo}
              getKey={(t) => t.id}
              onRowClick={onAbrir ? (t) => onAbrir(t.id) : undefined}
              exportar={{ nome: `Registros ${placa}` }}
              linhasSalvas="frota-ficha"
              columns={[
                { key: "dia", header: "Data", filter: "date", value: (t) => t.dia, render: (t) => dataBR(t.dia), nowrap: true },
                { key: "tipo", header: "Tipo", value: (t) => (t.tipo === "abastecimento" ? "Abastecimento" : "Manutenção"), render: (t) => (t.tipo === "abastecimento" ? "Abastecimento" : "Manutenção"), nowrap: true },
                { key: "desc", header: "Descrição", value: (t) => (t.tipo === "abastecimento" ? `${t.produto ?? ""}${t.litros != null ? ` · ${dec(t.litros)} l` : ""}` : (t.tipoManutencao ?? "")), render: (t) => <CelulaTexto texto={(t.tipo === "abastecimento" ? `${t.produto ?? ""}${t.litros != null ? ` · ${dec(t.litros)} l` : ""}` : (t.tipoManutencao ?? ""))} />, align: "left", minWidth: 140 },
                { key: "estab", header: "Fornecedor", value: (t) => t.estabelecimento ?? "—", render: (t) => <CelulaTexto texto={t.estabelecimento ?? "—"} />, align: "left", minWidth: 140 },
                { key: "hodo", header: "Hodômetro", filter: "range", numero: (t) => t.hodometro, value: (t) => (t.hodometro == null ? "—" : num(t.hodometro)), render: (t) => (t.hodometro == null ? "—" : num(t.hodometro)), formatarFaixa: num, total: false },
                { key: "valor", header: "Valor", filter: "range", align: "right", numero: (t) => t.valor, render: (t) => brl(t.valor) },
              ]}
            />
          </SecaoBanner>
        </div>
      )}
    </Modal>
  );
}
