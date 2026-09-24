"use client";

import { type ReactNode, useState } from "react";
import type { ComparacaoDfd, DiffCampo, DiffItemDfd } from "@/lib/comparar-protocolo";
import { brl, num } from "@/lib/format";
import type { BlocoEscolha, EstadoEscolha, Lado } from "@/lib/sobrescrita-dfd";
import { Badge, type Tone } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { IconAlert, IconArrowRight, IconCheck, IconClipboard, IconSpinner } from "./icons";
import { Segmented } from "./Segmented";
import { StatMini } from "./StatMini";

/**
 * COMPARAÇÃO gravado × novo (reenvio do protocolo e SOBRESCRITA de um DFD) — componentes do design-system:
 * `DiffLinha` (um campo: gravado → novo), `DiffItem` (um item novo/removido/alterado), `BlocoDiff` (bloco
 * com título e contagem) — os três reusados pelo `Historico` —, `ComparacaoDfdView` (as diferenças de UM
 * DFD: cabeçalho, seções, assinaturas e itens — com a ESCOLHA por dado na sobrescrita: manter o gravado ×
 * usar o novo) e `ComparacaoProtocolo` (o bloco do topo do reenvio: contagens, diferenças da capa,
 * gravados que não vieram no PDF com Excluir/Manter e o relatório).
 */

const tinta = (cor: string) => ({ background: `color-mix(in srgb, ${cor} 9%, var(--surface))`, borderColor: `color-mix(in srgb, ${cor} 28%, var(--border))` });

/** Texto curto (cabe numa linha "antes → depois"). */
const curto = (t: string) => t.length <= 90 && !t.includes("\n");
/** Texto longo (seção) — recolhido a 4 linhas no modo compacto. */
const longo = (t: string) => t.length > 280 || (t.match(/\n/g)?.length ?? 0) > 3;

/**
 * Uma diferença de campo: o valor ANTERIOR e o NOVO lado a lado (empilhados no celular). `rotulos` nomeia
 * os dois lados (reenvio: Gravado × Novo; histórico: Antes × Depois). `compacto` (histórico): valores
 * curtos numa linha só ("MÉDIA → ALTA") e textos longos recolhidos com "Ver texto inteiro" — com `acao`
 * (a escolha da sobrescrita), sempre o cartão com os dois lados.
 */
export function DiffLinha({
  d,
  rotulos = ["Gravado", "Novo"],
  compacto = false,
  acao,
  escolhido,
}: {
  d: DiffCampo;
  rotulos?: readonly [string, string];
  compacto?: boolean;
  /** (sobrescrita) controle da ESCOLHA ao lado do rótulo. */
  acao?: ReactNode;
  /** (sobrescrita) o lado que VALE — o outro fica esmaecido; "editado" esmaece os dois. */
  escolhido?: EstadoEscolha | null;
}) {
  const [inteiro, setInteiro] = useState(false);
  const apaga = (lado: Lado) => (escolhido && escolhido !== lado ? " opacity-45" : "");
  const destaque = (lado: Lado) => (escolhido === lado ? " ring-2 ring-accent/50" : "");
  // Uma linha só ("antes → depois") quando é só leitura — com a ESCOLHA, o cartão mostra os dois lados + o seletor.
  if (compacto && !acao && curto(d.antes) && curto(d.depois)) {
    return (
      <div className="grid gap-x-3 gap-y-0.5 text-[12.5px] sm:grid-cols-[minmax(6rem,10rem)_1fr]">
        <span className="font-semibold text-muted">{d.rotulo}</span>
        <span className="min-w-0 break-words">
          <span className={d.antes === "—" ? "text-faint" : "text-faint line-through"}>{d.antes}</span>
          <IconArrowRight className="mx-1 inline h-3.5 w-3.5 align-[-2px] text-muted" aria-label="para" />
          <span className="font-medium text-text">{d.depois}</span>
        </span>
      </div>
    );
  }
  const recolhe = compacto && (longo(d.antes) || longo(d.depois));
  const clamp = recolhe && !inteiro ? " line-clamp-4" : "";
  return (
    <div className="rounded-control border border-border p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">{d.rotulo}</p>
        {acao}
      </div>
      <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
        <div className={`rounded-[8px] border px-2 py-1.5 transition-opacity${apaga("gravado")}${destaque("gravado")}`} style={tinta("var(--danger)")}>
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--danger)" }}>
            {rotulos[0]}
          </p>
          <p className={`whitespace-pre-wrap break-words text-[12.5px] text-text-2${clamp}`}>{d.antes}</p>
        </div>
        <div className={`rounded-[8px] border px-2 py-1.5 transition-opacity${apaga("novo")}${destaque("novo")}`} style={tinta("var(--ok)")}>
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--ok)" }}>
            {rotulos[1]}
          </p>
          <p className={`whitespace-pre-wrap break-words text-[12.5px] text-text${clamp}`}>{d.depois}</p>
        </div>
      </div>
      {recolhe && (
        <button
          type="button"
          className="mt-1 min-h-[44px] text-[12px] font-medium text-accent hover:underline"
          onClick={() => setInteiro((v) => !v)}
        >
          {inteiro ? "Recolher" : "Ver texto inteiro"}
        </button>
      )}
    </div>
  );
}

