// Petits composants d'interface partagés (serveur ou client). Aucune logique métier.

import type { ReactNode } from "react";
import type { Reference } from "@/lib/references";
import {
  etiquetteProvenance,
  LIBELLES_CONFIANCE,
  LIBELLES_SOURCE,
  QUESTION_CONFIANCE,
  QUESTION_SOURCE,
  REPONSES_CONFIANCE,
  REPONSES_SOURCE,
  type Confiance,
  type Source,
  type ValeurTracee,
} from "@/domain/provenance";

export function Champ({ label, children, large = false }: { label: string; children: ReactNode; large?: boolean }) {
  return (
    <label className={`flex max-w-full flex-col gap-1 text-sm ${large ? "flex-1 min-w-48" : ""}`}>
      <span className="text-neutral-600">{label}</span>
      {children}
    </label>
  );
}

// `max-w-full` : une liste prend la largeur de son choix le plus long. Sans cette borne, une réponse
// longue la faisait dépasser de l'écran sur un téléphone.
export const classeSaisie = "min-h-10 max-w-full rounded border border-neutral-300 bg-white px-2 py-1.5";

// La `key` recrée la liste quand la valeur enregistrée change. Sans elle, React garde le choix de
// départ du premier affichage puis remet le formulaire à zéro après chaque action : la liste
// réaffichait l'ancienne valeur après un enregistrement réussi (issue #16). Toute liste écrite à la
// main avec un `defaultValue` tiré d'une donnée doit porter la même `key`.
export function Select({ name, options, defaultValue, vide, required }: { name: string; options: Reference[]; defaultValue?: string; vide?: string; required?: boolean }) {
  const valeurDeDepart = defaultValue ?? (vide !== undefined ? "" : undefined);
  return (
    <select key={valeurDeDepart} name={name} defaultValue={valeurDeDepart} className={classeSaisie} required={required}>
      {vide !== undefined && <option value="">{vide}</option>}
      {options.map((o) => (
        <option key={o.code} value={o.code}>
          {o.libelle}
        </option>
      ))}
    </select>
  );
}

// Les deux champs de provenance, posés comme des questions (issue #15) : « Source » et « Confiance »
// ne disaient pas ce qu'ils demandaient. Les réponses viennent du domaine ; les tables de référence
// ne fournissent plus que les codes proposés et leur ordre.
function reponses(options: Reference[], phrases: Record<string, string>): Reference[] {
  return options.map((o) => ({ code: o.code, libelle: phrases[o.code] ?? o.libelle }));
}

/** Les réponses à « D'où vient cette information ? », pour une liste affichée sans sa question. */
export function reponsesSource(sources: Reference[]): Reference[] {
  return reponses(sources, REPONSES_SOURCE);
}

export function QuestionSource({
  name,
  sources,
  defaultValue,
  vide,
  question = QUESTION_SOURCE,
}: {
  name: string;
  sources: Reference[];
  defaultValue?: string;
  vide?: string;
  question?: string;
}) {
  return (
    <Champ label={question}>
      <Select name={name} options={reponsesSource(sources)} defaultValue={defaultValue} vide={vide} />
    </Champ>
  );
}

export function QuestionConfiance({ name, confiances, defaultValue, vide }: { name: string; confiances: Reference[]; defaultValue?: string; vide?: string }) {
  return (
    <Champ label={QUESTION_CONFIANCE}>
      <Select name={name} options={reponses(confiances, REPONSES_CONFIANCE)} defaultValue={defaultValue} vide={vide} />
    </Champ>
  );
}

export function Pastille({ children, ton = "neutre" }: { children: ReactNode; ton?: "neutre" | "attention" | "ok" | "ia" }) {
  const couleurs = {
    neutre: "bg-neutral-100 text-neutral-700",
    attention: "bg-amber-100 text-amber-800",
    ok: "bg-green-100 text-green-800",
    ia: "bg-violet-100 text-violet-800",
  }[ton];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${couleurs}`}>{children}</span>;
}

export function Section({ titre, children, sousTitre }: { titre: string; children: ReactNode; sousTitre?: string }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold text-neutral-800">{titre}</h2>
        {sousTitre && <p className="text-xs text-neutral-500">{sousTitre}</p>}
      </div>
      {children}
    </section>
  );
}

export function Vide({ children }: { children: ReactNode }) {
  return <p className="text-sm text-neutral-500">{children}</p>;
}

/** Affiche TOUJOURS valeur + source + statut (ou « À renseigner »). */
export function Provenance<T>({ valeur, formater }: { valeur: ValeurTracee<T>; formater: (v: T) => string }) {
  const texte = etiquetteProvenance(valeur, formater);
  if (valeur.valeur === null || valeur.valeur === undefined) return <Pastille ton="attention">À renseigner</Pastille>;
  const ton = valeur.confiance === "connu" ? "ok" : valeur.source === "suggestion_ia" ? "ia" : "attention";
  return (
    <span className="inline-flex flex-wrap items-center gap-1" title={texte}>
      <span>{formater(valeur.valeur)}</span>
      <Pastille ton={ton}>
        {valeur.source ? LIBELLES_SOURCE[valeur.source] : "?"} · {LIBELLES_CONFIANCE[valeur.confiance]}
      </Pastille>
    </span>
  );
}

export function EtiquetteSourceConfiance({ source, confiance }: { source: Source | string; confiance: Confiance | string }) {
  const ton = confiance === "connu" ? "ok" : source === "suggestion_ia" ? "ia" : "attention";
  const s = (LIBELLES_SOURCE as Record<string, string>)[source] ?? source;
  const c = (LIBELLES_CONFIANCE as Record<string, string>)[confiance] ?? confiance;
  return (
    <Pastille ton={ton}>
      {s} · {c}
    </Pastille>
  );
}

export function formaterDate(iso: string | null): string {
  if (!iso) return "date inconnue";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("fr-FR");
}

export function formaterDateHeure(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR");
}
