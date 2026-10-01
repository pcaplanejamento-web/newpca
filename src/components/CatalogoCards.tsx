"use client";

import { type FormEvent, useState } from "react";
import type { CatalogoResumo } from "@/lib/catalogo";
import type { PastaCatalogo } from "@/lib/catalogo-historico";
import { hexToHsv, hsvToHex } from "@/lib/color";
import { brlCompact, dataBR, num } from "@/lib/format";
import { corDoCatalogo, ROTULO_TIPO_CATALOGO } from "@/lib/historico-compra-core";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { PALETA_ETIQUETAS } from "@/lib/tarefas-core";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { useConfirmacao } from "./Confirmacao";
import { Dropdown } from "./Dropdown";
import { Checkbox, SearchField, TextField } from "./Field";
import { IconCompra, IconDownload, IconLayers, IconMais, IconPencil, IconTrash, IconUpload } from "./icons";
import { Modal } from "./Modal";
import { ChipPasta, PastaCartao } from "./PastasQuadros";
import { CapaQuadro, CartaoEspaco } from "./QuadroCard";

/**
 * Os CARDS do Catálogo — o MESMO desenho dos quadros de Tarefas (`CartaoEspaco`) e das pastas (`PastaCartao`):
 * `CatalogoCard` (a capa no degradê da cor + o ícone do TIPO, o nome e 3 números), `PastaCatalogoCard` (a pasta, com as
 * capas dos catálogos dela; tocar ENTRA na tela da pasta), o menu "…" de cada um e o `EditorPastaCatalogo`.
 */

/** O degradê da capa: a cor → a mesma cor mais escura (JSON do `lerGradiente`). */
function gradienteDe(cor: string): string {
  const hsv = hexToHsv(cor);
  const escura = hsv ? hsvToHex(hsv[0], Math.min(100, hsv[1] * 1.1), hsv[2] * 0.62) : cor;
  return JSON.stringify({ cores: [cor, escura], angulo: 135 });
}

/** A CAPA 16:9 de um catálogo: o degradê da cor + o ícone do tipo; `detalhe` = o selo da data (fora das folhas da pasta). */
export function CapaCatalogo({ catalogo: c, detalhe = true }: { catalogo: Pick<CatalogoResumo, "tipo" | "cor" | "atualizadoEm">; detalhe?: boolean }) {
  const cor = corDoCatalogo(c.cor, c.tipo);
  const Icone = c.tipo === "historico" ? IconCompra : IconLayers;
  return (
    <CapaQuadro quadro={{ cor, fundoUrl: null, fundoAjuste: null, fundoGradiente: gradienteDe(cor) }}>
      <span aria-hidden className="absolute inset-0 grid place-items-center text-white/85">
        <Icone className={detalhe ? "h-10 w-10" : "h-6 w-6"} />
      </span>
      {detalhe && c.atualizadoEm && (
        <span className="absolute bottom-1.5 left-1.5 inline-flex items-center rounded-full bg-[var(--scrim)] px-2 py-0.5 text-[11px] font-semibold text-white">
          Atualizado em {dataBR(c.atualizadoEm)}
        </span>
      )}
    </CapaQuadro>
  );
}

/** Os números de um catálogo na agenda (contados no cliente — os itens compartilhados entram em cada catálogo). */
export type NumerosAgenda = { itens: number; semTipo: number; unidades: number };

const itemMenu = "flex min-h-11 w-full items-center gap-2 rounded-control px-2 text-left text-[13px] text-text hover:bg-surface-2 lg:min-h-9";

