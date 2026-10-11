// Positions géographiques en MICRODEGRÉS (entiers) — fonctions PURES, sans base ni réseau.
//
// Même raison que les montants en centimes et les surfaces en centièmes de m² : une position se
// stocke et se compare en entiers. Un microdegré vaut un millionième de degré, soit environ 11 cm
// au sol : largement assez pour poser un repère sur un bien. La conversion en nombre à virgule
// n'a lieu qu'au tout dernier moment, pour dessiner le repère sur la carte.
//
// Ce module lit aussi la réponse du service d'adresses (format GeoJSON de la Base Adresse
// Nationale) : lire, pas appeler — l'appel réseau est dans `lib/geocodage.ts`.

export const MICRODEGRES_PAR_DEGRE = 1_000_000;

export type Position = { latitudeMicrodeg: number; longitudeMicrodeg: number };

/**
 * Fond de carte dessiné par `components/CarteLieux.tsx` : le Plan IGN de la Géoplateforme
 * (service public, sans clé). Le navigateur demande les tuiles à cet hôte quand une carte
 * s'affiche : l'écran le dit (DECISIONS.md, 2026-10-11). Changer de fond se fait ici seulement ;
 * OpenStreetMap (https://tile.openstreetmap.org/{z}/{x}/{y}.png, « © OpenStreetMap contributors »)
 * est l'alternative essayée.
 */
export const FOND_DE_CARTE = {
  nom: "Plan IGN (Géoplateforme)",
  hote: "data.geopf.fr",
  url: "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
  attribution: "© IGN — Géoplateforme",
  zoomMax: 19,
} as const;

const LATITUDE_MAX = 90 * MICRODEGRES_PAR_DEGRE;
const LONGITUDE_MAX = 180 * MICRODEGRES_PAR_DEGRE;

/**
 * "48,868546" → 48868546 ; "-1.5" → -1500000 ; "2" → 2000000. Au-delà de six décimales, le reste
 * est ignoré (plus fin que 11 cm n'a pas de sens ici). Retourne null si la saisie n'est pas une
 * coordonnée : c'est à l'appelant de refuser, pas à cette fonction de deviner.
 */
export function parserCoordonnee(saisie: string): number | null {
  const nettoye = saisie.trim().replace(/\s/g, "").replace(",", ".");
  if (nettoye === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(nettoye)) return null;
  const negatif = nettoye.startsWith("-");
  const [entiere, decimale = ""] = nettoye.replace("-", "").split(".");
  const micro = Number.parseInt(entiere, 10) * MICRODEGRES_PAR_DEGRE + Number.parseInt(decimale.slice(0, 6).padEnd(6, "0"), 10);
  return negatif ? -micro : micro;
}

/** 48868546 → "48,868546" ; 2000000 → "2" ; -1500000 → "-1,5" (affichage et formulaires). */
export function formaterCoordonnee(microdeg: number): string {
  const signe = microdeg < 0 ? "-" : "";
  const absolu = Math.abs(microdeg);
  const entiere = Math.trunc(absolu / MICRODEGRES_PAR_DEGRE);
  const reste = absolu % MICRODEGRES_PAR_DEGRE;
  if (reste === 0) return `${signe}${entiere}`;
  return `${signe}${entiere},${String(reste).padStart(6, "0").replace(/0+$/, "")}`;
}

/** Nombre à virgule (venu de la carte ou d'un service) → microdegrés entiers, arrondis. */
export function versMicrodegres(degres: number): number {
  const microdeg = Math.round(degres * MICRODEGRES_PAR_DEGRE);
  return microdeg === 0 ? 0 : microdeg; // jamais « -0 », que Math.round rend pour -0,0000004
}

/** Microdegrés → degrés à virgule. AFFICHAGE SEUL : pour dessiner sur la carte, jamais pour stocker. */
export function versDegres(microdeg: number): number {
  return microdeg / MICRODEGRES_PAR_DEGRE;
}

/** "lat. 48,868546 · long. 2,33031" — la pastille de provenance suit à côté. */
export function formaterPosition(p: Position): string {
  return `lat. ${formaterCoordonnee(p.latitudeMicrodeg)} · long. ${formaterCoordonnee(p.longitudeMicrodeg)}`;
}

export function validerPosition(p: Position): { valide: true } | { valide: false; motif: string } {
  if (!Number.isInteger(p.latitudeMicrodeg) || !Number.isInteger(p.longitudeMicrodeg)) {
    return { valide: false, motif: "La position doit être donnée en degrés décimaux (exemple : 48,868546 et 2,33031)." };
  }
  if (Math.abs(p.latitudeMicrodeg) > LATITUDE_MAX) return { valide: false, motif: "La latitude va de -90 à 90." };
  if (Math.abs(p.longitudeMicrodeg) > LONGITUDE_MAX) return { valide: false, motif: "La longitude va de -180 à 180." };
  return { valide: true };
}

export type ResultatGeocodage = {
  position: Position;
  /** L'adresse telle que le service l'a comprise : ce qu'on montre à côté du repère. */
  libelle: string;
  /** Entre 0 et 1 quand le service le donne ; plus c'est haut, plus la correspondance est sûre. */
  score: number | null;
};

/**
 * Lit la réponse du service d'adresses (GeoJSON : `features[0].geometry.coordinates` vaut
 * [longitude, latitude]). Retourne null si aucune adresse ne correspond ou si la réponse n'a pas
 * la forme attendue : l'appelant dit alors que l'adresse n'est pas reconnue, sans inventer de
 * position.
 */
export function interpreterReponseGeocodage(reponse: unknown): ResultatGeocodage | null {
  if (typeof reponse !== "object" || reponse === null) return null;
  const features = (reponse as { features?: unknown }).features;
  if (!Array.isArray(features) || features.length === 0) return null;
  const premier = features[0] as { geometry?: { coordinates?: unknown }; properties?: { label?: unknown; score?: unknown } };
  const coordonnees = premier.geometry?.coordinates;
  if (!Array.isArray(coordonnees) || coordonnees.length < 2) return null;
  const [longitude, latitude] = coordonnees as unknown[];
  if (typeof longitude !== "number" || typeof latitude !== "number" || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  const position = { latitudeMicrodeg: versMicrodegres(latitude), longitudeMicrodeg: versMicrodegres(longitude) };
  if (!validerPosition(position).valide) return null;
  const label = premier.properties?.label;
  const score = premier.properties?.score;
  return {
    position,
    libelle: typeof label === "string" && label.trim() !== "" ? label.trim() : "adresse reconnue",
    score: typeof score === "number" && Number.isFinite(score) ? score : null,
  };
}
