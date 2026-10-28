"use client";

import { useAnoDoCard } from "./anoDoCard";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { ResultadoTeste } from "@/lib/centi-resposta-core";
import {
  anosDoCard,
  cardPorOrgao,
  type CardEmpenho,
  type EdicaoCard,
  edicaoDoCard,
  motivoCardInvalido,
  opcoesAnos,
  previaPedido,
  type LeituraPorOrgao,
} from "@/lib/empenho-cards-core";
import { dataIsoBrasilia } from "@/lib/format";
import { FerramentasAba } from "./AbasEspaco";
import { Ajuda } from "./Ajuda";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { ColorField } from "./ColorField";
import { type Column, DataTable } from "./DataTable";
import { SelectField, TextArea, TextField } from "./Field";
import { IconChevronDown, IconPlay, IconSave } from "./icons";
import { SecaoBanner } from "./SecaoBanner";
import { SeletorMultiplo } from "./SeletorMultiplo";
import { StatMini } from "./StatMini";
import { Switch } from "./Switch";
import { toast } from "./Toast";

const anoAtual = () => Number(dataIsoBrasilia(new Date().toISOString()).slice(0, 4));

/** O "(?)" de um campo. */
function A({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Ajuda titulo={titulo} compacta>
      {children}
    </Ajuda>
  );
}

/**
 * A CONFIGURAÇÃO de um card: a identificação, os ANOS e a INTEGRAÇÃO (a atualização automática e as regras da
 * conferência são CENTRAIS — o painel do topo de Configurações → Importações); a INTEGRAÇÃO (endereço e parâmetros — avançado) com o TESTE (um pedido de verdade com a configuração em
 * curso, sem gravar nada). Edição direta, com o "(?)" em cada campo; "Salvar" na barra das abas (só com alteração) — a
 * régua é `motivoCardInvalido`, a mesma do servidor. Sair com alteração não salva avisa.
 */
