"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type ApiCenti,
  apiDosCampos,
  camposDaApi,
  DIVISOES,
  edicaoDaApi,
  estadoApi,
  FREQUENCIAS,
  motivoApiInvalida,
  OPCOES_ANOS,
  pedidosPorAno,
  previaPedido,
  rotuloFrequencia,
} from "@/lib/centi-apis-core";
import { dataHoraBR, dataIsoBrasilia } from "@/lib/format";
import { Ajuda } from "./Ajuda";
import { Badge } from "./Badge";
import { BannerCadastro, type CampoCadastro } from "./BannerCadastro";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { ErroCarga } from "./ErroCarga";
import { SecaoBanner } from "./SecaoBanner";
import { SkeletonLinhas } from "./Skeleton";
import { toast } from "./Toast";

/**
 * Integrações → "APIs da Centi": o CADASTRO das APIs públicas do portal de transparência (empenhos, liquidações,
 * pagamentos, contratos, receita). Só o cadastro — nada aqui chama a Centi. Tocar numa linha abre o `BannerCadastro`
 * (cadeado por campo, só o que mudou); cada API fica "Em preparação" até a importação dela existir e só então pode ser
 * ligada (a régua `motivoApiInvalida`, a mesma do servidor).
 */

const SIM_NAO = [
  { valor: "1", rotulo: "Sim" },
  { valor: "0", rotulo: "Não" },
];

/** Os campos do banner — "Ligada" só aparece com a importação pronta. */
function camposDoBanner(implementada: boolean): CampoCadastro[] {
  const c: CampoCadastro[] = [
    { chave: "nome", label: "Nome", max: 60, obrigatorio: true },
    { chave: "endpoint", label: "Endpoint", mono: true, max: 80, obrigatorio: true },
    { chave: "descricao", label: "Descrição", span: true, max: 400 },
    { chave: "urlBase", label: "URL base", mono: true, span: true, max: 200, obrigatorio: true, dica: "Só HTTPS do domínio da Centi (centi.com.br)." },
    { chave: "uf", label: "UF", mono: true, max: 4, obrigatorio: true },
    { chave: "tenant", label: "Município", mono: true, max: 40, obrigatorio: true },
    { chave: "divisao", label: "Como o ano é pedido", opcoes: DIVISOES.map((d) => ({ valor: d.valor, rotulo: d.rotulo })) },
    { chave: "paginado", label: "Devolve páginas", opcoes: SIM_NAO },
    {
      chave: "parametros",
      label: "Parâmetros do pedido (JSON)",
      mono: true,
      span: true,
      max: 2000,
      obrigatorio: true,
      dica: "Marcadores: {ano}, {orgao}, {fonte} e {pagina}. A página é acrescentada sozinha nas APIs que devolvem páginas.",
    },
    {
      chave: "lista",
      label: "Órgãos (idOrgao) ou fontes",
      mono: true,
      span: true,
      max: 1200,
      inputMode: "numeric",
      filtro: (v) => v.replace(/[^\d;,\s]/g, ""),
      dica: "Os números separados por ponto e vírgula. Só vale quando o ano é pedido por órgão ou por fonte.",
    },
    { chave: "frequenciaMin", label: "Frequência", opcoes: FREQUENCIAS.map((f) => ({ valor: String(f.valor), rotulo: f.rotulo })) },
    { chave: "diasUteis", label: "Só em dias úteis", opcoes: SIM_NAO },
    { chave: "horaInicio", label: "Das (HH:MM)", mono: true, max: 5, placeholder: "07:00", filtro: (v) => v.replace(/[^\d:]/g, "") },
    { chave: "horaFim", label: "Até (HH:MM)", mono: true, max: 5, placeholder: "19:00", filtro: (v) => v.replace(/[^\d:]/g, "") },
    { chave: "anos", label: "Anos mantidos", opcoes: OPCOES_ANOS.map((o) => ({ valor: String(o.valor), rotulo: o.rotulo })) },
  ];
  if (implementada) c.push({ chave: "ativa", label: "Ligada", opcoes: SIM_NAO });
  return c;
}

function AjudaApis() {
  return (
    <Ajuda titulo="APIs da Centi" botao="sm">
      <p>
        O cadastro das APIs <strong>públicas</strong> do portal de transparência da Centi — as que trazem a execução da
        despesa (empenhos, liquidações e pagamentos), os contratos e a receita.
      </p>
      <p>
        Cada API diz <strong>como</strong> será lida: o endereço, os parâmetros (com os marcadores {"{ano}"}, {"{orgao}"},{" "}
        {"{fonte}"} e {"{pagina}"}), se o ano é pedido inteiro, por órgão ou por fonte, e quando atualizar. Toque numa
        linha para ver e editar.
      </p>
      <p>
        Por enquanto é <strong>só o cadastro</strong>: nada é buscado na Centi. Cada API fica “Em preparação” até a
        importação dela chegar — começando pelos empenhos.
      </p>
    </Ajuda>
  );
}

const rotuloDivisao = (a: ApiCenti) =>
  `${DIVISOES.find((d) => d.valor === a.divisao)?.rotulo ?? a.divisao}${a.divisao !== "ano" ? ` (${a.lista.length})` : ""}${a.paginado ? " · paginada" : ""}`;

