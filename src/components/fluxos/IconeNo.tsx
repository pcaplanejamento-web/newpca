import {
  IconAlert,
  IconBell,
  IconBuilding,
  IconCompare,
  IconCopy,
  IconFile,
  IconFilter,
  IconInbox,
  IconLerPdf,
  IconList,
  IconMerge,
  IconPasta,
  IconPencil,
  IconPlay,
  IconRamo,
  IconRepetir,
  IconSave,
  IconSoma,
  IconSort,
} from "../icons";

const MAPA = {
  play: IconPlay,
  building: IconBuilding,
  inbox: IconInbox,
  list: IconList,
  file: IconFile,
  folder: IconPasta,
  scan: IconLerPdf,
  branch: IconRamo,
  compare: IconCompare,
  repeat: IconRepetir,
  merge: IconMerge,
  filter: IconFilter,
  edit: IconPencil,
  sort: IconSort,
  copy: IconCopy,
  sum: IconSoma,
  alert: IconAlert,
  save: IconSave,
  bell: IconBell,
} as const;

/** O ícone de um tipo de nó (o nome vem do registro — `fluxo-nos.ts`). */
export function IconeNo({ nome, className }: { nome: string; className?: string }) {
  const I = MAPA[nome as keyof typeof MAPA] ?? IconAlert;
  return <I className={className} aria-hidden="true" />;
}
