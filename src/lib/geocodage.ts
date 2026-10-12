// Service d'adresses — situer un lieu avec l'aide de la Base Adresse Nationale.
//
// Trois usages, tous déclenchés par un geste de l'utilisateur sur l'écran Lieux :
// - situer un lieu d'après son adresse, son code postal et sa ville (bouton « Situer d'après
//   l'adresse ») ;
// - chercher un endroit par un code postal, une commune ou une adresse (bouton « Chercher »), puis
//   en choisir un dans la liste ;
// - trouver l'adresse connue la plus proche d'un point cliqué sur la carte.
//
// Garanties tenues ici :
// 1. Rien ne part sans un geste explicite : jamais à l'affichage, jamais à la saisie. L'application
//    fonctionne sans ce module : sans réseau, la position se saisit ou se déplace à la main.
// 2. Une seule chose part à chaque fois, vers un seul service : ce qui est renseigné de l'adresse du
//    lieu (voie, code postal, ville), ou le texte cherché, ou le point cliqué. Jamais le nom du lieu
//    ni celui du dossier. Le service est la Base Adresse Nationale, servie par la Géoplateforme de
//    l'IGN (service public, sans clé ni compte — DECISIONS.md, 2026-10-11).
// 3. Le droit d'écrire les lieux est vérifié AVANT tout appel réseau : un acteur qui ne peut pas
//    poser le repère ne fait rien partir non plus.
// 4. Ce qui vient du service s'écrit « source externe · à confirmer », avec un événement d'audit
//    qui dit d'où cela vient. Pas de résultat : rien n'est écrit, rien n'est inventé. Plusieurs
//    communes possibles : aucune n'est choisie d'office.
// 5. Une adresse trouvée par le service n'entre dans le dossier que si l'utilisateur l'a vue et
//    l'a demandée. Après un clic, le serveur ne connaît que le point : l'adresse est redemandée au
//    service au moment d'écrire, et refusée si elle n'est plus celle qui était affichée. Dans la
//    liste de recherche, c'est la proposition affichée qui est enregistrée, sans nouvel appel.
// 6. Le service donne la voie, le code postal et la ville à part : chacun va dans son champ. Une
//    partie qu'il ne donne pas n'est pas touchée.
//
// Variable d'environnement facultative : ASSISTANT_GEOCODAGE_URL, l'adresse de la recherche, si le
// service en change. Celle de la recherche inverse s'en déduit (« search » devient « reverse »).

import { exiger, type Acteur } from "./acces";
import { transaction } from "./db/client";
import { invalide, serviceIndisponible } from "./erreurs";
import { modifierAdresseLieu, modifierPositionLieu, obtenirLieu, type Lieu } from "./structure";
import {
  communeDesignee,
  communesDuCodePostal,
  demandeDepuisAdresse,
  estCodePostal,
  formaterCoordonnee,
  formaterDistance,
  fusionnerEndroits,
  interpreterReponseGeocodage,
  interpreterReponseInverse,
  interpreterResultatsRecherche,
  NB_COMMUNES_MAX,
  NB_ENDROITS_MAX,
  NOM_SERVICE_ADRESSES,
  noteEndroit,
  validerPosition,
  type AdresseProche,
  type Endroit,
  type PartiesAdresse,
  type Position,
} from "../domain/geo";

export const NOM_SERVICE_GEOCODAGE = NOM_SERVICE_ADRESSES;
const URL_PAR_DEFAUT = "https://data.geopf.fr/geocodage/search";
const DELAI_MS = 8_000;

export function urlGeocodage(): string {
  return process.env.ASSISTANT_GEOCODAGE_URL || URL_PAR_DEFAUT;
}

/** Adresse de la recherche inverse, déduite de celle de la recherche. */
export function urlGeocodageInverse(): string {
  const url = new URL(urlGeocodage());
  url.pathname = url.pathname.replace(/search\/?$/, "reverse");
  return url.toString();
}

const INDISPONIBLE = "Le service d'adresses ne répond pas : vérifiez la connexion";

/**
 * Un appel au service. `VALIDATION` s'il ne comprend pas la demande (code 400),
 * `SERVICE_INDISPONIBLE` s'il ne répond pas ou répond autre chose que du JSON.
 */
