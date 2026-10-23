// As CLASSES do texto formatado como DOCUMENTO — as MESMAS no editor (EditorRico) e na leitura (TextoFormatado
// `documento`): o que o ADM vê ao editar é o que as pessoas leem.
export const ESTRUTURA =
  "text-text [&_h1]:font-bold [&_h1]:leading-tight [&_h2]:font-bold [&_h3]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-0.5 [&_blockquote]:my-3 [&_blockquote]:border-l-[3px] [&_blockquote]:border-border-2 [&_blockquote]:pl-4 [&_blockquote]:text-muted [&_hr]:my-5 [&_hr]:border-border [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.9em] [&_a]:text-accent [&_a]:underline [&_strong]:font-bold [&_>*:first-child]:mt-0";
export const CONTEUDO = `${ESTRUTURA} text-[15px] leading-[1.7] [&_h1]:mb-2 [&_h1]:mt-5 [&_h1]:text-[22px] [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-[18px] [&_h3]:mb-1.5 [&_h3]:mt-4 [&_h3]:text-[16px] [&_p]:my-2`;

/** O mesmo conteúdo num CAMPO (descrição, nota, comentário): fonte e respiros menores. */
export const CONTEUDO_COMPACTO = `${ESTRUTURA} text-[13.5px] leading-relaxed [&_h1]:mb-1 [&_h1]:mt-3 [&_h1]:text-[17px] [&_h2]:mb-1 [&_h2]:mt-3 [&_h2]:text-[15.5px] [&_h3]:mb-1 [&_h3]:mt-2.5 [&_h3]:text-[14px] [&_p]:my-1.5`;