export function EmpenhoCardConfig({
  card,
  leitura,
  onSalvo,
}: {
  card: CardEmpenho;
  leitura?: LeituraPorOrgao;
  /** Salvou: quem hospeda relê o card; `proxima` = a etapa a abrir depois da 1ª confirmação. */
  onSalvo: (proxima: "importacao" | "vinculos" | null) => void;
}) {
  const liq = cardPorOrgao(card.tipo);
  const [v, setV] = useState<EdicaoCard>(() => edicaoDoCard(card));
  const [salvando, setSalvando] = useState(false);
  const [avancado, setAvancado] = useState(false);
  // O Testar usa o que está na tela: oferece os anos salvos e os acrescentados (ainda sem salvar).
  const anosTeste = useMemo(() => [...new Set([...anosDoCard(card.anos, anoAtual()), ...anosDoCard(v.anos, anoAtual())])].sort((a, b) => b - a), [card.anos, v.anos]);
  const [ano, setAno] = useAnoDoCard(card.id, anosTeste);
  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState<ResultadoTeste | null>(null);
  const muda = <K extends keyof EdicaoCard>(k: K, valor: EdicaoCard[K]) => {
    setV((x) => ({ ...x, [k]: valor }));
    setTeste(null);
  };

  const motivo = motivoCardInvalido(v);
  const alterado = JSON.stringify(v) !== JSON.stringify(edicaoDoCard(card));
  const previa = useMemo(() => previaPedido(v, ano, undefined, card.tipo), [v, ano, card.tipo]);
  const anosDeFato = anosDoCard(v.anos, anoAtual());

  // O card mudou no servidor (outra pessoa salvou): sem edição em curso aqui, a tela acompanha.
  const base = JSON.stringify(edicaoDoCard(card));
  const [baseVista, setBaseVista] = useState(base);
  if (base !== baseVista) {
    setBaseVista(base);
    if (JSON.stringify(v) === baseVista) setV(edicaoDoCard(card));
  }

  useEffect(() => {
    if (!alterado) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [alterado]);

  async function salvar() {
    if (motivo) {
      toast.error(motivo);
      return;
    }
    setSalvando(true);
    try {
      const r = await fetch(`/api/empenhos/cards/${card.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; card?: CardEmpenho };
      if (!r.ok || !j.ok || !j.card) throw new Error(j.error ?? "Erro ao salvar o card.");
      toast.success(
        card.configuradoEm ? `Card "${j.card.nome}" salvo.` : liq ? `Configuração confirmada — o card "${j.card.nome}" já pode importar.` : `Configuração confirmada — agora crie os vínculos do card "${j.card.nome}".`,
      );
      setV(edicaoDoCard(j.card));
      // A 1ª confirmação leva à etapa seguinte (os vínculos; nas liquidações e nos pagamentos, a importação).
      onSalvo(card.configuradoEm ? null : liq ? "importacao" : "vinculos");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar o card.");
    } finally {
      setSalvando(false);
    }
  }

  async function testar() {
    setTestando(true);
    setTeste(null);
    try {
      const r = await fetch(`/api/empenhos/cards/${card.id}/testar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ edicao: v, ano }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; resultado?: ResultadoTeste };
      if (!r.ok || !j.ok || !j.resultado) throw new Error(j.error ?? "Não foi possível testar.");
      setTeste(j.resultado);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível testar.");
    } finally {
      setTestando(false);
    }
  }

  const colunasAmostra: Column<Record<string, string>>[] = (teste?.campos ?? []).slice(0, 12).map((c) => ({
    key: c,
    header: c,
    nowrap: true,
    value: (r) => r[c] ?? "",
    render: (r) => <span className="text-[12.5px]">{r[c] || "—"}</span>,
  }));

  return (
    <>
      <FerramentasAba>
        <Button size="sm" onClick={salvar} loading={salvando} disabled={(!alterado && !!card.configuradoEm) || !!motivo} icon={<IconSave className="h-4 w-4" />}>
          {card.configuradoEm ? "Salvar" : "Confirmar configuração"}
        </Button>
      </FerramentasAba>

      {motivo && (alterado || !card.configuradoEm) && <Callout kind="danger">{motivo}</Callout>}

      <div className="grid grid-cols-1 gap-[var(--gap-block)] xl:grid-cols-2">
        <SecaoBanner titulo="Identificação">
          <TextField denso label="Nome" value={v.nome} onChange={(e) => muda("nome", e.target.value)} maxLength={60} rotuloExtra={<A titulo="Nome">Como o card aparece na lista e no cabeçalho.</A>} />
          <ColorField label="Cor do card" value={v.cor} onChange={(cor) => muda("cor", cor)} />
          <TextArea label="Descrição" rows={2} value={v.descricao} onChange={(e) => muda("descricao", e.target.value)} maxLength={400} rotuloExtra={<A titulo="Descrição">Para que serve este card — aparece para quem o consultar.</A>} />
        </SecaoBanner>

        <SecaoBanner titulo="Anos">
          <SeletorMultiplo
            rotulo="Anos importados"
            opcoes={opcoesAnos(anoAtual()).map((o) => ({ valor: String(o.valor), rotulo: o.rotulo }))}
            selecionados={v.anos.map(String)}
            onChange={(l) => muda("anos", l.map(Number))}
            textoVazio="Nenhum"
            campo={{
              denso: true,
              extra: (
                <A titulo="Anos">
                  <p>Os anos que o card importa e mantém atualizados. “Ano atual” e “Ano anterior” acompanham a virada do ano; um ano fixo fica sempre o mesmo.</p>
                  <p>A atualização automática lê um ano por vez, em rodízio (primeiro o nunca lido, depois o lido há mais tempo).</p>
                </A>
              ),
            }}
          />
          <p className="text-[12.5px] text-muted">{anosDeFato.length ? `Hoje: ${anosDeFato.join(", ")}.` : "Nenhum ano válido escolhido."}</p>
        </SecaoBanner>

      </div>

      <SecaoBanner
        titulo="Integração"
        acao={
          <Button size="sm" variant="ghost" aria-expanded={avancado} onClick={() => setAvancado((a) => !a)} icon={<IconChevronDown className={`h-4 w-4 transition-transform ${avancado ? "rotate-180" : ""}`} />}>
            {avancado ? "Ocultar" : "Mostrar"}
          </Button>
        }
      >
        {avancado ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1.4fr_0.6fr_1fr]">
              <TextField denso label="URL base" value={v.urlBase} onChange={(e) => muda("urlBase", e.target.value)} autoComplete="off" rotuloExtra={<A titulo="URL base">O endereço do portal da Centi. Só HTTPS do domínio centi.com.br.</A>} />
              <TextField denso label="Endpoint" value={v.endpoint} onChange={(e) => muda("endpoint", e.target.value)} autoComplete="off" rotuloExtra={<A titulo="Endpoint">O nome da API no portal (ex.: getempenhos, getliquidacoes, GetOrdempaPamento).</A>} />
              <TextField denso label="UF" value={v.uf} onChange={(e) => muda("uf", e.target.value)} maxLength={4} autoComplete="off" rotuloExtra={<A titulo="UF">A sigla do estado no endereço (go).</A>} />
              <TextField denso label="Município" value={v.tenant} onChange={(e) => muda("tenant", e.target.value)} autoComplete="off" rotuloExtra={<A titulo="Município">O município no endereço (rioverde).</A>} />
            </div>
            <TextArea
              label="Parâmetros do pedido (JSON)"
              rows={3}
              mono
              value={v.parametros}
              onChange={(e) => muda("parametros", e.target.value)}
              rotuloExtra={
                <A titulo="Parâmetros">
                  <p>O que vai no corpo do pedido, em JSON. Os marcadores são trocados a cada pedido:</p>
                  <p>
                    <code>{"{ano}"}</code> o ano · <code>{"{inicio}"}</code> e <code>{"{fim}"}</code> o período (dd/mm/aaaa) · <code>{"{pagina}"}</code> a página.
                  </p>
                  <p>Com o período, a importação lê o ano semana a semana — e divide o período que vier grande demais. A página é acrescentada sozinha a partir da 2ª.</p>
                </A>
              }
            />
          </>
        ) : (
          <p className="break-all font-mono text-[12px] text-muted">POST {previa.url}</p>
        )}
        {leitura && (
          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center gap-1">
              <Switch checked={v.porOrgao} onChange={(x) => muda("porOrgao", x)} label="Ler só os órgãos dos vínculos" dica="Um pedido por órgão (pelo ID na Centi), em vez do ano inteiro de todos os órgãos." />
              <A titulo="Ler por órgão">
                <p>A Centi filtra os empenhos pelo ID do órgão. Ligado, a importação pede só os órgãos gestores dos vínculos deste card — menos dados baixados e menos gravações no banco.</p>
                <p>Vale quando TODO órgão gestor dos vínculos tem o ID conhecido (Vínculos → “Descobrir os IDs”). Faltando algum, a importação lê o ano inteiro de todos os órgãos, como sempre — nenhum órgão fica sem atualizar.</p>
              </A>
            </div>
            {v.porOrgao &&
              (leitura.vale ? (
                <p className="text-[13px] text-muted">Lê {leitura.ids.length} órgão(s) da Centi: ID {leitura.ids.join(", ")}.</p>
              ) : (
                <Callout kind="warn">
                  {leitura.semId.length
                    ? `Sem o ID na Centi: ${leitura.semId.slice(0, 4).join("; ")}${leitura.semId.length > 4 ? ` e mais ${leitura.semId.length - 4}` : ""}. Até descobrir (Vínculos → “Descobrir os IDs”), a importação lê o ano inteiro de todos os órgãos.`
                    : "Crie os vínculos do card para ler por órgão."}
                </Callout>
              ))}
          </div>
        )}
      </SecaoBanner>

      <SecaoBanner
        titulo="Testar"
        acao={
          <span className="flex items-center gap-1">
            <Button size="sm" variant="secondary" onClick={testar} loading={testando} disabled={!!previa.erro || !!motivo} title={previa.erro ?? motivo ?? undefined} icon={<IconPlay className="h-4 w-4" />}>
              Testar agora
            </Button>
            <A titulo="Testar">
              Faz <strong>um</strong> pedido de verdade à Centi com o que está na tela (mesmo sem salvar) — o ano escolhido de 01/01 até 31/12 (também no ano atual) — o MESMO ano da Importação e do “Buscar na Centi” — e mostra o
              que voltou: quantos registros, o total que a API informa, os campos e uma amostra. Nada é gravado.
            </A>
          </span>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,10rem)]">
          <SelectField
            denso
            label="Ano"
            value={String(ano)}
            onChange={(e) => {
              setAno(Number(e.target.value));
              setTeste(null);
            }}
          >
            {anosTeste.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </SelectField>
        </div>
        {previa.erro ? (
          <p className="text-[12.5px] text-[color:var(--danger)]">{previa.erro}</p>
        ) : (
          <pre className="whitespace-pre-wrap break-all rounded-control bg-surface-2 p-3 font-mono text-[12px] text-muted">{`POST ${previa.url}\n${JSON.stringify(previa.corpo, null, 2)}`}</pre>
        )}
        {teste && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-4">
              <StatMini label="Resposta" value={teste.status || "Sem resposta"} tone={teste.ok ? "ok" : "danger"} />
              <StatMini label="Tempo" value={`${(teste.ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`} />
              <StatMini label="Registros" value={teste.itens.toLocaleString("pt-BR")} />
              <StatMini label="Total na API" value={teste.total != null ? teste.total.toLocaleString("pt-BR") : "—"} />
            </div>
            {teste.mensagem && <Callout kind={teste.ok ? "warn" : "danger"}>{teste.mensagem}</Callout>}
            {teste.amostra.length > 0 && (
              <DataTable
                columns={colunasAmostra}
                rows={teste.amostra.map((r, i) => ({ ...r, "#": String(i + 1) }))}
                getKey={(r) => r["#"]}
                density="compact"
                exportar={{ nome: `Teste ${v.nome}` }}
                resumo={() => `Amostra: ${teste.amostra.length} de ${teste.itens} · ${teste.campos.length} campos${teste.campos.length > 12 ? " (12 à vista)" : ""}`}
              />
            )}
          </div>
        )}
      </SecaoBanner>
    </>
  );
}