const TOM_ITEM: Record<DiffItemDfd["tipo"], Tone> = { novo: "emerald", removido: "red", alterado: "amber" };
const ROTULO_ITEM: Record<DiffItemDfd["tipo"], string> = { novo: "Novo", removido: "Removido", alterado: "Alterado" };
/** (sobrescrita) O EFEITO da escolha num item que só um dos lados tem. */
const EFEITO_ITEM: Record<"novo" | "removido", Record<EstadoEscolha, string>> = {
  novo: { novo: "Entra ao sobrescrever (só o arquivo novo tem).", gravado: "Fica fora (o gravado não tem).", editado: "Entra, editado." },
  removido: { novo: "Sai ao sobrescrever (o arquivo novo não traz).", gravado: "Continua (mantido do gravado).", editado: "Continua, editado." },
};

/** Bloco de diferenças com título e contagem (Cabeçalho/Seções/Assinaturas/Itens) — reenvio e histórico.
 * `acoes` (sobrescrita): "todos novos / todos gravados" do bloco, ao lado do título. */
export function BlocoDiff({ titulo, qtd, acoes, children }: { titulo: string; qtd: number; acoes?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[12px] font-bold uppercase tracking-wide text-muted">
          {titulo} <span className="text-faint">({num(qtd)})</span>
        </h4>
        {acoes}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

/** A diferença de UM item do DFD (novo / removido / alterado campo a campo) — reenvio e histórico. `acao`/
 * `escolhido` = a ESCOLHA da sobrescrita (manter o gravado × usar o novo); `rotulosTipo` renomeia o selo (ex.: nos
 * DFDs duplicados: "Só no outro" / "Só neste"). */
export function DiffItem({
  it,
  rotulos,
  compacto = false,
  acao,
  escolhido,
  rotulosTipo,
}: {
  it: DiffItemDfd;
  rotulos?: readonly [string, string];
  compacto?: boolean;
  acao?: ReactNode;
  escolhido?: EstadoEscolha | null;
  rotulosTipo?: Partial<Record<DiffItemDfd["tipo"], string>>;
}) {
  return (
    <div className="rounded-control border border-border p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={TOM_ITEM[it.tipo]}>{rotulosTipo?.[it.tipo] ?? ROTULO_ITEM[it.tipo]}</Badge>
        <span className="text-[12.5px] font-semibold text-text">Item {it.item ?? "—"}</span>
        {it.codigo && <span className="font-mono text-[12px] text-muted">{it.codigo}</span>}
        {acao && <span className="ml-auto">{acao}</span>}
      </div>
      {it.descricao && <p className="mt-1 line-clamp-2 text-[12px] text-text-2">{it.descricao}</p>}
      {escolhido && it.tipo !== "alterado" && <p className="mt-1 text-[12px] font-medium text-muted">{EFEITO_ITEM[it.tipo][escolhido]}</p>}
      {it.campos.length > 0 && (
        <div className={`mt-2 ${compacto ? "space-y-1" : "space-y-1.5"}`}>
          {it.campos.map((d) => (
            <DiffLinha key={d.campo} d={d} rotulos={rotulos} compacto={compacto} escolhido={escolhido} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * ESCOLHA POR DADO da SOBRESCRITA (o DFD novo × o gravado de mesmo número): em cada diferença, manter o
 * GRAVADO ou usar o NOVO. O estado vem do DFD de trabalho (`estado` pela chave da diferença — `null` = não
 * escolhível, ex.: o valor total que segue os itens); `outras` = o que muda por edição à mão/unidade.
 */
export type EscolhaSobrescritaProps = {
  estado: (chave: string) => EstadoEscolha | null;
  onEscolher: (chave: string, lado: Lado) => void;
  onTodos: (lado: Lado, bloco?: BlocoEscolha) => void;
  bloqueado?: boolean;
  outras?: { campos: DiffCampo[]; itens: DiffItemDfd[] } | null;
};

/** Seletor da escolha de UM dado: Manter gravado | Usar novo (+ "Editado" quando mudado à mão). */
function SeletorLado({
  estado,
  onEscolher,
  bloqueado,
  rotulo,
}: {
  estado: EstadoEscolha;
  onEscolher: (l: Lado) => void;
  bloqueado?: boolean;
  /** O dado escolhido (nome acessível do seletor). */
  rotulo: string;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {estado === "editado" && <Badge tone="amber">Editado</Badge>}
      <Segmented<EstadoEscolha>
        value={estado}
        ariaLabel={`Escolha: ${rotulo}`}
        disabled={bloqueado}
        onChange={(v) => v !== "editado" && onEscolher(v)}
        options={[
          { value: "gravado", label: "Manter gravado" },
          { value: "novo", label: "Usar novo" },
        ]}
      />
    </span>
  );
}

/** "Todos novos / todos gravados" de um bloco (ou de tudo). */
function AcoesTodos({ onTodos, bloco, bloqueado }: { onTodos: EscolhaSobrescritaProps["onTodos"]; bloco?: BlocoEscolha; bloqueado?: boolean }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Button variant="ghost" onClick={() => onTodos("gravado", bloco)} disabled={bloqueado}>
        {bloco ? "Manter gravados" : "Manter todos os gravados"}
      </Button>
      <Button variant="ghost" onClick={() => onTodos("novo", bloco)} disabled={bloqueado}>
        {bloco ? "Usar novos" : "Usar todos os novos"}
      </Button>
    </span>
  );
}

/** As DIFERENÇAS de UM DFD em relação ao gravado (painel da direita "Diferenças" — reenvio e sobrescrita)
 * + o que foi HERDADO do gravado (o PDF não trazia — transparência). Com `escolha`, cada diferença traz o
 * seletor Manter gravado | Usar novo. */
export function ComparacaoDfdView({
  comparacao,
  herdados = [],
  escolha = null,
}: {
  comparacao: ComparacaoDfd | null;
  herdados?: string[];
  escolha?: EscolhaSobrescritaProps | null;
}) {
  const nota =
    herdados.length > 0 ? (
      <Callout kind="info" icon={<IconCheck className="h-5 w-5" />} className="mb-4">
        Herdado do gravado (o arquivo não trazia): {herdados.join(", ")}.
      </Callout>
    ) : null;
  return (
    <>
      {nota}
      <Diferencas comparacao={comparacao} escolha={escolha} />
    </>
  );
}

function Diferencas({ comparacao, escolha }: { comparacao: ComparacaoDfd | null; escolha: EscolhaSobrescritaProps | null }) {
  if (!comparacao)
    return (
      <Callout kind="info" icon={<IconSpinner className="h-5 w-5" />}>
        Lendo o DFD para comparar…
      </Callout>
    );
  if (comparacao.situacao === "novo")
    return (
      <Callout kind="info" icon={<IconAlert className="h-5 w-5" />}>
        DFD NOVO — não existe no protocolo gravado; será incluído ao sobrescrever.
      </Callout>
    );
  const outras = escolha?.outras;
  const temOutras = !!outras && (outras.campos.length > 0 || outras.itens.length > 0);
  if (comparacao.situacao === "igual" && !temOutras)
    return (
      <Callout kind="ok" icon={<IconCheck className="h-5 w-5" />}>
        Sem diferenças em relação ao gravado — ao sobrescrever, fica como está.
      </Callout>
    );
  const c = comparacao;
  // Com ESCOLHA: o seletor de cada diferença + "todos" por bloco; sem ela, a leitura (vale o novo).
  const lado = (chave: string | undefined) => (escolha && chave ? escolha.estado(chave) : null);
  const acao = (chave: string | undefined, rotulo: string) => {
    const e = lado(chave);
    return escolha && chave && e ? (
      <SeletorLado estado={e} onEscolher={(l) => escolha.onEscolher(chave, l)} bloqueado={escolha.bloqueado} rotulo={rotulo} />
    ) : undefined;
  };
  const todos = (bloco: BlocoEscolha) => (escolha ? <AcoesTodos onTodos={escolha.onTodos} bloco={bloco} bloqueado={escolha.bloqueado} /> : undefined);
  return (
    <div className="space-y-[var(--gap-block)]">
      {escolha ? (
        <div className="space-y-2">
          <p className="text-[12.5px] text-muted">
            {num(c.total)} diferença(s) entre o DFD gravado e o NOVO. Em cada uma, escolha o que vale ao sobrescrever:{" "}
            <strong className="text-text">Manter gravado</strong> ou <strong className="text-text">Usar novo</strong>. O DFD ao lado já
            mostra o resultado (e pode ser editado).
          </p>
          {c.total > 0 && <AcoesTodos onTodos={escolha.onTodos} bloqueado={escolha.bloqueado} />}
        </div>
      ) : (
        <p className="text-[12.5px] text-muted">
          {num(c.total)} diferença(s) em relação ao DFD gravado. Ao sobrescrever, vale o <strong className="text-text">Novo</strong>{" "}
          (com as suas edições).
        </p>
      )}
      {c.campos.length > 0 && (
        <BlocoDiff titulo="Cabeçalho" qtd={c.campos.length} acoes={c.campos.some((d) => lado(d.campo)) ? todos("cabecalho") : undefined}>
          {c.campos.map((d) => (
            <DiffLinha key={d.campo} d={d} acao={acao(d.campo, d.rotulo)} escolhido={lado(d.campo)} />
          ))}
        </BlocoDiff>
      )}
      {c.secoes.length > 0 && (
        <BlocoDiff titulo="Seções" qtd={c.secoes.length} acoes={todos("secoes")}>
          {c.secoes.map((d) => (
            <DiffLinha key={d.campo} d={d} compacto={!!escolha} acao={acao(d.campo, d.rotulo)} escolhido={lado(d.campo)} />
          ))}
        </BlocoDiff>
      )}
      {c.assinaturas && (
        <BlocoDiff titulo="Assinaturas" qtd={1}>
          <DiffLinha d={c.assinaturas} acao={acao("assinaturas", "Assinaturas")} escolhido={lado("assinaturas")} />
        </BlocoDiff>
      )}
      {c.itens.length > 0 && (
        <BlocoDiff titulo="Itens" qtd={c.itens.length} acoes={todos("itens")}>
          {c.itens.map((it, k) => (
            <DiffItem
              key={it.chave ?? `${it.tipo}:${it.item}:${it.codigo}:${k}`}
              it={it}
              acao={acao(it.chave, `Item ${it.item ?? "—"}${it.codigo ? ` (${it.codigo})` : ""}`)}
              escolhido={lado(it.chave)}
            />
          ))}
        </BlocoDiff>
      )}
      {temOutras && outras && (
        <BlocoDiff titulo="Outras alterações (unidade, total e edições)" qtd={outras.campos.length + outras.itens.length}>
          {outras.campos.map((d) => (
            <DiffLinha key={`o:${d.campo}`} d={d} compacto />
          ))}
          {outras.itens.map((it, k) => (
            <DiffItem key={`o:${it.chave ?? k}`} it={it} compacto />
          ))}
        </BlocoDiff>
      )}
    </div>
  );
}

/** DFD gravado que NÃO veio no PDF — o usuário decide: excluir (padrão da sobrescrita) ou manter. */
export type RemovidoReenvio = { id: number; numero: string; planejamento: string | null; valorTotal: number | null; excluir: boolean };

/**
 * Bloco do TOPO do banner no REENVIO: contagens (novos / alterados / sem diferença / fora do PDF), as
 * diferenças da CAPA, os DFDs gravados que não vieram no PDF (Excluir/Manter, um a um ou todos) e o
 * "Relatório de diferenças" (copiável).
 */
export function ComparacaoProtocolo({
  contagem,
  capa,
  removidos,
  onRemovidoChange,
  onTodosRemovidos,
  onRelatorio,
  bloqueado = false,
}: {
  contagem: { novos: number; alterados: number; iguais: number; analisando: number };
  capa: DiffCampo[];
  removidos: RemovidoReenvio[];
  onRemovidoChange: (id: number, excluir: boolean) => void;
  onTodosRemovidos: (excluir: boolean) => void;
  onRelatorio: () => void;
  bloqueado?: boolean;
}) {
  const excluir = removidos.filter((r) => r.excluir).length;
  return (
    <section className="rounded-card border p-4" style={tinta("var(--info)")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-text">
          <IconClipboard className="h-4 w-4" style={{ color: "var(--info)" }} /> Reenvio — comparação com o protocolo gravado
        </h3>
        <Button variant="secondary" onClick={onRelatorio}>
          Relatório de diferenças
        </Button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatMini label="Novos" value={num(contagem.novos)} />
        <StatMini label="Alterados" value={num(contagem.alterados)} tone={contagem.alterados > 0 ? "warn" : "default"} />
        <StatMini label="Sem diferença" value={num(contagem.iguais)} hint={contagem.analisando > 0 ? `${num(contagem.analisando)} em análise` : undefined} />
        <StatMini label="Fora do PDF" value={num(removidos.length)} tone={excluir > 0 ? "danger" : "default"} />
      </div>
      <p className="mt-3 text-[12px] text-muted">
        Só é regravado o que mudou (os DFDs "sem diferença" ficam como estão). Abra um DFD e use "Diferenças" para ver campo a campo;
        edite o que precisar antes de sobrescrever.
      </p>

      <div className="mt-3">
        <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted">Capa</h4>
        {capa.length === 0 ? (
          <p className="text-[12.5px] text-muted">Sem diferenças na capa.</p>
        ) : (
          <div className="space-y-2">
            {capa.map((d) => (
              <DiffLinha key={d.campo} d={d} />
            ))}
          </div>
        )}
      </div>

      {removidos.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[12px] font-bold uppercase tracking-wide text-muted">DFDs gravados que não vieram no PDF ({num(removidos.length)})</h4>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onTodosRemovidos(true)} disabled={bloqueado}>
                Excluir todos
              </Button>
              <Button variant="ghost" onClick={() => onTodosRemovidos(false)} disabled={bloqueado}>
                Manter todos
              </Button>
            </div>
          </div>
          <ul className="space-y-2">
            {removidos.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 py-2">
                <span className="text-[13px] text-text">
                  <span className="font-mono font-semibold">DFD {r.numero}</span>
                  {r.planejamento ? <span className="text-muted"> · Planej. {r.planejamento}</span> : null}
                  <span className="text-muted"> · {brl(r.valorTotal ?? 0)}</span>
                </span>
                <Segmented<"excluir" | "manter">
                  value={r.excluir ? "excluir" : "manter"}
                  disabled={bloqueado}
                  options={[
                    { value: "excluir", label: "Excluir" },
                    { value: "manter", label: "Manter" },
                  ]}
                  onChange={(v) => onRemovidoChange(r.id, v === "excluir")}
                />
              </li>
            ))}
          </ul>
          {excluir > 0 && (
            <p className="mt-2 text-[12px]" style={{ color: "var(--danger)" }}>
              {num(excluir)} DFD(s) gravado(s) serão EXCLUÍDOS ao sobrescrever (com os itens).
            </p>
          )}
        </div>
      )}
    </section>
  );
}
