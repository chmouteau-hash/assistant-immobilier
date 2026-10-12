// Positions géographiques en MICRODEGRÉS (entiers) — fonctions PURES, sans base ni réseau.
//
// Même raison que les montants en centimes et les surfaces en centièmes de m² : une position se
// stocke et se compare en entiers. Un microdegré vaut un millionième de degré, soit environ 11 cm
// au sol : largement assez pour poser un repère sur un bien. La conversion en nombre à virgule
// n'a lieu qu'au tout dernier moment, pour dessiner le repère sur la carte.
//
// Ce module lit aussi la réponse du service d'adresses (format GeoJSON de la Base Adresse
// Nationale) : lire, pas appeler — l'appel réseau est dans `lib/geocodage.ts`.
//
// Il tient enfin les règles de l'adresse d'un lieu, en trois parties : la voie, puis le code postal
// et la ville, qui forment ensemble la commune (issue #52).

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
  /** La voie, le code postal et la ville, tels que le service les donne séparément. */
  parties: PartiesAdresse;
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
    endroits.push({ id: `${nature}:${identifiant}`, libelle, nature, codePostal, position, parties: partiesDe(element, label) });
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
export type AdresseProche = { libelle: string; distanceMetres: number | null; parties: PartiesAdresse };

/**
 * Lit la réponse de la recherche inverse (un point → l'adresse la plus proche). Retourne null si
 * le service ne connaît aucune adresse à proximité : l'appelant le dit, sans en inventer une.
 */
export function interpreterReponseInverse(reponse: unknown): AdresseProche | null {
  const premier = elementsDe(reponse)[0];
  const libelle = premier ? texteDe(premier.properties?.label) : null;
  if (!premier || !libelle) return null;
  const distance = premier.properties?.distance;
  return { libelle, distanceMetres: typeof distance === "number" && Number.isFinite(distance) && distance >= 0 ? Math.round(distance) : null, parties: partiesDe(premier, libelle) };
}

/** 35 → "35 m" ; 1240 → "1,2 km" (affichage seul). */
export function formaterDistance(metres: number): string {
  if (metres < 1000) return `${metres} m`;
  return `${(Math.round(metres / 100) / 10).toLocaleString("fr-FR")} km`;
}

// --- L'adresse d'un lieu, en trois parties : voie, code postal, ville ------------------------------------

/**
 * Le code postal et la ville d'un lieu. Une seule information, tracée à part de la voie : en
 * recherche d'un bien, on connaît souvent la commune sans connaître l'adresse. L'un des deux peut
 * manquer ; les deux absents, la valeur entière est « à renseigner ».
 */
export type Commune = { codePostal: string | null; ville: string | null };

/** Une adresse découpée : la voie (« 12 rue des Tilleuls »), et la commune. */
export type PartiesAdresse = { voie: string | null; commune: Commune | null };

const LONGUEUR_MAX_VILLE = 100;

export type LectureCommune = { valide: true; commune: Commune | null } | { valide: false; motif: string };

/**
 * Lit la saisie d'un code postal et d'une ville. Deux champs vides donnent `null` : « à
 * renseigner ». Le code postal est français, cinq chiffres ; les espaces mis par habitude
 * (« 75 002 ») sont retirés. Rien n'est complété ni deviné : un code postal ne donne pas sa ville.
 */
export function lireCommune(codePostalBrut: string, villeBrute: string): LectureCommune {
  const codePostal = codePostalBrut.replace(/\s+/g, "");
  const ville = villeBrute.trim().replace(/\s+/g, " ");
  if (codePostal !== "" && !estCodePostal(codePostal)) {
    return { valide: false, motif: "Le code postal s'écrit en cinq chiffres, par exemple 75002. Pour un bien hors de France, laissez-le vide et écrivez tout dans l'adresse." };
  }
  if (ville !== "" && !/\p{L}/u.test(ville)) return { valide: false, motif: "Le nom de la ville doit contenir au moins une lettre." };
  if (ville.length > LONGUEUR_MAX_VILLE) return { valide: false, motif: `Le nom de la ville est trop long : ${LONGUEUR_MAX_VILLE} caractères au plus.` };
  if (codePostal === "" && ville === "") return { valide: true, commune: null };
  return { valide: true, commune: { codePostal: codePostal || null, ville: ville || null } };
}

/** « 75002 Paris », « 75002 » ou « Paris » : affichage seul. */
export function formaterCommune(commune: Commune): string {
  return [commune.codePostal, commune.ville].filter((partie) => partie !== null).join(" ");
}