const COLUNAS: Column<ApiCenti>[] = [
  {
    key: "nome",
    header: "API",
    align: "left",
    minWidth: 180,
    value: (a) => a.nome,
    render: (a) => (
      <span className="flex min-w-0 flex-col">
        <span className="font-semibold text-text">{a.nome}</span>
        <span className="truncate font-mono text-[11.5px] text-faint">{a.endpoint}</span>
      </span>
    ),
  },
  {
    key: "estado",
    header: "Estado",
    nowrap: true,
    value: (a) => estadoApi(a).rotulo,
    render: (a) => {
      const e = estadoApi(a);
      return (
        <Badge tone={e.tom} dot>
          {e.rotulo}
        </Badge>
      );
    },
  },
  { key: "divisao", header: "Leitura", nowrap: true, value: rotuloDivisao, render: (a) => <span className="text-text-2">{rotuloDivisao(a)}</span> },
  {
    key: "frequencia",
    header: "Atualização",
    nowrap: true,
    value: (a) => rotuloFrequencia(a.frequenciaMin, a.diasUteis, a.horaInicio, a.horaFim),
    render: (a) => <span className="text-muted">{rotuloFrequencia(a.frequenciaMin, a.diasUteis, a.horaInicio, a.horaFim)}</span>,
  },
  {
    key: "ultima",
    header: "Última leitura",
    nowrap: true,
    value: (a) => dataHoraBR(a.ultimaExecucao),
    render: (a) => <span className="tabular-nums text-faint">{dataHoraBR(a.ultimaExecucao)}</span>,
  },
];

export function CentiApisAdmin() {
  const [apis, setApis] = useState<ApiCenti[] | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [aberta, setAberta] = useState<ApiCenti | null>(null);
  const [salvando, setSalvando] = useState(false);
  const { confirmar, confirmacao } = useConfirmacao();

  const carregar = useCallback(async () => {
    setErroCarga(null);
    try {
      const r = await fetch("/api/admin/centi-apis");
      const j = (await r.json()) as { ok?: boolean; error?: string; apis?: ApiCenti[] };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar as APIs.");
      setApis(j.apis ?? []);
    } catch (e) {
      setErroCarga(e instanceof Error ? e.message : "Erro ao carregar as APIs.");
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvar(patch: Record<string, string>): Promise<boolean> {
    if (!aberta) return false;
    const edicao = apiDosCampos({ ...camposDaApi(edicaoDaApi(aberta)), ...patch });
    const motivo = motivoApiInvalida(edicao, aberta.implementada);
    if (motivo) {
      toast.error(motivo);
      return false;
    }
    setSalvando(true);
    try {
      const r = await fetch(`/api/admin/centi-apis/${aberta.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edicao),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; api?: ApiCenti };
      if (!r.ok || !j.ok || !j.api) throw new Error(j.error ?? "Erro ao salvar a API.");
      const nova = j.api;
      toast.success(`API "${nova.nome}" salva.`);
      setApis((l) => (l ? l.map((x) => (x.id === nova.id ? nova : x)) : l));
      setAberta(nova);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar a API.");
      return false;
    } finally {
      setSalvando(false);
    }
  }

  const ano = Number(dataIsoBrasilia(new Date().toISOString()).slice(0, 4));
  const previa = aberta ? previaPedido(aberta, ano) : null;
  const pedidos = aberta ? pedidosPorAno(aberta) : 0;

  return (
    <>
      {erroCarga && <ErroCarga kind={apis ? "warn" : "danger"} msg={erroCarga} onTentar={carregar} />}
      {apis === null ? (
        !erroCarga && (
          <div className="rounded-card border border-border p-[var(--pad-card)]">
            <SkeletonLinhas linhas={5} />
          </div>
        )
      ) : (
        <DataTable
          columns={COLUNAS}
          rows={apis}
          getKey={(a) => a.id}
          density="compact"
          onRowClick={setAberta}
          activeKey={aberta?.id}
          minWidth={720}
          exportar={{ nome: "APIs da Centi" }}
          acoesRodape={<AjudaApis />}
          resumo={(l) => `${l.length} API${l.length === 1 ? "" : "s"}`}
        />
      )}
      {aberta && (
        <BannerCadastro
          aberto
          novo={false}
          titulo={`API da Centi — ${aberta.nome}`}
          campos={camposDoBanner(aberta.implementada)}
          inicial={camposDaApi(edicaoDaApi(aberta))}
          ocupado={salvando}
          onSalvar={salvar}
          onFechar={() => setAberta(null)}
          confirmarDescarte={() => confirmar({ titulo: "Descartar as alterações?", texto: "Os dados alterados não foram salvos.", confirmar: "Descartar", perigo: true })}
          rodapeEsquerda={
            <Badge tone={estadoApi(aberta).tom} dot>
              {estadoApi(aberta).rotulo}
            </Badge>
          }
        >
          {!aberta.implementada && (
            <Callout kind="info">
              Em preparação: a importação desta API ainda não existe. O cadastro pode ser ajustado; a opção “Ligada” aparece
              quando a importação chegar.
            </Callout>
          )}
          {previa && (
            <SecaoBanner
              titulo={`Prévia do 1º pedido de ${ano}`}
              acao={
                <span className="text-[12px] text-muted">
                  {pedidos} pedido{pedidos === 1 ? "" : "s"} por ano{aberta.paginado ? " + as páginas" : ""} · nada é enviado
                </span>
              }
            >
              <p className="break-all font-mono text-[12px] text-text">POST {previa.url}</p>
              {previa.erro ? (
                <p className="text-[12.5px] text-[color:var(--danger)]">{previa.erro}</p>
              ) : (
                <pre className="whitespace-pre-wrap break-all rounded-control bg-surface-2 p-3 font-mono text-[12px] text-muted">{JSON.stringify(previa.corpo, null, 2)}</pre>
              )}
            </SecaoBanner>
          )}
        </BannerCadastro>
      )}
      {confirmacao}
    </>
  );
}