/** O menu "…" de um card (as ações que o papel permite; sem nenhuma, não aparece). */
function MenuCard({ nome, acoes }: { nome: string; acoes: { rotulo: string; icone: React.ReactNode; perigo?: boolean; onClick: () => void }[] }) {
  if (acoes.length === 0) return null;
  return (
    <Dropdown
      align="end"
      width={220}
      ariaLabel={`Ações de ${nome}`}
      triggerClassName="h-11 w-11 shrink-0 justify-center rounded-control text-muted hover:bg-surface-2 lg:h-9 lg:w-9"
      trigger={<IconMais className="h-4 w-4" />}
    >
      {(fechar) => (
        <div className="space-y-0.5">
          {acoes.map((a) => (
            <button
              key={a.rotulo}
              type="button"
              onClick={() => {
                fechar();
                a.onClick();
              }}
              className={itemMenu}
              style={a.perigo ? { color: "var(--danger)" } : undefined}
            >
              {a.icone} {a.rotulo}
            </button>
          ))}
        </div>
      )}
    </Dropdown>
  );
}

/**
 * O card de UM catálogo. Agenda: Itens · Sem tipo (âmbar quando há) · Unid. medida; Histórico: Itens · Contratos · Valor
 * contratado. Tocar ABRE o catálogo; o "…" tem Editar · Atualizar (agenda) · Exportar · Excluir, conforme o papel.
 */
export function CatalogoCard({
  catalogo: c,
  agenda,
  onAbrir,
  onEditar,
  onAtualizar,
  onExportar,
  onExcluir,
}: {
  catalogo: CatalogoResumo;
  agenda?: NumerosAgenda;
  onAbrir: () => void;
  onEditar?: () => void;
  onAtualizar?: () => void;
  onExportar?: () => void;
  onExcluir?: () => void;
}) {
  const hist = c.tipo === "historico";
  const metricas = hist
    ? [
        { rotulo: "Itens", valor: num(c.totalItens) },
        { rotulo: "Contratos", valor: num(c.contratos) },
        // Sem o "R$" no número (cabe no terço do card): "185,6 mi".
        { rotulo: "Valor (R$)", valor: brlCompact(c.valor).replace(/^R\$\s?/, "") },
      ]
    : [
        { rotulo: "Itens", valor: num(agenda?.itens ?? c.totalItens) },
        { rotulo: "Sem tipo", valor: num(agenda?.semTipo ?? 0), cor: agenda?.semTipo ? "var(--warn)" : "var(--text-2)" },
        { rotulo: "Unid. medida", valor: num(agenda?.unidades ?? 0), cor: "var(--text-2)" },
      ];
  const acoes = [
    onEditar && { rotulo: "Editar", icone: <IconPencil className="h-4 w-4 text-muted" />, onClick: onEditar },
    onAtualizar && { rotulo: "Atualizar (reenviar arquivo)", icone: <IconUpload className="h-4 w-4 text-muted" />, onClick: onAtualizar },
    onExportar && { rotulo: "Exportar .xlsx", icone: <IconDownload className="h-4 w-4 text-muted" />, onClick: onExportar },
    onExcluir && { rotulo: "Excluir", icone: <IconTrash className="h-4 w-4" />, perigo: true, onClick: onExcluir },
  ].filter((a): a is NonNullable<typeof a> => !!a);
  return (
    <CartaoEspaco
      onClick={onAbrir}
      ariaLabel={`Abrir o ${ROTULO_TIPO_CATALOGO[c.tipo].toLowerCase()} ${c.nome}`}
      capa={<CapaCatalogo catalogo={c} />}
      sobretitulo={ROTULO_TIPO_CATALOGO[c.tipo]}
      selo={
        !hist && c.tiposPadrao.length > 0 ? (
          <span className="flex shrink-0 gap-1">
            {c.tiposPadrao.map((t) => (
              <Badge key={t} tone="blue">
                {t}
              </Badge>
            ))}
          </span>
        ) : undefined
      }
      nome={c.nome}
      metricas={metricas}
      canto={
        acoes.length > 0 && (
          <div className="absolute top-3 right-3 rounded-control bg-surface/90 shadow-ring backdrop-blur-sm lg:top-3.5 lg:right-3.5">
            <MenuCard nome={c.nome} acoes={acoes} />
          </div>
        )
      }
    />
  );
}

