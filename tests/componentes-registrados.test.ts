import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

/**
 * REGRA FIRME (CLAUDE.md → "Antes de criar um componente"): nenhum componente nasce sem antes revisar se um existente já
 * faz o trabalho. Este teste BLOQUEIA o deploy quando aparece um `.tsx` em `src/components` que não está no registro
 * `tests/fixtures/componentes-registrados.txt` — acrescentá-lo é a declaração consciente de que a revisão foi feita e
 * nenhum componente existente servia. Também recusa entrada de componente que não existe mais (sem registro morto).
 */
const RAIZ = new URL("../src/components/", import.meta.url).pathname;
const REGISTRO = new URL("./fixtures/componentes-registrados.txt", import.meta.url);

function arquivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return arquivos(p);
    return d.name.endsWith(".tsx") ? [relative(RAIZ, p).split("\\").join("/")] : [];
  });
}

test("componentes: todo .tsx de src/components está no registro (revisar os existentes antes de criar)", () => {
  const registrados = new Set(
    readFileSync(REGISTRO, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );
  const existentes = new Set(arquivos(RAIZ));
  const novos = [...existentes].filter((f) => !registrados.has(f)).sort();
  const mortos = [...registrados].filter((f) => !existentes.has(f)).sort();
  assert.deepEqual(
    novos,
    [],
    `Componente(s) novo(s) sem registro: ${novos.join(", ")}.\n` +
      "ANTES de criar um componente, revise se já existe um que funcione: o catálogo /painel/design-system, " +
      "src/components (grep pelo papel: banner, tabela, seletor, campo, cartão…) e o CLAUDE.md. Reutilize ou estenda o " +
      "existente. Só se nenhum servir, acrescente o caminho em tests/fixtures/componentes-registrados.txt (e o componente " +
      "ao catálogo do design-system, se for de interface).",
  );
  assert.deepEqual(mortos, [], `Registro com componente que não existe mais: ${mortos.join(", ")} — tire a linha.`);
});
