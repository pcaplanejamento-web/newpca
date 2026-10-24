"use client";

import { useAnoDoCard } from "./anoDoCard";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { ResultadoTeste } from "@/lib/centi-resposta-core";
import {
  anosDoCard,
  type CardEmpenho,
  type EdicaoCard,
  edicaoDoCard,
  FREQUENCIAS,
  motivoCardInvalido,
  OPCOES_QUEDA,
  opcoesAnos,
  previaPedido,
  REGRAS_REMOVIDOS,
  type RegraRemovidos,
  rotaDoCard,
} from "@/lib/empenho-cards-core";
import { num } from "@/lib/format";
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
 * A aba CONFIGURAÇÃO de um card: a identificação, os ANOS, a programação da atualização automática, as REGRAS da
 * conferência e a INTEGRAÇÃO (endereço e parâmetros — avançado) com o TESTE (um pedido de verdade com a configuração em
 * curso, sem gravar nada). Edição direta, com o "(?)" em cada campo; "Salvar" na barra das abas (só com alteração) — a
 * régua é `motivoCardInvalido`, a mesma do servidor. Sair com alteração não salva avisa.
 */
export function EmpenhoCardConfig({ card, origens = [] }: { card: CardEmpenho; /** Liquidações: os cards de empenhos (a origem). */ origens?: { id: number; nome: string; vinculos: number }[] }) {
  const liq = card.tipo === "liquidacoes";
  const router = useRouter();
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

  const motivo = motivoCardInvalido(v, card.tipo);
  const alterado = JSON.stringify(v) !== JSON.stringify(edicaoDoCard(card));
  const previa = useMemo(() => previaPedido(v, ano), [v, ano]);
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
        card.configuradoEm ? `Card "${j.card.nome}" salvo.` : liq ? `Configuração confirmada — o card "${j.card.nome}" já pode importar as liquidações.` : `Configuração confirmada — agora crie os vínculos do card "${j.card.nome}".`,
      );
      setV(edicaoDoCard(j.card));
      if (!card.configuradoEm) router.push(rotaDoCard(card, liq ? "importacao" : "vinculos"));
      else router.refresh();
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
        {liq && (
          <SecaoBanner titulo="Empenhos de origem">
            <SelectField
              denso
              label="Card de empenhos"
              value={v.origemId == null ? "" : String(v.origemId)}
              onChange={(e) => muda("origemId", e.target.value ? Number(e.target.value) : null)}
              rotuloExtra={
                <A titulo="Card de empenhos de origem">
                  <p>
                    A liquidação só é gravada quando o <strong>empenho</strong> dela está neste card de empenhos — e segue o vínculo dele (o órgão
                    e a unidade do cadastro). Os órgãos da Centi pedidos são os de destino dos vínculos dele.
                  </p>
                  <p>Importe os empenhos antes: a liquidação de um empenho que ainda não está no card não entra.</p>
                </A>
              }
            >
              <option value="">Escolha…</option>
              {origens.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome} ({num(o.vinculos)} vínculos)
                </option>
              ))}
            </SelectField>
            {card.origemId != null && v.origemId !== card.origemId && (
              <Callout kind="warn">Ao salvar, as liquidações gravadas neste card (dos empenhos do card anterior) saem do banco — importe de novo pela origem nova.</Callout>
            )}
          </SecaoBanner>
        )}
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

        <SecaoBanner titulo="Atualização automática">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SelectField denso label="Frequência" value={String(v.frequenciaMin)} onChange={(e) => muda("frequenciaMin", Number(e.target.value))} rotuloExtra={<A titulo="Frequência">De quanto em quanto tempo o card é lido, dentro do horário.</A>}>
              {FREQUENCIAS.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.rotulo}
                </option>
              ))}
            </SelectField>
            <TextField denso label="Das" type="time" value={v.horaInicio} onChange={(e) => muda("horaInicio", e.target.value)} rotuloExtra={<A titulo="Horário">A leitura só acontece entre esses horários (Brasília).</A>} />
            <TextField denso label="Até" type="time" value={v.horaFim} onChange={(e) => muda("horaFim", e.target.value)} rotuloExtra={<A titulo="Horário">A leitura só acontece entre esses horários (Brasília).</A>} />
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-1">
              <Switch checked={v.diasUteis} onChange={(x) => muda("diasUteis", x)} label="Só em dias úteis" />
              <A titulo="Dias úteis">Ligado: não lê aos sábados, domingos e feriados.</A>
            </div>
            <div className="flex items-center gap-1">
              <Switch checked={v.ativa} onChange={(x) => muda("ativa", x)} label="Ligada" dica="Liga a atualização automática deste card (desligada por padrão)." />
              <A titulo="Ligada">
                No horário e na frequência acima, o sistema importa sozinho os anos do card (um por vez, em rodízio), poucas páginas a cada
                5 minutos, com a MESMA conferência da importação manual. Uma queda suspeita nunca passa sozinha — a importação fecha como
                parcial e você confirma numa importação manual.
              </A>
            </div>
          </div>
        </SecaoBanner>

        <SecaoBanner titulo="Regras da conferência">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SelectField denso label={liq ? "Queda da soma liquidada" : "Queda da soma empenhada"} value={String(v.quedaSoma)} onChange={(e) => muda("quedaSoma", Number(e.target.value))} rotuloExtra={<A titulo="Queda da soma">A importação que trouxer a soma {liq ? "liquidada" : "empenhada"} do ano ABAIXO deste % da última importação concluída pede confirmação antes de gravar (a automática fecha como parcial).</A>}>
              {OPCOES_QUEDA.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </SelectField>
            <SelectField denso label="Queda dos registros" value={String(v.quedaRegistros)} onChange={(e) => muda("quedaRegistros", Number(e.target.value))} rotuloExtra={<A titulo="Queda dos registros">O mesmo para o número de registros do ano.</A>}>
              {OPCOES_QUEDA.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </SelectField>
          </div>
          <SelectField denso label="Empenhos que a Centi não traz mais" value={v.removidos} onChange={(e) => muda("removidos", e.target.value as RegraRemovidos)} rotuloExtra={<A titulo="Removidos na Centi">Marcar = ficam guardados, fora das somas (o rodapé da tabela mostra “Removidos na Centi”). Apagar = saem do banco na importação conferida.</A>}>
            {REGRAS_REMOVIDOS.map((r) => (
              <option key={r.valor} value={r.valor}>
                {r.rotulo}
              </option>
            ))}
          </SelectField>
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
              <TextField denso label="Endpoint" value={v.endpoint} onChange={(e) => muda("endpoint", e.target.value)} autoComplete="off" rotuloExtra={<A titulo="Endpoint">O nome da API no portal (ex.: getempenhos, getliquidacoes).</A>} />
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