async function interroger(adresse: string, parametres: Record<string, string>, messages: { incompris: string; indisponible: string }): Promise<unknown> {
  let reponse: Response;
  try {
    const url = new URL(adresse);
    for (const [cle, valeur] of Object.entries(parametres)) url.searchParams.set(cle, valeur);
    reponse = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(DELAI_MS) });
  } catch {
    throw serviceIndisponible(messages.indisponible);
  }
  if (reponse.status === 400) throw invalide(messages.incompris);
  if (!reponse.ok) throw serviceIndisponible(messages.indisponible);
  try {
    return await reponse.json();
  } catch {
    throw serviceIndisponible(messages.indisponible);
  }
}

/**
 * Les parties d'une adresse du service, sous la forme qu'attend `modifierAdresseLieu` : une partie
 * que le service ne donne pas est absente, donc laissée telle quelle dans le dossier.
 */
function partiesAEcrire(parties: PartiesAdresse): { adresse?: string; commune?: { codePostal: string; ville: string } } {
  return {
    ...(parties.voie === null ? {} : { adresse: parties.voie }),
    ...(parties.commune === null ? {} : { commune: { codePostal: parties.commune.codePostal ?? "", ville: parties.commune.ville ?? "" } }),
  };
}

/**
 * Envoie au service ce qui est renseigné de l'adresse du lieu (voie, code postal, ville) et
 * enregistre la correspondance comme position « source externe · à confirmer ».
 * - Avec une voie : la première adresse que le service reconnaît.
 * - Sans voie, avec une ville : la commune qui porte ce nom.
 * - Avec le code postal seul : sa commune, s'il n'en couvre qu'une.
 * Lève `VALIDATION` si rien n'est renseigné, si rien ne correspond, ou si plusieurs communes
 * conviennent : aucune n'est choisie d'office. Lève `SERVICE_INDISPONIBLE` si le service ne
 * répond pas.
 */
export async function situerLieuDepuisAdresse(acteur: Acteur, params: { lieuId: string }): Promise<Lieu> {
  const lieu = obtenirLieu(acteur, params.lieuId);
  exiger(acteur, lieu.dossierId, "ecrire", "lieux");
  const commune = lieu.commune.valeur;
  const demande = demandeDepuisAdresse(lieu.adresse.valeur, commune);
  if (!demande) throw invalide("Ce lieu n'a ni adresse, ni code postal, ni ville : renseignez-les d'abord, ou saisissez sa position.");
  if (demande.parametres.q.length < 3) throw invalide("L'adresse est trop courte pour être cherchée : complétez-la, ou saisissez la position.");

  const corps = await interroger(urlGeocodage(), demande.parametres, {
    incompris: "Le service d'adresses n'a pas compris cette adresse : vérifiez-la, ou saisissez la position.",
    indisponible: `${INDISPONIBLE}, ou placez le repère à la main.`,
  });

  let trouve: { position: Position; note: string; motif: string };
  if (demande.mode === "adresse") {
    const resultat = interpreterReponseGeocodage(corps);
    if (!resultat) throw invalide("Adresse non reconnue par la Base Adresse Nationale : vérifiez-la, ou placez le repère à la main.");
    const score = resultat.score === null ? "" : ` (score ${Math.round(resultat.score * 100)} %)`;
    trouve = { position: resultat.position, note: resultat.libelle, motif: `Situé d'après l'adresse par la ${NOM_SERVICE_GEOCODAGE}${score}` };
  } else {
    const endroits = interpreterResultatsRecherche(corps);
    let endroit: Endroit | null;
    if (demande.mode === "code-postal") {
      // Le service répond aussi par des communes voisines quand le code lui ressemble : seules
      // celles qui portent exactement ce code comptent.
      const exactes = endroits.filter((e) => e.nature === "commune" && e.codePostal === commune?.codePostal);
      if (exactes.length > 1) {
        throw invalide(`Le code postal ${commune?.codePostal} couvre ${exactes.length} communes : renseignez la ville, ou cherchez ce code postal dans la fiche du lieu pour choisir la commune.`);
      }
      endroit = exactes[0] ?? null;
    } else {
      const ville = commune?.ville ?? "";
      const choix = communeDesignee(ville, endroits);
      if (choix.homonymes > 1) {
        throw invalide(`Plusieurs communes s'appellent « ${ville} » : renseignez le code postal, ou cherchez cette ville dans la fiche du lieu pour choisir la bonne.`);
      }
      endroit = choix.endroit;
    }
    if (!endroit) throw invalide("Commune non reconnue par la Base Adresse Nationale : vérifiez le code postal et la ville, ou placez le repère à la main.");
    trouve = { position: endroit.position, note: noteEndroit(endroit), motif: `Situé d'après le code postal et la ville par la ${NOM_SERVICE_GEOCODAGE}` };
  }

  return modifierPositionLieu(acteur, {
    lieuId: lieu.id,
    latitudeMicrodeg: trouve.position.latitudeMicrodeg,
    longitudeMicrodeg: trouve.position.longitudeMicrodeg,
    positionSource: "source_externe",
    positionConfiance: "a_confirmer",
    note: trouve.note,
    motif: trouve.motif,
  });
}

