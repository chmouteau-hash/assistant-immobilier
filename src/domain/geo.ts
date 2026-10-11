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
 * Ce que la carte d'un dossier appelle « le même secteur » : elle s'ouvre sur les lieux du dossier
 * et sur les biens des autres dossiers situés à moins de cette distance. Les biens plus lointains
 * sont sur la carte aussi, mais elle ne dézoome pas d'office jusqu'à eux.
 */
export const RAYON_SECTEUR_KM = 30;

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
  const premier = elementsDe(reponse)[0];
  if (!premier) return null;
  const position = positionDe(premier);
  if (!position) return null;
  const score = premier.properties?.score;
  return {
    position,
    libelle: texteDe(premier.properties?.label) ?? "adresse reconnue",
    score: typeof score === "number" && Number.isFinite(score) ? score : null,
  };
}

// --- Lecture commune des réponses du service (GeoJSON) ------------------------------------------------

type Element = { geometry?: { coordinates?: unknown }; properties?: Record<string, unknown> };

function elementsDe(reponse: unknown): Element[] {
  if (typeof reponse !== "object" || reponse === null) return [];
  const features = (reponse as { features?: unknown }).features;
  return Array.isArray(features) ? (features.filter((f) => typeof f === "object" && f !== null) as Element[]) : [];
}

function positionDe(element: Element): Position | null {
  const coordonnees = element.geometry?.coordinates;
  if (!Array.isArray(coordonnees) || coordonnees.length < 2) return null;
  const [longitude, latitude] = coordonnees as unknown[];
  if (typeof longitude !== "number" || typeof latitude !== "number" || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  const position = { latitudeMicrodeg: versMicrodegres(latitude), longitudeMicrodeg: versMicrodegres(longitude) };
  return validerPosition(position).valide ? position : null;
}

function texteDe(valeur: unknown): string | null {
  return typeof valeur === "string" && valeur.trim() !== "" ? valeur.trim() : null;
}

// --- Chercher un endroit : code postal, commune ou adresse ----------------------------------------------

/**
 * Le nom du service d'adresses, tel que l'écran le cite avant tout envoi. Défini ici, dans le
 * domaine, parce que des composants client l'affichent : ils ne peuvent pas importer `lib`.
 */
export const NOM_SERVICE_ADRESSES = "Base Adresse Nationale (Géoplateforme IGN)";

export type NatureEndroit = "commune" | "rue" | "adresse" | "lieu-dit" | "endroit";

/** Un endroit que le service propose pour un texte cherché. */
export type Endroit = {
  /** Clé stable, pour une liste à l'écran et pour écarter les doublons. */
  id: string;
  /** Ce que l'écran affiche. Une commune est précédée de son code postal. */
  libelle: string;
  nature: NatureEndroit;
  codePostal: string | null;
  position: Position;
};

const NATURES: Record<string, NatureEndroit> = { municipality: "commune", street: "rue", housenumber: "adresse", locality: "lieu-dit" };

/** Nombre d'endroits proposés au plus pour un texte libre. */
export const NB_ENDROITS_MAX = 8;
/** Nombre de communes demandées pour un code postal seul : le plus que le service accepte. Un code en couvre parfois une quarantaine. */
export const NB_COMMUNES_MAX = 50;

/** Un code postal français saisi seul : cinq chiffres, rien d'autre. */
export function estCodePostal(texte: string): boolean {
  return /^\d{5}$/.test(texte.trim());
}

/**
 * Lit TOUTES les propositions du service, dans son ordre. Une proposition sans position lisible ou
 * sans libellé est ignorée : rien n'est proposé qui ne puisse pas être placé ou nommé. Pour une
 * commune, le service ne donne que son nom : on le fait précéder du code postal, parce que
 * plusieurs communes portent le même nom et qu'un code postal en couvre souvent plusieurs.
 */
export function interpreterResultatsRecherche(reponse: unknown): Endroit[] {
  const endroits: Endroit[] = [];
  for (const element of elementsDe(reponse)) {
    const position = positionDe(element);
    const label = texteDe(element.properties?.label);
    if (!position || !label) continue;
    const type = texteDe(element.properties?.type) ?? "";
    const nature = NATURES[type] ?? "endroit";
    const codePostal = texteDe(element.properties?.postcode);
    const libelle = nature === "commune" && codePostal && !label.includes(codePostal) ? `${codePostal} ${label}` : label;
    const identifiant = texteDe(element.properties?.id) ?? `${position.latitudeMicrodeg},${position.longitudeMicrodeg}`;
    endroits.push({ id: `${nature}:${identifiant}`, libelle, nature, codePostal, position });
  }
  return endroits;
}

/**
 * Les communes d'un code postal, par ordre alphabétique : on y cherche un nom, pas un rang. Le
 * service répond aussi par des communes voisines quand le code lui ressemble : seules celles qui
 * portent exactement ce code sont gardées, s'il y en a.
 */
export function communesDuCodePostal(codePostal: string, endroits: Endroit[]): Endroit[] {
  const communes = endroits.filter((e) => e.nature === "commune");
  const exactes = communes.filter((e) => e.codePostal === codePostal.trim());
  return (exactes.length > 0 ? exactes : communes).sort((a, b) => a.libelle.localeCompare(b.libelle, "fr"));
}

/**
 * Réunit les propositions générales et celles limitées aux communes, sans doublon. Un texte sans
 * chiffre (« Rennes ») est le plus souvent un nom de commune : le service, lui, répond d'abord par
 * des rues du même nom ailleurs en France. Les communes passent donc devant dans ce cas. Avec un
 * chiffre (code postal, numéro de rue), l'ordre du service est le bon et il est gardé.
 */
export function fusionnerEndroits(texte: string, generaux: Endroit[], communes: Endroit[]): Endroit[] {
  const ordre = /\d/.test(texte) ? [...generaux, ...communes] : [...communes, ...generaux];
  const vus = new Set<string>();
  const uniques: Endroit[] = [];
  for (const endroit of ordre) {
    if (vus.has(endroit.id)) continue;
    vus.add(endroit.id);
    uniques.push(endroit);
  }
  return uniques.slice(0, NB_ENDROITS_MAX);
}

/** Ce que la carte garde en note d'une position choisie dans la liste : « 00000 Commune (commune) ». */
export function noteEndroit(endroit: Endroit): string {
  return endroit.nature === "adresse" ? endroit.libelle : `${endroit.libelle} (${endroit.nature})`;
}

// --- Trouver l'adresse la plus proche d'un point --------------------------------------------------------

/** L'adresse connue la plus proche d'un point, et à quelle distance : ce n'est pas forcément celle du bien. */
export type AdresseProche = { libelle: string; distanceMetres: number | null };

/**
 * Lit la réponse de la recherche inverse (un point → l'adresse la plus proche). Retourne null si
 * le service ne connaît aucune adresse à proximité : l'appelant le dit, sans en inventer une.
 */
export function interpreterReponseInverse(reponse: unknown): AdresseProche | null {
  const premier = elementsDe(reponse)[0];
  const libelle = premier ? texteDe(premier.properties?.label) : null;
  if (!premier || !libelle) return null;
  const distance = premier.properties?.distance;
  return { libelle, distanceMetres: typeof distance === "number" && Number.isFinite(distance) && distance >= 0 ? Math.round(distance) : null };
}

/** 35 → "35 m" ; 1240 → "1,2 km" (affichage seul). */
export function formaterDistance(metres: number): string {
  if (metres < 1000) return `${metres} m`;
  return `${(Math.round(metres / 100) / 10).toLocaleString("fr-FR")} km`;
}
