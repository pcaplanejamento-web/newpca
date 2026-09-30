import type { UnidadeTrabalho } from "@/lib/reparticoes";

/** O rótulo de uma unidade de trabalho nas opções: "SIGLA — Nome" (sem sigla própria, só o nome). */
export const rotuloUnidade = (u: UnidadeTrabalho) => (u.codigo && u.codigo !== u.nome ? `${u.codigo} — ${u.nome}` : u.nome);

/** As opções de um `<select>` de UNIDADE DE TRABALHO, agrupadas pelo ÓRGÃO (`optgroup`) na ordem do cadastro — o seletor
 * nativo do celular mostra os grupos. Sem órgão, vão no fim, em "Outras". */
export function OpcoesUnidades({ unidades }: { unidades: UnidadeTrabalho[] }) {
  const grupos = new Map<string, UnidadeTrabalho[]>();
  for (const u of unidades) {
    const g = u.orgao ?? "Outras";
    const lista = grupos.get(g);
    if (lista) lista.push(u);
    else grupos.set(g, [u]);
  }
  return (
    <>
      {[...grupos].map(([orgao, lista]) => (
        <optgroup key={orgao} label={orgao}>
          {lista.map((u) => (
            <option key={u.id} value={u.id}>
              {rotuloUnidade(u)}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