/**
 * Enregistre l'endroit que l'utilisateur a choisi dans la liste de recherche : sa position,
 * « source externe · à confirmer », avec le nom de l'endroit en note. S'il l'a demandé, les
 * parties de son adresse que le service donne (voie, code postal, ville) sont écrites dans la même
 * transaction, sous la même provenance ; une partie que le service ne donne pas n'est pas touchée.
 * Rien ne part : la proposition est celle que la liste affichait.
 */
export function situerLieuSurEndroit(
  acteur: Acteur,
  params: { lieuId: string; note: string; texteCherche: string; adresse?: { voie: string; codePostal: string; ville: string } | null } & Position,
): Lieu {
  const lieu = obtenirLieu(acteur, params.lieuId);
  exiger(acteur, lieu.dossierId, "ecrire", "lieux");
  const propositions = `les propositions de la ${NOM_SERVICE_GEOCODAGE} pour « ${params.texteCherche.trim().slice(0, 200)} »`;

  return transaction(() => {
    const situe = modifierPositionLieu(acteur, {
      lieuId: lieu.id,
      latitudeMicrodeg: params.latitudeMicrodeg,
      longitudeMicrodeg: params.longitudeMicrodeg,
      positionSource: "source_externe",
      positionConfiance: "a_confirmer",
      note: params.note.trim().slice(0, 300),
      motif: `Choisi parmi ${propositions}`,
    });
    const voie = params.adresse?.voie.trim() ?? "";
    const aCommune = params.adresse != null && (params.adresse.codePostal.trim() !== "" || params.adresse.ville.trim() !== "");
    if (!params.adresse || (voie === "" && !aCommune)) return situe;
    return modifierAdresseLieu(acteur, {
      lieuId: lieu.id,
      ...(voie === "" ? {} : { adresse: voie }),
      ...(aCommune ? { commune: { codePostal: params.adresse.codePostal, ville: params.adresse.ville } } : {}),
      adresseSource: "source_externe",
      adresseConfiance: "a_confirmer",
      motif: `Adresse de l'endroit choisi parmi ${propositions}`,
    });
  });
}

/**
 * Cherche un endroit d'après un code postal, une commune ou une adresse, et renvoie les
 * propositions du service SANS rien écrire : c'est l'utilisateur qui en choisit une. Un code
 * postal couvre souvent plusieurs communes, et un nom de commune est aussi un nom de rue ailleurs :
 * en prendre une d'office serait en inventer le choix. Seul le texte saisi part. Un code postal
 * seul demande toutes ses communes ; un texte sans chiffre est cherché une seconde fois parmi les
 * seules communes (voir `fusionnerEndroits`).
 */
export async function chercherEndroits(acteur: Acteur, params: { dossierId: string; texte: string }): Promise<Endroit[]> {
  exiger(acteur, params.dossierId, "ecrire", "lieux");
  const texte = params.texte.trim().slice(0, 200);
  if (texte.length < 3) throw invalide("Saisissez au moins trois caractères : un code postal, une commune ou une adresse.");
  if (!/^[\p{L}\p{N}]/u.test(texte)) throw invalide("Commencez par une lettre ou un chiffre : un code postal, une commune ou une adresse.");

  const messages = {
    incompris: "Le service d'adresses n'a pas compris ce texte : essayez un code postal, une commune ou une adresse.",
    indisponible: `${INDISPONIBLE}, ou placez le repère à la main.`,
  };
  // Un code postal seul : toutes ses communes, pour que celle qu'on cherche ne soit pas coupée.
  if (estCodePostal(texte)) {
    const corps = await interroger(urlGeocodage(), { q: texte, type: "municipality", limit: String(NB_COMMUNES_MAX) }, messages);
    return communesDuCodePostal(texte, interpreterResultatsRecherche(corps));
  }
  const [generaux, communes] = await Promise.all([
    interroger(urlGeocodage(), { q: texte, limit: String(NB_ENDROITS_MAX) }, messages),
    /\d/.test(texte) ? Promise.resolve(null) : interroger(urlGeocodage(), { q: texte, type: "municipality", limit: "3" }, messages),
  ]);
  return fusionnerEndroits(texte, interpreterResultatsRecherche(generaux), interpreterResultatsRecherche(communes));
}

