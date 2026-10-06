"use client";

import { type ReactNode, useId } from "react";
import { nomeExibicao, opcoesPessoa, type Pessoa } from "@/lib/pessoa";
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
/** No toque a busca não abre o teclado sozinha (cobriria a lista); com mouse — ou aberto pelo teclado —, o foco já vai para ela. */
const ponteiroFino = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches === true;
const CELULA = "min-h-11 gap-1 rounded-control px-2 lg:min-h-[calc(var(--h-control-sm)-6px)]";

/**
 * SELETOR DE PESSOA (uma só — para VÁRIAS, o `SeletorPessoas` em chips): a lista mostra cada pessoa com a FOTO e o
 * APELIDO (o nome completo embaixo quando difere; "(eu)" no próprio usuário, que vem primeiro — `opcoesPessoa`), as
 * opções especiais no topo (`extras`, com ícone) e a busca por apelido ou nome (vários com ":"). Teclado: aberto pelo
 * teclado, o foco vai para a busca; ↑/↓ e Enter escolhem, Esc fecha — o foco volta ao gatilho. Alvos de 44px no toque; a
 * lista (e as fotos) só existe com o painel aberto. Gatilhos: `filtro` (o quadrado só-ícone das barras, com a foto da
 * escolhida), `celula` (foto + apelido dentro da célula) e `campo` (o campo do formulário, largura toda). Sem `onChange`,
 * só o visual; `salvando` = spinner no lugar da seta e o gatilho travado (o foco fica nele). O painel PARA o clique —
 * numa tabela, tocar nele nunca abre a linha (o evento atravessa o portal).
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
  /** A pessoa escolhida quando NÃO está entre as opções (ex.: de outro grupo) — aparece no gatilho, sem re-escolha. */
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
  /** Gravando (célula/campo): spinner no lugar da seta e travado. */
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
  const nome = `${ariaLabel ?? rotulo} — ${texto}${salvando ? " (salvando)" : ""}`;

  // Sem permissão: só o visual.
  if (!onChange) return <PessoaTag pessoa={pessoa} vazio={extra?.rotulo ?? vazio} />;

  const seta = (tam: string) => (salvando ? <IconSpinner className={`${tam} shrink-0 text-accent`} /> : <IconChevronDown className={`${tam} shrink-0 text-faint`} />);
  const gatilho =
    variante === "filtro" ? (
      (extra?.icone ?? (pessoa ? <Avatar nome={pessoa.nome} foto={pessoa.foto} size="xs" /> : extras[0]?.icone))
    ) : variante === "celula" ? (
      <>
        <PessoaTag pessoa={pessoa} vazio={extra?.rotulo ?? vazio} />
        {seta("h-3.5 w-3.5")}
      </>
    ) : (
      <>
        {pessoa ? <Avatar nome={pessoa.nome} foto={pessoa.foto} size="sm" /> : extra ? circulo(extra.icone) : null}
        <span className={`min-w-0 flex-1 truncate text-left ${pessoa ? "text-text" : "text-muted"}`}>{texto}</span>
        {seta("h-4 w-4")}
      </>
    );

  return (
    <Dropdown
      id={idGatilho}
      papel="dialog"
      bloqueado={salvando}
      ariaLabel={nome}
      title={variante === "filtro" ? nome : undefined}
      align={variante === "filtro" ? "end" : "start"}
      width={variante === "campo" ? undefined : 300}
      className={className ?? (variante === "campo" ? "block w-full" : "inline-flex max-w-full")}
      triggerClassName={
        variante === "filtro"
          ? classeQuadradoFiltro(ativo)
          : variante === "celula"
            ? `${CELULA} transition-colors ${salvando ? "cursor-progress" : "hover:bg-surface-2"}`
            : `min-h-[50px] w-full gap-2.5 rounded-control border border-border-2 bg-surface px-3.5 py-2 text-base transition-colors ${salvando ? "cursor-progress" : "hover:bg-surface-2"}`
      }
      trigger={gatilho}
    >
      {(fechar, { teclado }) => {
        // A lista só é montada com o painel aberto: o próprio usuário primeiro; a foto no lugar do ícone.
        const opcoes: OpcaoBusca[] = [
          ...extras.map((e) => ({ valor: e.valor, rotulo: e.rotulo, icone: circulo(e.icone) })),
          ...opcoesPessoa(pessoas, usuarioId).map((o) => ({
            valor: String(o.pessoa.id),
            rotulo: o.rotulo,
            detalhe: o.detalhe,
            icone: <Avatar nome={o.pessoa.nome} foto={o.pessoa.foto} size="sm" />,
          })),
        ];
        return (
          // O painel PARA o clique (numa célula, o toque atravessaria o portal e abriria a linha) — e cobre o respiro do
          // Dropdown; o Esc (fechar + foco de volta ao gatilho) é do Dropdown.
          <div role="none" className="-m-2 p-2" onClick={(e) => e.stopPropagation()}>
            <SeletorBusca
              opcoes={opcoes}
              valor={valor}
              ariaLabel={ariaLabel ?? rotulo}
              placeholder="Buscar pelo apelido ou nome"
              vazio="Ninguém encontrado"
              autoFoco={teclado || ponteiroFino()}
              compacto
              onChange={(v) => {
                // Fechar devolve o foco ao gatilho sem rolar a tela (a linha pode ter mudado de lugar numa tabela
                // ordenada) — o Dropdown cuida.
                fechar();
                if (v !== valor) onChange(v);
              }}
            />
          </div>
        );
      }}
    </Dropdown>
  );
}
