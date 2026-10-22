import Link from "next/link";

/** Identidade do site definida pelo ADM (Configurações → Identidade). */
export type Identidade = { nome?: string; subtitulo?: string; favicon?: string };

export const NOME_PADRAO = "Plataforma PCA";
export const SUBTITULO_PADRAO = "Equipe PCA · Rio Verde";

/**
 * A MARCA do sistema: a logo do ADM (o favicon da Identidade) — sem ela, o monograma "RV" — + nome e subtítulo. A MESMA
 * no menu (`AppShell`) e nas telas de acesso. `tamanho` "lg" = a vitrine do login; `claro` = sobre fundo escuro.
 */
export function MarcaSistema({
  identidade,
  compacta = false,
  tamanho = "md",
  claro = false,
}: {
  identidade?: Identidade;
  compacta?: boolean;
  tamanho?: "md" | "lg";
  claro?: boolean;
}) {
  const nome = identidade?.nome?.trim() || NOME_PADRAO;
  const subtitulo = identidade?.subtitulo?.trim() || SUBTITULO_PADRAO;
  const favicon = identidade?.favicon?.trim();
  const lg = tamanho === "lg";
  const caixa = lg ? "h-11 w-11 rounded-xl" : "h-9 w-9 rounded-[10px]";
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {favicon ? (
        // biome-ignore lint/performance/noImgElement: favicon é data-URL base64 definida pelo ADM; next/image não otimiza data-URL.
        <img src={favicon} alt="" className={`${caixa} shrink-0 object-cover`} />
      ) : (
        <span
          className={`grid ${caixa} shrink-0 place-items-center font-black ${lg ? "text-[15px]" : "text-[13px]"} ${
            claro ? "bg-[var(--vitrine-texto)] text-[var(--vitrine-bg)]" : "bg-text text-surface"
          }`}
        >
          RV
        </span>
      )}
      {!compacta && (
        <span data-marca-texto="" className="min-w-0 leading-tight">
          <span className={`block truncate font-semibold ${lg ? "text-[17px]" : "text-[14px]"} ${claro ? "text-[var(--vitrine-texto)]" : "text-text"}`}>
            {nome}
          </span>
          <span className={`block truncate ${lg ? "text-[12.5px]" : "text-[11px]"} ${claro ? "text-[var(--vitrine-muted)]" : "text-muted"}`}>{subtitulo}</span>
        </span>
      )}
    </span>
  );
}

/**
 * A MARCA CLICÁVEL — o MESMO componente em todo cabeçalho (painel, página pública, login/cadastro): leva ao `href` e, ao
 * passar o mouse, ganha o realce do cartão da conta. A margem negativa devolve o respiro do realce: a logo fica no mesmo
 * lugar (também no trilho do menu recolhido).
 */
export function MarcaLink({
  href,
  dica,
  claro = false,
  ...marca
}: {
  href: string;
  dica?: string;
  identidade?: Identidade;
  compacta?: boolean;
  tamanho?: "md" | "lg";
  claro?: boolean;
}) {
  return (
    <Link
      href={href}
      title={dica}
      aria-label={dica}
      className={`flex min-w-0 items-center -m-[2.5px] -mr-1.5 rounded-control p-[2.5px] pr-1.5 transition-colors ${claro ? "hover:bg-white/10" : "hover:bg-surface-2"}`}
    >
      <MarcaSistema {...marca} claro={claro} />
    </Link>
  );
}
