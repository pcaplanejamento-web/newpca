import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CATALOGO_COLUNAS_MESA, TABELAS_MESA } from "../src/lib/papeis-detalhes-core.ts";

// TESTE ESTÁTICO do catálogo das COLUNAS das Mesas (os detalhes do papel): cada chave do catálogo é a `key` de uma coluna
// de verdade nas tabelas da Mesa — senão ocultar a coluna no papel não esconderia nada.

const COMP = join(process.cwd(), "src", "components");
const fonte = (arq: string) => readFileSync(join(COMP, arq), "utf8");
const FONTES = ["DfdsView.tsx", "PlanilhaDfds.tsx", "MesaPca.tsx", "ColunasItensMesa.tsx"].map(fonte).join("\n");
const CHAVES = new Set([...FONTES.matchAll(/\bkey: "([A-Za-z]+)"/g)].map((m) => m[1]));

describe("detalhes do papel — colunas das Mesas", () => {
  it("toda chave do catálogo é uma coluna das tabelas da Mesa", () => {
    const faltam: string[] = [];
    for (const t of TABELAS_MESA) for (const c of CATALOGO_COLUNAS_MESA[t]) if (!CHAVES.has(c.chave)) faltam.push(`${t}.${c.chave}`);
    assert.deepEqual(faltam, []);
  });

  it("o catálogo não repete chave numa tabela e toda coluna fixa diz o motivo", () => {
    for (const t of TABELAS_MESA) {
      const chaves = CATALOGO_COLUNAS_MESA[t].map((c) => c.chave);
      assert.equal(new Set(chaves).size, chaves.length, t);
      for (const c of CATALOGO_COLUNAS_MESA[t]) if (c.classe === "fixa") assert.ok(c.motivo, `${t}.${c.chave}`);
    }
  });
});
