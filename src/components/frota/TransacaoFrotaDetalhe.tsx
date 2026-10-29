"use client";

import { type ReactNode, useEffect, useState } from "react";
import { brl, dataBR, dec, num } from "@/lib/format";
import { type Consumo, ROTULO_ORIGEM, SEM_ORGAO, SEM_UNIDADE, type Transacao, type Veiculo } from "@/lib/frota-core";
import { BotaoAcao } from "../BotaoAcao";
import { DataTable } from "../DataTable";
import { ErroCarga } from "../ErroCarga";
import { IconMapa, IconVeiculo } from "../icons";
import { LinkExterno } from "../LinkExterno";
import { Modal } from "../Modal";
import { Campo } from "../LiquidacaoDetalhe";
import { SkeletonLinhas } from "../Skeleton";
import { StatMini } from "../StatMini";
import { CelulaTexto } from "../CelulaLista";

/** A transação COMPLETA (`GET /api/frota/transacoes/[id]` — a linha gravada). */
type TransacaoCompleta = Record<string, string | number | null> & { id: number; tipo: "abastecimento" | "manutencao" };

const mascararCpf = (cpf: string | null) => {
  const d = (cpf ?? "").replace(/\D/g, "");
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : cpf ? "•••" : null;
};


/**
 * O BANNER de UM abastecimento ou UMA manutenção: tudo o que a Vólus mandou (o veículo, o motorista, o estabelecimento,
 * os itens, a nota e o empenho) + o consumo calculado pelo sistema (o km desde o abastecimento anterior do veículo).
 */