/** O card de uma PASTA de catálogos — tocar ENTRA na tela da pasta (`/painel/catalogo/pasta/[id]`). */
export function PastaCatalogoCard({
  pasta,
  catalogos,
  itensAgenda,
  onEditar,
  onExcluir,
}: {
  pasta: PastaCatalogo;
  catalogos: CatalogoResumo[];
  /** Os itens da agenda nos catálogos dela (contados no cliente). */
  itensAgenda: number;
  onEditar?: () => void;
  onExcluir?: () => void;
}) {
  const { confirmar, confirmacao } = useConfirmacao();
  const valor = catalogos.reduce((s, c) => s + (c.tipo === "historico" ? c.valor : 0), 0);
  const acoes = [
    onEditar && { rotulo: "Editar pasta", icone: <IconPencil className="h-4 w-4 text-muted" />, onClick: onEditar },
    onExcluir && {
      rotulo: "Excluir pasta",
      icone: <IconTrash className="h-4 w-4" />,
      perigo: true,
      onClick: async () => {
        if (await confirmar({ titulo: `Excluir a pasta "${pasta.nome}"?`, texto: "Só a pasta sai — os catálogos dela voltam para a grade, como estão.", confirmar: "Excluir", perigo: true }))
          onExcluir();
      },
    },
  ].filter((a): a is NonNullable<typeof a> => !!a);
  const n = catalogos.length;
  return (
    <>
      <PastaCartao
        href={`/painel/catalogo/pasta/${pasta.id}`}
        nome={pasta.nome}
        cor={pasta.cor}
        rotulo={`Pasta · ${num(n)} ${n === 1 ? "catálogo" : "catálogos"}`}
        folhas={catalogos.slice(0, 3).map((c) => (
          <CapaCatalogo key={c.id} catalogo={c} detalhe={false} />
        ))}
        chips={
          <>
            <ChipPasta>{num(itensAgenda)} itens na agenda</ChipPasta>
            {valor > 0 && <ChipPasta>{brlCompact(valor)} comprados</ChipPasta>}
          </>
        }
        ariaLabel={`Abrir a pasta ${pasta.nome} (${n} ${n === 1 ? "catálogo" : "catálogos"})`}
        menu={acoes.length > 0 ? <MenuCard nome={`a pasta ${pasta.nome}`} acoes={acoes} /> : undefined}
      />
      {confirmacao}
    </>
  );
}

/** As cores em círculos (os tons da paleta — a mesma das pastas de Tarefas). */
export function CoresPaleta({ valor, onChange, legenda = "Cor" }: { valor: string | null; onChange: (cor: string) => void; legenda?: string }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13.5px] font-bold text-text">{legenda}</legend>
      <div className="flex flex-wrap gap-2">
        {PALETA_ETIQUETAS.slice(10, 20).map((cor) => (
          <button
            key={cor}
            type="button"
            aria-label={`Cor ${cor}`}
            aria-pressed={valor?.toLowerCase() === cor.toLowerCase()}
            onClick={() => onChange(cor)}
            className="h-11 w-11 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:h-8 lg:w-8"
            style={{ background: cor, boxShadow: valor?.toLowerCase() === cor.toLowerCase() ? "0 0 0 2px var(--surface), 0 0 0 4px var(--text)" : undefined }}
          />
        ))}
      </div>
    </fieldset>
  );
}

export type DadosPasta = { nome: string; cor: string; catalogos: number[] };

/**
 * O EDITOR de uma PASTA de catálogos (criar/editar): nome, cor e os CATÁLOGOS dela (busca + caixas; o que está em OUTRA
 * pasta avisa que sai de lá). Gravar devolve os dados; quem chama grava e mostra o erro (`erro`).
 */
