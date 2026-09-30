import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, it } from "node:test";
import { type Metodo, ROTAS_ACESSO } from "../src/lib/rotas-acesso.ts";

// TESTE ESTÁTICO do acesso das rotas: percorre `src/app/api/**/route.ts` e confere que TODO método exportado está no
// mapa (`rotas-acesso.ts`) e chama a guarda que o mapa descreve — a permissão do grupo e o papel valem no SERVIDOR, não
// só no menu.

const API = join(process.cwd(), "src", "app", "api");

function rotas(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...rotas(p));
    else if (nome === "route.ts") out.push(p);
  }
  return out;
}

/** O corpo de cada método exportado (do `export async function M(` até o próximo). */
function metodos(fonte: string): Map<Metodo, string> {
  const achados = [...fonte.matchAll(/^export async function (GET|POST|PATCH|PUT|DELETE)\(/gm)];
  const out = new Map<Metodo, string>();
  achados.forEach((m, i) => {
    const fim = i + 1 < achados.length ? (achados[i + 1].index ?? fonte.length) : fonte.length;
    out.set(m[1] as Metodo, fonte.slice(m.index ?? 0, fim));
  });
  return out;
}

const chave = (arquivo: string) => relative(API, arquivo).split(sep).slice(0, -1).join("/");

/** As guardas pelo PAPEL (a tela que o grupo abre + a ação que o papel permite) — no método ou num auxiliar do arquivo. */
const GUARDA_DO_PAPEL =
  /\b(exigirAcesso|recusa|recusaNoQuadro|recusaNaChave|motivoRecusa|motivoNoQuadro|podeTela|podeNoQuadro|podeLigarTrello|gruposDeTarefas|gruposComTela|atorPasta)\(/;

describe("acesso das rotas da API", () => {
  const arquivos = rotas(API);

  it("toda rota tem os métodos no mapa", () => {
    const faltam: string[] = [];
    for (const arq of arquivos) {
      const k = chave(arq);
      for (const m of metodos(readFileSync(arq, "utf8")).keys()) if (!ROTAS_ACESSO[k]?.[m]) faltam.push(`${m} ${k}`);
    }
    assert.deepEqual(faltam, []);
  });

  it("o mapa não tem rota nem método que não existe", () => {
    const existentes = new Map(arquivos.map((a) => [chave(a), metodos(readFileSync(a, "utf8"))]));
    const sobra: string[] = [];
    for (const [k, regras] of Object.entries(ROTAS_ACESSO)) {
      const ms = existentes.get(k);
      if (!ms) sobra.push(k);
      else for (const m of Object.keys(regras)) if (!ms.has(m as Metodo)) sobra.push(`${m} ${k}`);
    }
    assert.deepEqual(sobra, []);
  });

  it("cada método chama a guarda do mapa (tela + ação)", () => {
    const erros: string[] = [];
    for (const arq of arquivos) {
      const k = chave(arq);
      const regras = ROTAS_ACESSO[k];
      if (!regras) continue;
      const fonte = readFileSync(arq, "utf8");
      for (const [m, corpo] of metodos(fonte)) {
        const r = regras[m];
        if (!r) continue;
        const tem = (x: string) => corpo.includes(x);
        const falta = (x: string) => erros.push(`${m} ${k}: falta ${x}`);
        // A guarda do ADM pode estar num auxiliar do arquivo (a `chamada`), que chama `exigirAdmin`.
        if (r.tipo === "admin" && !(r.chamada ? tem(r.chamada) && fonte.includes("exigirAdmin(") : tem("exigirAdmin("))) falta(r.chamada ?? "exigirAdmin(");
        if (r.tipo === "pessoal" && !tem("exigirUsuario(") && !tem("exigirSessao(")) falta("exigirUsuario( ou exigirSessao(");
        if (r.tipo === "tela") {
          if (!tem("exigirAcesso(")) falta("exigirAcesso(");
          if (!tem(`"${r.acao}"`)) falta(`a ação "${r.acao}"`);
          for (const t of r.telas) if (!tem(`"${t}"`)) falta(`a tela "${t}"`);
        }
        if (r.tipo === "recurso") {
          const chamada = r.chamada ?? "recusa(";
          if (!tem(chamada)) falta(chamada);
          // A chamada pode ser um AUXILIAR do arquivo (ex.: `listaDoEditor(ctx, "configurar")`): a guarda pelo papel e a
          // ação ficam nele. A ação calculada por uma regra PURA (`acaoDe`, testada no núcleo) tem de ser chamada no arquivo.
          const auxiliar = new RegExp(`^(?:async )?function ${chamada.slice(0, -1)}\\(`, "m").test(fonte);
          const onde = auxiliar ? fonte : corpo;
          if (!GUARDA_DO_PAPEL.test(onde)) falta("a guarda pelo papel (recusa…/motivo…/pode…)");
          if (r.acaoDe) {
            if (!fonte.includes(r.acaoDe)) falta(r.acaoDe);
          } else if (!onde.includes(`"${r.acao}"`)) falta(`a ação "${r.acao}"`);
        }
        if (r.tipo !== "publica" && r.tipo !== "interna" && tem("exigirEditor(")) erros.push(`${m} ${k}: ainda usa exigirEditor(`);
      }
    }
    assert.deepEqual(erros, []);
  });
});
