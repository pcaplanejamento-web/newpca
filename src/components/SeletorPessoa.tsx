"use client";

import { type ReactNode, useId } from "react";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import { Avatar } from "./Avatar";
import { Dropdown } from "./Dropdown";
import { IconChevronDown, IconSpinner } from "./icons";
import { PessoaTag } from "./PessoaTag";
import { type OpcaoBusca, SeletorBusca } from "./SeletorBusca";
import { classeQuadradoFiltro } from "./SeletorFiltro";

/** Opção especial no topo da lista (ex.: "Todos", "Sem responsável") — um ícone no lugar da foto. */
export type ExtraPessoa = { valor: string; rotulo: string; icone: ReactNode };

/** Onde o seletor está: o QUADRADO só-ícone das barras de filtro, a CÉLULA de uma tabela ou o CAMPO de um formulário. */
export type VarianteSeletorPessoa = "filtro" | "celula" | "campo";

/** O círculo do ícone de um extra — do tamanho da foto na lista e no campo. */
const circulo = (icone: ReactNode) => <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-surface-2 text-muted">{icone}</span>;
/** No toque a busca não abre o teclado sozinha (cobriria a lista); com mouse, o foco já vai para ela. */
const ponteiroFino = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches === true;
const CELULA = "min-h-11 gap-1 rounded-control px-2 lg:min-h-[calc(var(--h-control-sm)-6px)]";

/**
 * SELETOR DE PESSOA (uma só): a lista mostra cada pessoa com a FOTO e o APELIDO (o nome completo embaixo quando difere;
 * "(eu)" no próprio usuário, que vem primeiro), as opções especiais no topo (`extras`, com ícone) e a busca por apelido
 * ou nome (vários com ":"). Teclado: ↑/↓ e Enter na busca, Esc fecha — o foco volta ao gatilho. Alvos de 44px no toque;
 * a lista (e as fotos) só existe com o painel aberto. Gatilhos: `filtro` (o quadrado só-ícone das barras, com a foto da
 * escolhida), `celula` (foto + apelido dentro da célula; sem `onChange` ou gravando, só o visual) e `campo` (o campo do
 * formulário, largura toda). O painel PARA o clique — numa tabela, tocar nele nunca abre a linha (o evento atravessa o
 * portal).
 */
