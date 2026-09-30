"use client";

import { ABA_KEYS } from "@/lib/abas";
import { type Capacidades, capacidadesEfetivas, rotuloTela, telasFechadasPeloPapel } from "@/lib/papeis-core";
import { Callout } from "./Callout";
import { type GrupoOpcao, telasDoGrupo } from "./GruposDaPessoa";
import { IconAlert, IconLock } from "./icons";
import { MatrizCapacidades } from "./MatrizCapacidades";

/**
 * "VER ACESSO" de uma pessoa (Usuários): o que ela abre e faz, grupo a grupo — o grupo libera as telas, o papel diz as
 * ações; a matriz só-leitura mostra só as telas que ABREM (calculada pelo núcleo, `capacidadesEfetivas`). Aponta as telas
 * que o grupo libera mas o papel deixa fechadas. O Administrador tem tudo, com ou sem grupo; sem grupo, nada abre.
 */
export function AcessoDaPessoa({
  admin,
  papel,
  grupos,
}: {
  admin: boolean;
  /** O papel da pessoa (`null` = sem papel — nada abre). */
  papel: { nome: string; capacidades: Capacidades } | null;
  /** Os grupos DA PESSOA, com as telas de cada um. */
  grupos: readonly GrupoOpcao[];
}) {
  if (admin)
    return (
      <Callout kind="info" icon={<IconLock className="h-4 w-4" />}>
        Administrador: vê e faz tudo em todas as telas, inclusive a Administração — com ou sem grupo.
      </Callout>
    );
  if (!papel)
    return (
      <Callout kind="warn" icon={<IconAlert className="h-4 w-4" />}>
        A pessoa está sem papel: nenhuma tela abre. Escolha um papel na coluna Papel.
      </Callout>
    );
  if (grupos.length === 0)
    return (
      <Callout kind="warn" icon={<IconAlert className="h-4 w-4" />}>
        Sem grupo: a pessoa entra, mas não abre nenhuma tela nem vê dados. Em Editar, marque os grupos dela.
      </Callout>
    );
  return (
    <div className="space-y-[var(--gap-block)]">
      <p className="text-[13px] text-muted">
        Papel <span className="font-semibold text-text">{papel.nome}</span>. Vale o grupo ATIVO que a pessoa escolhe no cabeçalho — abaixo, o
        acesso em cada um.
      </p>
      {grupos.map((g) => {
        const ctx = { admin: false, capacidades: papel.capacidades, abas: g.abas };
        const efetivas = capacidadesEfetivas(ctx);
        const abertas = ABA_KEYS.filter((t) => efetivas[t]);
        const fechadas = telasFechadasPeloPapel(ctx).map(rotuloTela);
        return (
          <section key={g.id} className="space-y-2" aria-label={`Grupo ${g.nome}`}>
            <h4 className="text-[14px] font-bold text-text">{g.nome}</h4>
            {telasDoGrupo(g).length === 0 ? (
              <p className="text-[13px] text-muted">Este grupo não libera nenhuma tela (sem permissão ou uma permissão sem telas).</p>
            ) : abertas.length === 0 ? (
              <p className="text-[13px] text-muted">Nenhuma tela abre: o papel não visualiza as telas que o grupo libera.</p>
            ) : (
              <MatrizCapacidades valor={efetivas} telas={abertas} />
            )}
            {fechadas.length > 0 && abertas.length > 0 && (
              <p className="text-[12.5px] text-muted">
                Fechadas pelo papel (o grupo libera, o papel não visualiza): {fechadas.join(", ")}.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