/**
 * L'adresse connue la plus proche d'un point, pour le lieu que l'utilisateur est en train de
 * situer sur la carte. Seul le point part. Rien n'est écrit : l'écran montre l'adresse et sa
 * distance, et l'utilisateur décide. `null` si le service n'en connaît aucune à proximité.
 */
export async function adresseLaPlusProche(acteur: Acteur, params: { lieuId: string } & Position): Promise<AdresseProche | null> {
  const lieu = obtenirLieu(acteur, params.lieuId);
  exiger(acteur, lieu.dossierId, "ecrire", "lieux");
  return chercherAdresseProche({ latitudeMicrodeg: params.latitudeMicrodeg, longitudeMicrodeg: params.longitudeMicrodeg });
}

async function chercherAdresseProche(position: Position): Promise<AdresseProche | null> {
  const verdict = validerPosition(position);
  if (!verdict.valide) throw invalide(verdict.motif);
  // Les coordonnées partent en texte décimal construit depuis les entiers : pas de virgule flottante.
  const enTexte = (microdeg: number) => formaterCoordonnee(microdeg).replace(",", ".");
  const corps = await interroger(
    urlGeocodageInverse(),
    { lon: enTexte(position.longitudeMicrodeg), lat: enTexte(position.latitudeMicrodeg), limit: "1" },
    {
      incompris: "Le service d'adresses ne connaît pas cet endroit : il ne couvre que la France.",
      indisponible: `${INDISPONIBLE}.`,
    },
  );
  return interpreterReponseInverse(corps);
}

/**
 * Enregistre la position que l'utilisateur a choisie en cliquant sur la carte, avec les deux
 * réponses de provenance qu'il a données. S'il a demandé à garder l'adresse que l'écran lui
 * montrait (`adresseVue`), elle est redemandée au service et écrite « source externe · à
 * confirmer » dans la même transaction, chaque partie dans son champ (voie, code postal, ville) ;
 * si le service ne renvoie plus cette adresse, rien n'est écrit. Sans `adresseVue`, l'adresse du
 * lieu n'est pas touchée et rien ne part.
 */
export async function situerLieuParClic(
  acteur: Acteur,
  params: { lieuId: string; positionSource?: string; positionConfiance?: string; motif?: string; adresseVue?: string | null } & Position,
): Promise<Lieu> {
  const lieu = obtenirLieu(acteur, params.lieuId);
  exiger(acteur, lieu.dossierId, "ecrire", "lieux");
  const position = { latitudeMicrodeg: params.latitudeMicrodeg, longitudeMicrodeg: params.longitudeMicrodeg };
  const verdict = validerPosition(position);
  if (!verdict.valide) throw invalide(verdict.motif);

  const adresseVue = params.adresseVue?.trim() || null;
  let adresse: AdresseProche | null = null;
  if (adresseVue !== null) {
    adresse = await chercherAdresseProche(position);
    if (!adresse || adresse.libelle !== adresseVue) {
      throw invalide("L'adresse la plus proche n'est plus celle qui était affichée : cliquez de nouveau sur la carte, ou enregistrez la position sans l'adresse.");
    }
  }

  return transaction(() => {
    const situe = modifierPositionLieu(acteur, { lieuId: lieu.id, ...position, positionSource: params.positionSource, positionConfiance: params.positionConfiance, motif: params.motif });
    if (!adresse) return situe;
    const distance = adresse.distanceMetres === null ? "" : `, à ${formaterDistance(adresse.distanceMetres)}`;
    return modifierAdresseLieu(acteur, {
      lieuId: lieu.id,
      ...partiesAEcrire(adresse.parties),
      adresseSource: "source_externe",
      adresseConfiance: "a_confirmer",
      motif: `Adresse connue la plus proche du point choisi sur la carte${distance}, d'après la ${NOM_SERVICE_GEOCODAGE}`,
    });
  });
}
