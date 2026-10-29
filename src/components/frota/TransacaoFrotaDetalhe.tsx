"use client";

import { useEffect, useState } from "react";
import { brl, dataBR, dec, num } from "@/lib/format";
import { type Consumo, ROTULO_ORIGEM, type Veiculo } from "@/lib/frota-core";
import { Button } from "../Button";
import { CampoCongelado } from "../CampoCadeado";
import { DataTable } from "../DataTable";
import { ErroCarga } from "../ErroCarga";
import { IconMapa, IconVeiculo } from "../icons";
import { LinkExterno } from "../LinkExterno";
import { Modal } from "../Modal";
import { SecaoBanner } from "../SecaoBanner";
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
}: {
  id: number | null;
  onClose: () => void;
  veiculo?: Veiculo;
  consumo?: Consumo;
  onVerVeiculo?: (placa: string) => void;
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
  const titulo = t ? `${ab ? "Abastecimento" : "Manutenção"} · ${s("placa") ?? "sem placa"} · ${dataBR(s("dia"))}` : "Registro da frota";

  return (
    <Modal
      open={id != null}
      onClose={onClose}
      titulo={titulo}
      size="lg"
      acoesCabecalho={
        t?.placa && onVerVeiculo ? (
          <Button size="sm" variant="secondary" icon={<IconVeiculo className="h-4 w-4" />} onClick={() => onVerVeiculo(String(t.placa))}>
            Ficha do veículo
          </Button>
        ) : undefined
      }
    >
      {erro ? (
        <ErroCarga msg={erro} onTentar={() => setTentativa((x) => x + 1)} />
      ) : !t ? (
        <SkeletonLinhas linhas={8} />
      ) : (
        <div className="space-y-[var(--gap-block)]">
          <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-4">
            <StatMini label="Valor" value={brl(n("valor"))} tone="accent" />
            {ab ? (
              <>
                <StatMini label="Litros" value={dec(n("litros"))} />
                <StatMini label="Preço do litro" value={n("precoLitro") != null ? brl(n("precoLitro")) : "—"} />
                <StatMini label="Km/l (sistema)" value={consumo?.kmPorLitro ? dec(consumo.kmPorLitro) : "—"} hint={consumo?.km ? `${num(consumo.km)} km desde o anterior` : undefined} />
              </>
            ) : (
              <>
                <StatMini label="Itens" value={num(n("qtdItens"))} />
                <StatMini label="Tipo" value={s("tipoManutencao") ?? "—"} />
                <StatMini label="Hodômetro" value={n("hodometro") != null ? `${num(n("hodometro"))} km` : "—"} />
              </>
            )}
          </div>
          <SecaoBanner titulo="Veículo">
            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
              <CampoCongelado label="Placa" valor={s("placa") ?? s("placaCrua")} />
              <CampoCongelado label="Marca / modelo" valor={[s("marca") ?? veiculo?.marca, s("modelo") ?? veiculo?.modelo].filter(Boolean).join(" ")} />
              <CampoCongelado label="Ano" valor={s("anoFabricacao") ?? (veiculo?.ano ? String(veiculo.ano) : null)} />
              <CampoCongelado label="Prefixo" valor={s("prefixo")} />
              <CampoCongelado label="Hodômetro" valor={n("hodometro") != null ? `${num(n("hodometro"))} km` : s("medidorTexto")} />
              <CampoCongelado label="Km rodado (Vólus)" valor={n("kmRodado") != null ? num(n("kmRodado")) : null} />
              <CampoCongelado label="Origem" valor={veiculo?.origem ? ROTULO_ORIGEM[veiculo.origem] : null} />
              <CampoCongelado label="Cartão" valor={s("cartao")} />
            </div>
          </SecaoBanner>
          <SecaoBanner titulo={ab ? "Posto" : "Estabelecimento"}>
            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
              <CampoCongelado label="Nome" valor={s("estabelecimento")} />
              <CampoCongelado label="CNPJ" valor={s("estabCnpj")} />
              <CampoCongelado label="Endereço" valor={[s("estabEndereco"), s("estabBairro")].filter(Boolean).join(" — ")} />
              <CampoCongelado label="Cidade" valor={s("estabCidade") ? `${s("estabCidade")}${s("estabUf") ? `/${s("estabUf")}` : ""}` : null} />
            </div>
            {t.latitude != null && t.longitude != null && (
              <LinkExterno href={`https://www.google.com/maps?q=${t.latitude},${t.longitude}`} icon={<IconMapa className="h-4 w-4" />}>
                Abrir no mapa
              </LinkExterno>
            )}
          </SecaoBanner>
          <SecaoBanner titulo="Quem e quando">
            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
              <CampoCongelado label="Data e hora" valor={s("dataHora") ? `${dataBR(s("dia"))} ${String(s("dataHora")).slice(11, 16)}` : dataBR(s("dia"))} />
              <CampoCongelado label={ab ? "Motorista" : "Operador"} valor={s("motorista")} />
              <CampoCongelado label="CPF" valor={mascararCpf(s("motoristaCpf"))} />
              <CampoCongelado label="Setor" valor={s("unidadeNome")} />
            </div>
          </SecaoBanner>
          {itens.length > 0 && (
            <SecaoBanner titulo={ab ? "Produtos" : "Itens da manutenção"}>
              <DataTable
                density="compact"
                exportar={{ nome: `${ab ? "Abastecimento" : "Manutencao"} ${s("placa") ?? ""} ${s("dia") ?? ""}` }}
                rows={itens.map((x, i) => ({ i, x }))}
                getKey={(r) => r.i}
                columns={[
                  { key: "d", header: "Descrição", value: (r) => String(r.x[0] ?? ""), render: (r) => <CelulaTexto texto={String(r.x[0] ?? "")} />, align: "left", minWidth: 200 },
                  ...(ab ? [] : [{ key: "tp", header: "Tipo", value: (r: { x: (string | number | null)[] }) => String(r.x[4] ?? "") , render: (r: { x: (string | number | null)[] }) => String(r.x[4] ?? "") }]),
                  { key: "q", header: "Qtd.", filter: "range", numero: (r) => (r.x[1] == null ? null : Number(r.x[1])), value: (r) => dec(Number(r.x[1] ?? 0)), render: (r) => dec(Number(r.x[1] ?? 0)), formatarFaixa: dec, total: false },
                  { key: "u", header: "Vlr. unit.", filter: "range", align: "right", numero: (r) => (r.x[2] == null ? null : Number(r.x[2])), render: (r) => (r.x[2] == null ? "—" : brl(Number(r.x[2]))), total: false },
                  { key: "t", header: "Total", filter: "range", align: "right", numero: (r) => (r.x[3] == null ? null : Number(r.x[3])), render: (r) => (r.x[3] == null ? "—" : brl(Number(r.x[3]))) },
                ]}
              />
            </SecaoBanner>
          )}
          <SecaoBanner titulo="Nota e empenho">
            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
              <CampoCongelado label="Nota fiscal" valor={s("notaFiscal")} />
              <CampoCongelado label="Valor da nota" valor={n("valorNota") != null ? brl(n("valorNota")) : null} />
              <CampoCongelado label="Empenho" valor={s("empenho")} />
              <CampoCongelado label="Processo" valor={s("processo")} />
              <CampoCongelado label="Faturado" valor={t.faturado == null ? null : Number(t.faturado) ? "Sim" : "Não"} />
              <CampoCongelado label="Contrato (Vólus)" valor={s("contrato")} />
              <CampoCongelado label="Código da transação" valor={s("refId")} />
              <CampoCongelado label="Atualizado no sistema" valor={s("atualizadoEm") ? dataBR(String(s("atualizadoEm")).slice(0, 10)) : null} />
            </div>
          </SecaoBanner>
        </div>
      )}
    </Modal>
  );
}