export function SeletorPessoa({
  pessoas,
  valor,
  onChange,
  extras = [],
  usuarioId = null,
  atual = null,
  variante,
  rotulo,
  ariaLabel,
  ativo = false,
  vazio = "—",
  salvando = false,
  id,
  className,
}: {
  /** As pessoas que podem ser escolhidas. */
  pessoas: Pessoa[];
  /** A escolhida: `String(id)` de uma pessoa ou o `valor` de um extra. */
  valor: string;
  /** Sem ele, só o visual (sem permissão). */
  onChange?: (valor: string) => void;
  extras?: ExtraPessoa[];
  /** O usuário da sessão — "(eu)" e primeiro da lista. */
  usuarioId?: number | null;
  /** A pessoa escolhida quando ela NÃO está entre as opções (ex.: de outro grupo) — aparece no gatilho, sem re-escolha. */
  atual?: Pessoa | null;
  variante: VarianteSeletorPessoa;
  /** O que se escolhe (ex.: "Responsável") — o nome acessível e a dica. */
  rotulo: string;
  /** Nome acessível do gatilho (ex.: "Responsável pelo protocolo 123/2026"); padrão = o rótulo. */
  ariaLabel?: string;
  /** Filtro aplicado (variante `filtro`) — o quadrado em accent. */
  ativo?: boolean;
  /** Texto sem ninguém escolhido (célula/campo), quando nenhum extra representa o valor. */
  vazio?: string;
  /** Gravando (célula): spinner e travado. */
  salvando?: boolean;
  /** Id do gatilho (`<label htmlFor>`). */
  id?: string;
  /** Classes do invólucro (ex.: a largura na barra de edição em massa). */
  className?: string;
}) {
  const idAuto = useId();
  const idGatilho = id ?? idAuto;
  const extra = extras.find((e) => e.valor === valor) ?? null;
  const pessoa = extra ? null : (pessoas.find((p) => String(p.id) === valor) ?? (atual && String(atual.id) === valor ? atual : null));
  const texto = extra ? extra.rotulo : pessoa ? nomeExibicao(pessoa) : vazio;
  const nome = `${ariaLabel ?? rotulo} — ${texto}`;

  // Célula sem permissão ou gravando: só o visual (com o spinner ao gravar).
  if (variante === "celula" && (!onChange || salvando)) {
    const tag = <PessoaTag pessoa={pessoa} vazio={extra?.rotulo ?? vazio} />;
    if (!salvando) return tag;
    return (
      <span className={`inline-flex items-center ${CELULA}`} aria-busy="true">
        {tag}
        <IconSpinner className="h-3.5 w-3.5 shrink-0 text-accent" />
      </span>
    );
  }
  if (!onChange) return <PessoaTag pessoa={pessoa} vazio={extra?.rotulo ?? vazio} />;

  const gatilho =
    variante === "filtro" ? (
      (extra?.icone ?? (pessoa ? <Avatar nome={pessoa.nome} foto={pessoa.foto} size="xs" /> : extras[0]?.icone))
    ) : variante === "celula" ? (
      <>
        <PessoaTag pessoa={pessoa} vazio={extra?.rotulo ?? vazio} />
        <IconChevronDown className="h-3.5 w-3.5 shrink-0 text-faint" />
      </>
    ) : (
      <>
        {pessoa ? <Avatar nome={pessoa.nome} foto={pessoa.foto} size="sm" /> : extra ? circulo(extra.icone) : null}
        <span className={`min-w-0 flex-1 truncate text-left ${pessoa ? "text-text" : "text-muted"}`}>{texto}</span>
        <IconChevronDown className="h-4 w-4 shrink-0 text-faint" />
      </>
    );
  const voltarFoco = () => document.getElementById(idGatilho)?.focus();

  return (
    <Dropdown
      id={idGatilho}
      ariaLabel={nome}
      title={variante === "filtro" ? nome : undefined}
      align={variante === "filtro" ? "end" : "start"}
      width={variante === "campo" ? undefined : 300}
      className={className ?? (variante === "campo" ? "block w-full" : "inline-flex max-w-full")}
      triggerClassName={
        variante === "filtro"
          ? classeQuadradoFiltro(ativo)
          : variante === "celula"
            ? `${CELULA} transition-colors hover:bg-surface-2`
            : "min-h-[50px] w-full gap-2.5 rounded-control border border-border-2 bg-surface px-3.5 py-2 text-base transition-colors hover:bg-surface-2"
      }
      trigger={gatilho}
    >
      {(fechar) => {
        // A lista só é montada com o painel aberto: o próprio usuário primeiro; a foto no lugar do ícone.
        const ordem = usuarioId == null ? pessoas : [...pessoas.filter((p) => p.id === usuarioId), ...pessoas.filter((p) => p.id !== usuarioId)];
        const opcoes: OpcaoBusca[] = [
          ...extras.map((e) => ({ valor: e.valor, rotulo: e.rotulo, icone: circulo(e.icone) })),
          ...ordem.map((p) => {
            const apelido = nomeExibicao(p);
            return {
              valor: String(p.id),
              rotulo: p.id === usuarioId ? `${apelido} (eu)` : apelido,
              detalhe: apelido !== p.nome.trim() ? p.nome.trim() : undefined,
              icone: <Avatar nome={p.nome} foto={p.foto} size="sm" />,
            };
          }),
        ];
        return (
          // O painel PARA o clique (numa célula, o toque atravessaria o portal e abriria a linha) — e cobre o respiro do
          // Dropdown; o Esc (que o Dropdown já trata) devolve o foco ao gatilho.
          <div
            className="-m-2 p-2"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") voltarFoco();
            }}
          >
            <SeletorBusca
              opcoes={opcoes}
              valor={valor}
              ariaLabel={ariaLabel ?? rotulo}
              placeholder="Buscar pelo apelido ou nome"
              vazio="Ninguém encontrado"
              autoFoco={ponteiroFino()}
              compacto
              onChange={(v) => {
                fechar();
                voltarFoco();
                if (v !== valor) onChange(v);
              }}
            />
          </div>
        );
      }}
    </Dropdown>
  );
}
