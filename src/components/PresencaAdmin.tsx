"use client";

import { useCallback, useEffect, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { type ConfigPresenca, LIMITES_INATIVO } from "@/lib/presenca-core";
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { Button } from "./Button";
import { ErroCarga } from "./ErroCarga";
import { TextField } from "./Field";
import { IconEyeOff, IconSave, IconUsers } from "./icons";
import { SkeletonLinhas } from "./Skeleton";
import { Switch } from "./Switch";
import { toast } from "./Toast";

/**
 * Configurações → PRESENÇA (ADM): mostrar, ao vivo no cabeçalho, quem do grupo ativo está online. Desligada, nada é
 * carregado nem conectado (custo zero); ligada, cada aba abre UM canal com o objeto do grupo (Durable Object).
 */
export function PresencaAdmin() {
  const [c, setC] = useState<ConfigPresenca | null>(null);
  const [salvo, setSalvo] = useState<ConfigPresenca | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(() => {
    chamar<{ presenca: ConfigPresenca }>("/api/admin/presenca")
      .then((j) => {
        setC(j.presenca);
        setSalvo(j.presenca);
        setErro(null);
      })
      .catch((e) => setErro((e as Error).message));
  }, []);
  useEffect(carregar, [carregar]);
  if (erro && !c) return <ErroCarga msg={erro} onTentar={carregar} />;
  if (!c) return <SkeletonLinhas linhas={3} />;
  const salvar = async () => {
    setSalvando(true);
    try {
      const j = await chamar<{ presenca: ConfigPresenca }>("/api/admin/presenca", "PATCH", c);
      setC(j.presenca);
      setSalvo(j.presenca);
      toast.success("Presença salva — vale ao abrir ou recarregar as telas.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };
  return (
    <div className="space-y-[var(--gap-block)] rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-[15px] font-semibold text-text">Quem está online</p>
        <Ajuda titulo="Presença ao vivo">
          <TopicoAjuda icone={<IconUsers className="h-4 w-4" />} titulo="Mostrar quem está online">
            No cabeçalho, as fotos das pessoas do grupo ativo que estão com o sistema aberto, ao vivo (ponto verde). Tocar abre a
            lista. Cada pessoa vê só o próprio grupo.
          </TopicoAjuda>
          <TopicoAjuda titulo="Mostrar ausentes">
            Quem está com o sistema aberto em outra aba ou janela — ou parado há alguns minutos — aparece com o ponto âmbar.
          </TopicoAjuda>
          <TopicoAjuda titulo="Status e visto por último">
            Cada pessoa pode escolher o status (Disponível, Ocupado, Em reunião, Não perturbe) no painel do cabeçalho. Quem saiu
            aparece em "Visto recentemente" por 24 horas.
          </TopicoAjuda>
          <TopicoAjuda icone={<IconEyeOff className="h-4 w-4" />} titulo="Permitir aparecer invisível">
            No Perfil, a pessoa pode escolher não aparecer para os outros (ela continua vendo quem está online).
          </TopicoAjuda>
          <TopicoAjuda titulo="Custo">Desligada, nada é carregado. Ligada, cada aba mantém um canal leve, dentro do plano gratuito.</TopicoAjuda>
        </Ajuda>
      </div>
      <Switch dica="Mostra no cabeçalho, ao vivo, quem do grupo está com o sistema aberto" checked={c.ativo} onChange={(ativo) => setC({ ...c, ativo })} label="Mostrar quem do grupo está online" />
      <Switch dica="Quem está com o sistema em segundo plano aparece com o ponto âmbar" checked={c.ausente} disabled={!c.ativo} onChange={(ausente) => setC({ ...c, ausente })} label="Mostrar ausentes" />
      <Switch dica="No Perfil, cada pessoa pode escolher não aparecer" checked={c.invisivel} disabled={!c.ativo} onChange={(invisivel) => setC({ ...c, invisivel })} label="Permitir aparecer invisível" />
      <div className="max-w-xs">
        <TextField
          label="Ficar ausente após (minutos parado)"
          type="number"
          inputMode="numeric"
          min={LIMITES_INATIVO[0]}
          max={LIMITES_INATIVO[1]}
          disabled={!c.ativo || !c.ausente}
          value={c.inativoMin}
          onChange={(e) => setC({ ...c, inativoMin: Math.min(LIMITES_INATIVO[1], Math.max(LIMITES_INATIVO[0], Number.parseInt(e.target.value, 10) || 0)) })}
          hint="0 = só quando o sistema fica em segundo plano."
        />
      </div>
      <div className="flex justify-end">
        <Button size="sm" icon={<IconSave className="h-4 w-4" />} loading={salvando} disabled={salvando || JSON.stringify(c) === JSON.stringify(salvo)} onClick={salvar} title="Salvar a presença">
          Salvar
        </Button>
      </div>
    </div>
  );
}
