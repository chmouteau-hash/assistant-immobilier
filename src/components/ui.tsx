// Petits composants d'interface partagés (serveur ou client). Aucune logique métier.

import type { ReactNode } from "react";
import type { Reference } from "@/lib/references";
import { etiquetteProvenance, LIBELLES_CONFIANCE, LIBELLES_SOURCE, type Confiance, type Source, type ValeurTracee } from "@/domain/provenance";

export function Champ({ label, children, large = false }: { label: string; children: ReactNode; large?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${large ? "flex-1 min-w-48" : ""}`}>
      <span className="text-neutral-600">{label}</span>
      {children}
    </label>
  );
}

export const classeSaisie = "min-h-10 rounded border border-neutral-300 bg-white px-2 py-1.5";

export function Select({ name, options, defaultValue, vide, required }: { name: string; options: Reference[]; defaultValue?: string; vide?: string; required?: boolean }) {
  return (
    <select name={name} defaultValue={defaultValue ?? (vide !== undefined ? "" : undefined)} className={classeSaisie} required={required}>
      {vide !== undefined && <option value="">{vide}</option>}
      {options.map((o) => (
        <option key={o.code} value={o.code}>
          {o.libelle}
        </option>
      ))}
    </select>
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