export function TransacaoFrotaDetalhe({
  id,
  onClose,
  veiculo,
  consumo,
  onVerVeiculo,
  resumo,
}: {
  id: number | null;
  onClose: () => void;
  veiculo?: Veiculo;
  consumo?: Consumo;
  onVerVeiculo?: (placa: string) => void;
  /** A linha do pacote (o Órgão e a Unidade do sistema, que a transação gravada não traz por nome). */
  resumo?: Transacao;
}) {
  const [t, setT] = useState<TransacaoCompleta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: "Tentar de novo" pede outra vez
  useEffect(() => {
    if (id == null) return;
    let vivo = true;
    setT(null);
    setErro(null);
    fetch(`/api/frota/transacoes/${id}`, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; transacao?: TransacaoCompleta };
        if (!vivo) return;
        if (!r.ok || !j.ok || !j.transacao) throw new Error(j.error || "Não foi possível abrir o registro.");
        setT(j.transacao);
      })
      .catch((e) => vivo && setErro((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [id, tentativa]);

  const ab = t?.tipo === "abastecimento";
  const itens: (string | number | null)[][] = (() => {
    try {
      return t?.itens ? (JSON.parse(String(t.itens)) as (string | number | null)[][]) : [];
    } catch {
      return [];
    }
  })();
  const s = (k: string) => (t?.[k] == null ? null : String(t[k]));
  const n = (k: string) => (t?.[k] == null ? null : Number(t[k]));
  const titulo = t ? `${ab ? "Abastecimento" : "Manutenção"} ${s("placa") ?? "sem placa"}` : "Registro da frota";
  const quando = t ? `${dataBR(s("dia"))}${s("dataHora") ? ` ${String(s("dataHora")).slice(11, 16)}` : ""}` : null;
  // Os campos em colunas de largura MÍNIMA (nunca quebram uma palavra no meio): 1 → 2 → 3 conforme o banner.
  const GRADE = "grid grid-cols-[repeat(auto-fill,minmax(min(13rem,100%),1fr))] gap-x-6 gap-y-3.5";

  return (
    <Modal
      open={id != null}
      onClose={onClose}
      titulo={titulo}
      size="xl"
      acoesCabecalho={
        t?.placa && onVerVeiculo ? (
          <BotaoAcao rotulo="Ficha do veículo" icon={<IconVeiculo className="h-4 w-4" />} onClick={() => onVerVeiculo(String(t.placa))} />
        ) : undefined
      }
    >
      {erro ? (
        <ErroCarga msg={erro} onTentar={() => setTentativa((x) => x + 1)} />
      ) : !t ? (
        <SkeletonLinhas linhas={8} />
      ) : (
        <div className="space-y-[var(--gap-block)]">
          {/* Os números numa linha (4 no abastecimento, 3 na manutenção); no celular, duas colunas. */}
          <div className={`grid gap-[var(--gap-block)] ${ab ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"}`}>
            <StatMini label="Valor" value={brl(n("valor"))} tone="accent" />
            {ab ? (
              <>
                <StatMini label="Litros" value={dec(n("litros"))} />
                <StatMini label="Preço do litro" value={n("precoLitro") != null ? brl(n("precoLitro")) : "—"} />
                <StatMini label="Km/l" value={consumo?.kmPorLitro ? dec(consumo.kmPorLitro) : "—"} hint={consumo?.km ? `${num(consumo.km)} km rodados` : undefined} />
              </>
            ) : (
              <>
                <StatMini label="Itens" value={num(n("qtdItens"))} />
                <StatMini label="Hodômetro" value={n("hodometro") != null ? `${num(n("hodometro"))} km` : "—"} />
              </>
            )}
          </div>

          <dl className={GRADE}>
            <Campo label="Data e hora" valor={quando} />
            {!ab && <Campo label="Tipo de manutenção" valor={s("tipoManutencao")} />}
            <Campo label="Órgão" valor={resumo ? (resumo.orgao ? nomeCompleto(resumo.orgao, resumo.orgaoNome) : SEM_ORGAO) : null} />
            <Campo label="Unidade" valor={resumo ? (resumo.unidadeSistema ? nomeCompleto(resumo.unidadeSistema, resumo.unidadeSistemaNome) : SEM_UNIDADE) : null} />
            <Campo label="Setor (Vólus)" valor={s("unidadeNome")} />
            <Campo label={ab ? "Motorista" : "Operador"} valor={s("motorista")} />
            <Campo label="CPF" valor={mascararCpf(s("motoristaCpf"))} />
          </dl>

          <Bloco titulo="Veículo">
            <dl className={GRADE}>
              <Campo label="Placa" valor={s("placa") ?? s("placaCrua")} />
              <Campo label="Marca / modelo" valor={[s("marca") ?? veiculo?.marca, s("modelo") ?? veiculo?.modelo].filter(Boolean).join(" ")} />
              <Campo label="Ano" valor={s("anoFabricacao") ?? (veiculo?.ano ? String(veiculo.ano) : null)} />
              <Campo label="Prefixo" valor={s("prefixo")} />
              <Campo label="Hodômetro" valor={n("hodometro") != null ? `${num(n("hodometro"))} km` : s("medidorTexto")} />
              <Campo label="Km rodado (Vólus)" valor={n("kmRodado") != null ? num(n("kmRodado")) : null} />
              <Campo label="Origem" valor={veiculo?.origem ? ROTULO_ORIGEM[veiculo.origem] : null} />
              <Campo label="Cartão" valor={s("cartao")} />
            </dl>
          </Bloco>

          <Bloco
            titulo={ab ? "Posto" : "Estabelecimento"}
            acao={
              t.latitude != null && t.longitude != null ? (
                <LinkExterno href={`https://www.google.com/maps?q=${t.latitude},${t.longitude}`} icon={<IconMapa className="h-4 w-4" />}>
                  Abrir no mapa
                </LinkExterno>
              ) : undefined
            }
          >
            <dl className={GRADE}>
              <Campo label="Nome" valor={s("estabelecimento")} />
              <Campo label="CNPJ" valor={s("estabCnpj")} />
              <Campo label="Endereço" valor={[s("estabEndereco"), s("estabBairro")].filter(Boolean).join(" — ")} />
              <Campo label="Cidade" valor={s("estabCidade") ? `${s("estabCidade")}${s("estabUf") ? `/${s("estabUf")}` : ""}` : null} />
            </dl>
          </Bloco>

          {itens.length > 0 && (
            <Bloco titulo={ab ? "Produtos" : "Itens da manutenção"}>
              <DataTable
                density="compact"
                exportar={{ nome: `${ab ? "Abastecimento" : "Manutencao"} ${s("placa") ?? ""} ${s("dia") ?? ""}` }}
                rows={itens.map((x, i) => ({ i, x }))}
                getKey={(r) => r.i}
                columns={[
                  { key: "d", header: "Descrição", value: (r) => String(r.x[0] ?? ""), render: (r) => <CelulaTexto texto={String(r.x[0] ?? "")} />, align: "left", minWidth: 200 },
                  ...(ab
                    ? []
                    : [{ key: "tp", header: "Tipo", value: (r: { x: (string | number | null)[] }) => String(r.x[4] ?? ""), render: (r: { x: (string | number | null)[] }) => String(r.x[4] ?? ""), nowrap: true }]),
                  { key: "q", header: "Qtd.", filter: "range", numero: (r) => (r.x[1] == null ? null : Number(r.x[1])), value: (r) => dec(Number(r.x[1] ?? 0)), render: (r) => dec(Number(r.x[1] ?? 0)), formatarFaixa: dec, total: false },
                  { key: "u", header: "Vlr. unit.", filter: "range", align: "right", numero: (r) => (r.x[2] == null ? null : Number(r.x[2])), render: (r) => (r.x[2] == null ? "—" : brl(Number(r.x[2]))), total: false },
                  { key: "t", header: "Total", filter: "range", align: "right", numero: (r) => (r.x[3] == null ? null : Number(r.x[3])), render: (r) => (r.x[3] == null ? "—" : brl(Number(r.x[3]))) },
                ]}
              />
            </Bloco>
          )}

          <div className="rounded-card border border-border bg-surface-2 p-[var(--pad-card)]">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Nota, empenho e registro</p>
            <dl className={GRADE}>
              <Campo label="Nota fiscal" valor={s("notaFiscal")} />
              <Campo label="Valor da nota" valor={n("valorNota") != null ? brl(n("valorNota")) : null} />
              <Campo label="Empenho" valor={s("empenho")} />
              <Campo label="Processo" valor={s("processo")} />
              <Campo label="Faturado" valor={t.faturado == null ? null : Number(t.faturado) ? "Sim" : "Não"} />
              <Campo label="Contrato (Vólus)" valor={s("contrato")} />
              <Campo label="Código da transação" valor={s("refId")} />
              <Campo label="Atualizado no sistema" valor={s("atualizadoEm") ? dataBR(String(s("atualizadoEm")).slice(0, 10)) : null} />
            </dl>
          </div>
        </div>
      )}
    </Modal>
  );
}

const nomeCompleto = (sigla: string, nome: string | null) => (nome && nome !== sigla ? `${sigla} — ${nome}` : sigla);

/** Um bloco do banner (o padrão dos banners da Execução): o título em caixa-alta discreto, a ação à direita, o conteúdo. */
function Bloco({ titulo, acao, children }: { titulo: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-card border border-border p-[var(--pad-card)]">
      <div className="mb-2 flex min-h-6 flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-faint">{titulo}</p>
        {acao}
      </div>
      {children}
    </section>
  );
}
