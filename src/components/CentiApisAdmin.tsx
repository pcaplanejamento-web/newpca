"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type ApiCenti,
  DIVISOES,
  type DivisaoApi,
  type EdicaoApi,
  estadoApi,
  FREQUENCIAS,
  motivoApiInvalida,
  OPCOES_ANOS,
  pedidosPorAno,
  previaPedido,
  rotuloFrequencia,
} from "@/lib/centi-apis-core";
import { Ajuda } from "./Ajuda";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { ErroCarga } from "./ErroCarga";
import { CampoLista, SelectField, TextArea, TextField } from "./Field";
import { IconCode } from "./icons";
import { Modal } from "./Modal";
import { SkeletonLinhas } from "./Skeleton";
import { Switch } from "./Switch";
import { toast } from "./Toast";

/**
 * Integrações → "APIs da Centi": o CADASTRO das APIs públicas do portal de transparência (empenhos, liquidações,
 * pagamentos, contratos, receita). Só o cadastro — nada aqui chama a Centi. Cada API fica "Em preparação" até a
 * importação dela existir; só então pode ser ligada (a régua `motivoApiInvalida`, a mesma do servidor).
 */

function paraEdicao(a: ApiCenti): EdicaoApi {
  return {
    nome: a.nome,
    descricao: a.descricao,
    urlBase: a.urlBase,
    endpoint: a.endpoint,
    uf: a.uf,
    tenant: a.tenant,
    divisao: a.divisao,
    paginado: a.paginado,
    parametros: a.parametros,
    lista: a.lista,
    ativa: a.ativa,
    frequenciaMin: a.frequenciaMin,
    diasUteis: a.diasUteis,
    horaInicio: a.horaInicio,
    horaFim: a.horaFim,
    anos: a.anos,
  };
}

const ANO_ATUAL = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(new Date()));

function AjudaApis() {
  return (
    <Ajuda titulo="APIs da Centi">
      <p>
        O cadastro das APIs <strong>públicas</strong> do portal de transparência da Centi — as que trazem a execução da
        despesa (empenhos, liquidações e pagamentos), os contratos e a receita.
      </p>
      <p>
        Cada API diz <strong>como</strong> será lida: o endereço, os parâmetros (com os marcadores {"{ano}"}, {"{orgao}"},{" "}
        {"{fonte}"} e {"{pagina}"}), se o ano é pedido inteiro, por órgão ou por fonte, e quando atualizar.
      </p>
      <p>
        Por enquanto é <strong>só o cadastro</strong>: nada é buscado na Centi. Cada API fica “Em preparação” até a
        importação dela chegar — começando pelos empenhos.
      </p>
    </Ajuda>
  );
}