export function EditorPastaCatalogo({
  aberto,
  inicial,
  catalogos,
  pastas,
  salvando,
  erro,
  onFechar,
  onSalvar,
}: {
  aberto: boolean;
  /** A pasta em edição (null = nova). */
  inicial: (PastaCatalogo & { catalogos: number[] }) | null;
  catalogos: CatalogoResumo[];
  pastas: PastaCatalogo[];
  salvando: boolean;
  erro: string | null;
  onFechar: () => void;
  onSalvar: (d: DadosPasta) => void;
}) {
  return (
    <Modal open={aberto} onClose={() => !salvando && onFechar()} bloqueado={salvando} titulo={inicial ? "Editar pasta" : "Nova pasta"} size="md">
      {aberto && (
        <FormPasta key={inicial?.id ?? "nova"} inicial={inicial} catalogos={catalogos} pastas={pastas} salvando={salvando} erro={erro} onFechar={onFechar} onSalvar={onSalvar} />
      )}
    </Modal>
  );
}

function FormPasta({
  inicial,
  catalogos,
  pastas,
  salvando,
  erro,
  onFechar,
  onSalvar,
}: {
  inicial: (PastaCatalogo & { catalogos: number[] }) | null;
  catalogos: CatalogoResumo[];
  pastas: PastaCatalogo[];
  salvando: boolean;
  erro: string | null;
  onFechar: () => void;
  onSalvar: (d: DadosPasta) => void;
}) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [cor, setCor] = useState(inicial?.cor ?? PALETA_ETIQUETAS[15]);
  const [sel, setSel] = useState<number[]>(inicial?.catalogos ?? []);
  const [busca, setBusca] = useState("");
  const nomePasta = new Map(pastas.map((p) => [p.id, p.nome] as const));
  const casa = predicadoBusca(busca);
  const visiveis = casa ? catalogos.filter((c) => casa([c.nome, ROTULO_TIPO_CATALOGO[c.tipo]])) : catalogos;
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (nome.trim()) onSalvar({ nome: nome.trim(), cor, catalogos: sel });
  };
  return (
    <form className="space-y-4" onSubmit={enviar}>
      <TextField label="Nome da pasta" autoFocus value={nome} maxLength={120} placeholder="Ex.: Gêneros alimentícios, Compras 2026" onChange={(e) => setNome(e.target.value)} disabled={salvando} />
      <CoresPaleta valor={cor} onChange={setCor} />
      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-[13.5px] font-bold text-text">
          Catálogos <span className="font-normal text-muted">({sel.length} na pasta)</span>
        </legend>
        <SearchField compacto placeholder="Buscar catálogo" value={busca} onChange={(e) => setBusca(e.target.value)} onClear={() => setBusca("")} aria-label="Buscar catálogo" />
        <div className="max-h-72 space-y-0.5 overflow-y-auto rounded-control border border-border p-1">
          {visiveis.length === 0 && <p className="px-2 py-3 text-[13px] text-muted">Nenhum catálogo.</p>}
          {visiveis.map((c) => {
            const outra = c.pastaId != null && c.pastaId !== inicial?.id ? nomePasta.get(c.pastaId) : null;
            const marcado = sel.includes(c.id);
            return (
              <div key={c.id} className="rounded-control px-1 hover:bg-surface-2">
                <Checkbox
                  checked={marcado}
                  onChange={() => setSel((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))}
                  label={
                    <span className="block min-w-0">
                      <span className="block truncate text-[13.5px] text-text">{c.nome}</span>
                      <span className="block text-[11.5px] text-muted">
                        {ROTULO_TIPO_CATALOGO[c.tipo]}
                        {outra && marcado ? ` · sai da pasta "${outra}"` : outra ? ` · na pasta "${outra}"` : ""}
                      </span>
                    </span>
                  }
                />
              </div>
            );
          })}
        </div>
      </fieldset>
      {erro && <p className="text-[13px] font-medium text-[var(--danger)]">{erro}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onFechar} disabled={salvando}>
          Cancelar
        </Button>
        <Button type="submit" loading={salvando} disabled={!nome.trim()}>
          {inicial ? "Salvar pasta" : "Criar pasta"}
        </Button>
      </div>
    </form>
  );
}
