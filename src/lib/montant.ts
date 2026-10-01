// Manipulation des montants — toujours en CENTIMES (entiers), jamais en nombre à virgule
// flottante stocké ou additionné (règle reprise d'Ergonomia, `rust_decimal` côté Rust : « jamais
// de f64 pour les valeurs calculées/monétaires »). 0.1 + 0.2 ne vaut pas 0.3 en flottant ; un
// budget comparé entre deux scénarios doit, lui, tomber juste.
//
// La conversion en nombre à virgule n'a lieu qu'au tout dernier moment, pour l'AFFICHAGE — jamais
// pour un calcul ni un stockage.

/** Affiche un montant en centimes au format "1 234,56 €". Affichage seul : pas de recalcul. */
export function formaterMontant(centimes: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(centimes / 100);
}

/**
 * Convertit une saisie utilisateur ("1234,56", "1 234.5", "1234") en centimes (entier), sans
 * passer par une division/multiplication flottante sur la partie décimale : les euros et les
 * centimes sont traités comme deux entiers séparés, puis combinés.
 *
 * Retourne `null` si la saisie n'est pas un montant valide (c'est à l'appelant de refuser, pas à
 * cette fonction de deviner une valeur par défaut).
 */
export function parserMontant(saisie: string): number | null {
  const nettoye = saisie.trim().replace(/\s/g, "").replace(",", ".");
  if (nettoye === "") return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(nettoye)) return null;

  const [partieEuros, partieCentimes = ""] = nettoye.split(".");
  const euros = Number.parseInt(partieEuros, 10);
  const centimes = Number.parseInt(partieCentimes.padEnd(2, "0"), 10);
  const signe = partieEuros.startsWith("-") ? -1 : 1;

  return signe * (Math.abs(euros) * 100 + centimes);
}