export function CentiApisAdmin() {
  const [apis, setApis] = useState<ApiCenti[] | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [aberta, setAberta] = useState<ApiCenti | null>(null);

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

  const cols: Column<ApiCenti>[] = [
    {
      key: "nome",
      header: "API",
      align: "left",
      minWidth: 180,
      value: (a) => a.nome,
      render: (a) => (
        <div className="min-w-0 py-1">
          <div className="font-semibold text-text">{a.nome}</div>
          <div className="truncate font-mono text-[11.5px] text-faint">{a.endpoint}</div>
        </div>
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
    {
      key: "divisao",
      header: "Leitura",
      nowrap: true,
      value: (a) => DIVISOES.find((d) => d.valor === a.divisao)?.rotulo ?? a.divisao,
      render: (a) => (
        <span className="text-[12.5px] text-text-2">
          {DIVISOES.find((d) => d.valor === a.divisao)?.rotulo}
          {a.divisao !== "ano" && <span className="text-faint"> ({a.lista.length})</span>}
          {a.paginado && <span className="text-faint"> · paginada</span>}
        </span>
      ),
    },
    {
      key: "frequencia",
      header: "Atualização",
      nowrap: true,
      value: (a) => rotuloFrequencia(a.frequenciaMin, a.diasUteis, a.horaInicio, a.horaFim),
      render: (a) => <span className="text-[12.5px] text-muted">{rotuloFrequencia(a.frequenciaMin, a.diasUteis, a.horaInicio, a.horaFim)}</span>,
    },
    {
      key: "ultima",
      header: "Última leitura",
      nowrap: true,
      value: (a) => a.ultimaExecucao ?? "—",
      render: (a) => <span className="text-[12.5px] text-faint">{a.ultimaExecucao ?? "—"}</span>,
    },
  ];

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-muted">
          As APIs públicas do portal de transparência da Centi. Por enquanto só o cadastro — nada é buscado.
        </p>
        <AjudaApis />
      </div>
      {erroCarga && <ErroCarga kind={apis ? "warn" : "danger"} msg={erroCarga} onTentar={carregar} />}
      {apis === null ? (
        !erroCarga && (
          <div className="rounded-card border border-border p-[var(--pad-card)]">
            <SkeletonLinhas linhas={5} />
          </div>
        )
      ) : (
        <DataTable
          columns={cols}
          rows={apis}
          getKey={(a) => a.id}
          density="compact"
          onRowClick={setAberta}
          activeKey={aberta?.id}
          minWidth={720}
          exportar={false}
          resumo={(l) => `${l.length} API${l.length === 1 ? "" : "s"}`}
        />
      )}
      {aberta && (
        <EditorApi
          api={aberta}
          onFechar={() => setAberta(null)}
          onSalva={(a) => {
            setApis((l) => (l ? l.map((x) => (x.id === a.id ? a : x)) : l));
            setAberta(null);
          }}
        />
      )}
    </div>
  );
}

function EditorApi({ api, onFechar, onSalva }: { api: ApiCenti; onFechar: () => void; onSalva: (a: ApiCenti) => void }) {
  const [v, setV] = useState<EdicaoApi>(() => paraEdicao(api));
  const [salvando, setSalvando] = useState(false);
  const muda = <K extends keyof EdicaoApi>(k: K, valor: EdicaoApi[K]) => setV((x) => ({ ...x, [k]: valor }));

  const motivo = motivoApiInvalida(v, api.implementada);
  const alterado = JSON.stringify(v) !== JSON.stringify(paraEdicao(api));
  const previa = useMemo(() => previaPedido(v, ANO_ATUAL), [v]);
  const rotuloLista = v.divisao === "fonte" ? "Fontes" : "Órgãos (idOrgao do portal)";

  async function salvar() {
    if (motivo) {
      toast.error(motivo);
      return;
    }
    setSalvando(true);
    try {
      const r = await fetch(`/api/admin/centi-apis/${api.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; api?: ApiCenti };
      if (!r.ok || !j.ok || !j.api) throw new Error(j.error ?? "Erro ao salvar a API.");
      toast.success(`API "${j.api.nome}" salva.`);
      onSalva(j.api);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar a API.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open
      onClose={onFechar}
      titulo={`API da Centi — ${api.nome}`}
      size="xl"
      bloqueado={salvando}
      rodape={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {motivo && alterado && <span className="mr-auto text-[12.5px] text-[color:var(--danger)]">{motivo}</span>}
          <Button size="sm" variant="secondary" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button size="sm" onClick={salvar} loading={salvando} disabled={!alterado || !!motivo}>
            Salvar
          </Button>
        </div>
      }
    >
      <div className="space-y-[var(--gap-block)]">
        {!api.implementada && (
          <Callout kind="info">
            Em preparação: a importação desta API ainda não existe. O cadastro pode ser ajustado, mas ela só poderá ser
            ligada quando a importação chegar.
          </Callout>
        )}

        <section className="space-y-3">
          <h3 className="text-[13px] font-semibold text-text-2">Identificação</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField label="Nome" value={v.nome} onChange={(e) => muda("nome", e.target.value)} maxLength={60} />
            <TextField label="Chave" value={api.chave} readOnly disabled hint="Fixa — identifica a API no sistema." />
          </div>
          <TextArea label="Descrição" rows={2} value={v.descricao} onChange={(e) => muda("descricao", e.target.value)} maxLength={400} />
        </section>

        <section className="space-y-3">
          <h3 className="text-[13px] font-semibold text-text-2">Endereço</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1.4fr_0.6fr_1fr]">
            <TextField label="URL base" value={v.urlBase} onChange={(e) => muda("urlBase", e.target.value)} autoComplete="off" />
            <TextField label="Endpoint" value={v.endpoint} onChange={(e) => muda("endpoint", e.target.value)} autoComplete="off" />
            <TextField label="UF" value={v.uf} onChange={(e) => muda("uf", e.target.value)} maxLength={4} autoComplete="off" />
            <TextField label="Município" value={v.tenant} onChange={(e) => muda("tenant", e.target.value)} autoComplete="off" />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-[13px] font-semibold text-text-2">Leitura</h3>
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
            <SelectField label="Como o ano é pedido" value={v.divisao} onChange={(e) => muda("divisao", e.target.value as DivisaoApi)}>
              {DIVISOES.map((d) => (
                <option key={d.valor} value={d.valor}>
                  {d.rotulo}
                </option>
              ))}
            </SelectField>
            <Switch checked={v.paginado} onChange={(x) => muda("paginado", x)} label="A API devolve páginas ({pagina})" />
          </div>
          <TextArea
            label="Parâmetros do pedido (JSON)"
            rows={3}
            value={v.parametros}
            onChange={(e) => muda("parametros", e.target.value)}
            hint="Marcadores: {ano}, {orgao}, {fonte} e {pagina}. A página é acrescentada sozinha nas APIs paginadas."
          />
          {v.divisao !== "ano" && (
            <CampoLista
              label={`${rotuloLista} — ${v.lista.length}`}
              valores={v.lista.map(String)}
              onChange={(l) => muda("lista", [...new Set(l.map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0))])}
              placeholder="Digite o número e Enter (vários separados por ;)"
            />
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-[13px] font-semibold text-text-2">Atualização automática</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <SelectField label="Frequência" value={String(v.frequenciaMin)} onChange={(e) => muda("frequenciaMin", Number(e.target.value))}>
              {FREQUENCIAS.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.rotulo}
                </option>
              ))}
            </SelectField>
            <TextField label="Das" type="time" value={v.horaInicio} onChange={(e) => muda("horaInicio", e.target.value)} />
            <TextField label="Até" type="time" value={v.horaFim} onChange={(e) => muda("horaFim", e.target.value)} />
            <SelectField label="Anos mantidos" value={String(v.anos)} onChange={(e) => muda("anos", Number(e.target.value))}>
              {OPCOES_ANOS.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Switch checked={v.diasUteis} onChange={(x) => muda("diasUteis", x)} label="Só em dias úteis" />
            <Switch
              checked={v.ativa}
              onChange={(x) => muda("ativa", x)}
              disabled={!api.implementada}
              label="Ligada"
              dica={api.implementada ? "Liga a atualização automática desta API." : "Disponível quando a importação desta API existir."}
            />
          </div>
        </section>

        <section className="space-y-2 rounded-card border border-border bg-surface-2 p-[var(--pad-card)]">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold text-text-2">
            <IconCode className="h-4 w-4 text-accent" />
            Prévia do 1º pedido de {ANO_ATUAL}
            <span className="font-normal text-faint">
              · {pedidosPorAno(v)} pedido{pedidosPorAno(v) === 1 ? "" : "s"} por ano{v.paginado ? " (mais as páginas)" : ""} — nada é enviado
            </span>
          </h3>
          <p className="break-all font-mono text-[12px] text-text">POST {previa.url}</p>
          {previa.erro ? (
            <p className="text-[12.5px] text-[color:var(--danger)]">{previa.erro}</p>
          ) : (
            <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[12px] text-muted">{JSON.stringify(previa.corpo, null, 2)}</pre>
          )}
        </section>
      </div>
    </Modal>
  );
}
