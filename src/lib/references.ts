// Listes de référence (tables `ref_*`) pour peupler les listes déroulantes. Les statuts vivent
// en base, pas dans un type TypeScript fermé : en ajouter un ne demande pas de toucher au code.

import { obtenirBase, versObjets } from "./db/client";

export type Reference = { code: string; libelle: string };

const TABLES = [
  "ref_statut_scenario",
  "ref_source_donnee",
  "ref_type_montant",
  "ref_statut_tache",
  "ref_confiance",
  "ref_role",
  "ref_type_projet",
  "ref_stade",
  "ref_type_lieu",
  "ref_statut_idee",
  "ref_type_document",
  "ref_statut_hypothese",
  "ref_statut_ligne",
] as const;
export type TableReference = (typeof TABLES)[number];

export function listerReference(table: TableReference): Reference[] {
  // `table` est contraint par le type : pas d'injection possible, mais on revérifie à l'exécution.
  if (!(TABLES as readonly string[]).includes(table)) throw new Error(`Table de référence inconnue : ${table}`);
  const colonnes = obtenirBase().prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  const filtreActif = colonnes.some((c) => c.name === "is_active") ? "WHERE is_active = 1" : "";
  return versObjets<Reference>(
    obtenirBase().prepare(`SELECT code, libelle FROM ${table} ${filtreActif} ORDER BY ordre`).all(),
  );
}

export function libelle(refs: Reference[], code: string | null): string {
  if (code === null) return "—";
  return refs.find((r) => r.code === code)?.libelle ?? code;
}