/** L'adresse sur une ligne : « 1 rue de la Paix, 75002 Paris ». `null` si rien n'est renseigné. */
export function formaterAdresseComplete(voie: string | null, commune: Commune | null): string | null {
  const parties = [voie, commune ? formaterCommune(commune) : null].filter((partie): partie is string => partie !== null && partie !== "");
  return parties.length > 0 ? parties.join(", ") : null;
}

/**
 * Découpe une adresse rendue par le service, qui donne la voie (`name`), le code postal
 * (`postcode`) et la ville (`city`) à part. Pour une commune, le nom est celui de la ville : il
 * n'y a pas de voie. Sans code postal ni ville lisibles, rien ne permet de découper : le libellé
 * entier reste dans la voie, comme avant l'issue #52.
 */
function partiesDe(element: Element, libelle: string): PartiesAdresse {
  const proprietes = element.properties ?? {};
  const estCommune = texteDe(proprietes.type) === "municipality";
  const nom = texteDe(proprietes.name);
  const brut = texteDe(proprietes.postcode);
  const codePostal = brut !== null && estCodePostal(brut) ? brut : null;
  const ville = texteDe(proprietes.city) ?? (estCommune ? (nom ?? libelle) : null);
  if (codePostal === null && ville === null) return { voie: libelle, commune: null };
  return { voie: estCommune ? null : nom, commune: { codePostal, ville } };
}

// --- Situer un lieu d'après son adresse ----------------------------------------------------------------

/** Nombre de communes demandées pour une ville : assez pour voir que plusieurs portent ce nom. */
const NB_HOMONYMES = 10;

/**
 * Ce qu'on demande au service pour situer un lieu d'après son adresse. `mode` dit comment lire la
 * réponse : une adresse (la première réponse), une commune désignée par sa ville, ou toutes les
 * communes d'un code postal quand la ville manque.
 */
export type DemandeAdresse = { mode: "adresse" | "commune" | "code-postal"; parametres: Record<string, string> };

/**
 * Compose la demande depuis ce qui est renseigné, sans rien ajouter. `null` si tout manque.
 * - Avec une voie : la voie et la ville forment le texte, le code postal part en filtre (le
 *   service ne cherche alors que dans ce code postal).
 * - Sans voie : seules les communes sont demandées. Le code postal précède la ville dans le texte,
 *   parce que le service refuse un texte de moins de trois caractères et qu'une ville peut n'en
 *   compter que deux.
 */
export function demandeDepuisAdresse(voie: string | null, commune: Commune | null): DemandeAdresse | null {
  const texteVoie = voie?.trim() ?? "";
  const codePostal = commune?.codePostal ?? null;
  const ville = commune?.ville ?? null;
  const filtre: Record<string, string> = codePostal === null ? {} : { postcode: codePostal };
  if (texteVoie !== "") {
    const q = [texteVoie, ville]
      .filter((partie) => partie !== null)
      .join(" ")
      .slice(0, 200);
    return { mode: "adresse", parametres: { q, ...filtre, limit: "1" } };
  }
  if (ville !== null) {
    const q = [codePostal, ville]
      .filter((partie) => partie !== null)
      .join(" ")
      .slice(0, 200);
    return { mode: "commune", parametres: { q, type: "municipality", ...filtre, limit: String(NB_HOMONYMES) } };
  }
  if (codePostal !== null) return { mode: "code-postal", parametres: { q: codePostal, type: "municipality", limit: String(NB_COMMUNES_MAX) } };
  return null;
}

/** Compare deux noms de commune sans tenir compte des majuscules, des accents ni des traits d'union. */
function memeNom(a: string, b: string): boolean {
  const reduire = (texte: string) =>
    texte
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return reduire(a) === reduire(b);
}

/**
 * La commune qu'une ville saisie désigne, parmi les propositions du service. `homonymes` compte
 * les communes qui portent exactement ce nom.
 * - Une seule : c'est elle.
 * - Plusieurs : aucune n'est choisie. Un nom de commune sert souvent plusieurs fois en France, et
 *   en prendre une serait en inventer le choix.
 * - Aucune : la première proposition du service, que la note du repère montrera.
 */
export function communeDesignee(ville: string, endroits: Endroit[]): { endroit: Endroit | null; homonymes: number } {
  const communes = endroits.filter((endroit) => endroit.nature === "commune");
  const memes = communes.filter((endroit) => endroit.parties.commune?.ville != null && memeNom(endroit.parties.commune.ville, ville));
  if (memes.length === 1) return { endroit: memes[0], homonymes: 1 };
  if (memes.length > 1) return { endroit: null, homonymes: memes.length };
  return { endroit: communes[0] ?? null, homonymes: 0 };
}
