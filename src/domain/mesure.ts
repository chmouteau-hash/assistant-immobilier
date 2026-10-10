// Surfaces en CENTIÈMES de m² (entiers) — même raison que les montants en centimes : une somme de
// surfaces estimées doit tomber juste et se comparer sans erreur d'arrondi flottant.

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
