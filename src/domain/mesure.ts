// Surfaces en CENTIÈMES de m² (entiers) — même raison que les montants en centimes : une somme de
// surfaces estimées doit tomber juste et se comparer sans erreur d'arrondi flottant.
//
// Le total des pièces d'un bâtiment s'affiche à côté de la surface du bâtiment, sans la remplacer
// (issue #2) : l'un est une somme de ce qui est saisi, l'autre une valeur tracée à part. Une pièce
// sans surface n'y compte pas pour zéro : le total le dit partiel.

import { LIBELLES_CONFIANCE, reserveDeConfiance, type Confiance, type ValeurTracee } from "./provenance";

/** "92,5" → 9250 ; "92" → 9200 ; retourne null si la saisie n'est pas une surface valide. */
export function parserSurface(saisie: string): number | null {
  const nettoye = saisie.trim().replace(/\s/g, "").replace(",", ".");
  if (nettoye === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(nettoye)) return null;
  const [entiere, decimale = ""] = nettoye.split(".");
  return Number.parseInt(entiere, 10) * 100 + Number.parseInt(decimale.padEnd(2, "0"), 10);
}

/** 9250 → "92,5 m²" (affichage seul). */
export function formaterSurface(centiemes: number): string {
  const entiere = Math.trunc(centiemes / 100);
  const reste = centiemes % 100;
  if (reste === 0) return `${entiere} m²`;
  const dec = String(reste).padStart(2, "0").replace(/0$/, "");
  return `${entiere},${dec} m²`;
}

export type TotalSurfaces = {
  /** Somme des surfaces renseignées ; `null` si aucune ne l'est (jamais 0 pour « inconnu »). */
  totalCentiemes: number | null;
  renseignees: number;
  pieces: number;
  /** La confiance la plus faible des surfaces renseignées ; `null` si toutes sont connues. */
  reserve: Confiance | null;
};

/** Additionne les surfaces renseignées des pièces, en comptant celles qui manquent. */
export function totalSurfacesPieces(surfaces: ReadonlyArray<ValeurTracee<number>>): TotalSurfaces {
  const connues = surfaces.filter((s): s is ValeurTracee<number> & { valeur: number } => s.valeur !== null && s.valeur !== undefined);
  return {
    totalCentiemes: connues.length === 0 ? null : connues.reduce((somme, s) => somme + s.valeur, 0),
    renseignees: connues.length,
    pieces: surfaces.length,
    reserve: reserveDeConfiance(surfaces),
  };
}

/**
 * Le total en clair : « 45 m² (3 pièces) », « 30 m², partiel : 2 pièces sur 3 · estimé »,
 * « à renseigner (aucune des 2 pièces n'a de surface) » (affichage seul).
 */
export function decrireTotalSurfaces(t: TotalSurfaces): string {
  if (t.pieces === 0) return "aucune pièce";
  if (t.totalCentiemes === null) return t.pieces === 1 ? "à renseigner (la pièce n'a pas de surface)" : `à renseigner (aucune des ${t.pieces} pièces n'a de surface)`;
  const compte = t.renseignees < t.pieces ? `partiel : ${t.renseignees} pièce${t.renseignees > 1 ? "s" : ""} sur ${t.pieces}` : `${t.pieces} pièce${t.pieces > 1 ? "s" : ""}`;
  const reserve = t.reserve ? ` · ${LIBELLES_CONFIANCE[t.reserve]}` : "";
  return t.renseignees < t.pieces ? `${formaterSurface(t.totalCentiemes)}, ${compte}${reserve}` : `${formaterSurface(t.totalCentiemes)} (${compte})${reserve}`;
}

/**
 * Taille d'un fichier, dans l'unité qui la rend lisible : 127 → "127 octets" ; 1536 → "2 Ko" ;
 * 1 572 864 → "1,5 Mo" (affichage seul). Un fichier qui existe n'affiche jamais « 0 Ko ».
 */
export function formaterTaille(octets: number): string {
  if (octets < 1024) return `${octets} octet${octets > 1 ? "s" : ""}`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(Math.round((octets / (1024 * 1024)) * 10) / 10).toLocaleString("fr-FR")} Mo`;
}
