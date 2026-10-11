// Géocodage — poser le repère d'un lieu d'après son adresse, par la Base Adresse Nationale.
//
// Garanties tenues ici :
// 1. Rien ne part sans un geste explicite : ce module n'est appelé que par le bouton « Situer
//    d'après l'adresse » de l'écran Lieux, jamais à l'affichage ni à la saisie. L'application
//    fonctionne sans lui : sans réseau, la position se saisit ou se déplace à la main.
// 2. Seule l'adresse du lieu part, vers un seul service : la Base Adresse Nationale, servie par la
//    Géoplateforme de l'IGN (service public, sans clé ni compte — DECISIONS.md, 2026-10-11).
//    Ni le nom du lieu, ni le nom du dossier, ni rien d'autre.
// 3. Le droit d'écrire les lieux est vérifié AVANT l'appel réseau : un acteur qui ne peut pas
//    poser le repère ne fait pas non plus partir l'adresse.
// 4. La position obtenue est écrite comme toute provenance : « source externe · à confirmer »,
//    avec l'adresse telle que le service l'a comprise en note, et un événement d'audit qui dit
//    d'où elle vient. Pas de résultat : rien n'est écrit, aucune position n'est inventée.
//
// Variable d'environnement facultative : ASSISTANT_GEOCODAGE_URL, si le service change d'adresse.

import { exiger, type Acteur } from "./acces";
import { invalide, serviceIndisponible } from "./erreurs";
import { modifierPositionLieu, obtenirLieu, type Lieu } from "./structure";
import { interpreterReponseGeocodage } from "../domain/geo";

export const NOM_SERVICE_GEOCODAGE = "Base Adresse Nationale (Géoplateforme IGN)";
const URL_PAR_DEFAUT = "https://data.geopf.fr/geocodage/search";
const DELAI_MS = 8_000;

export function urlGeocodage(): string {
  return process.env.ASSISTANT_GEOCODAGE_URL || URL_PAR_DEFAUT;
}

const MESSAGE_INDISPONIBLE = "Le service d'adresses ne répond pas : vérifiez la connexion, ou placez le repère à la main.";

/**
 * Envoie l'adresse du lieu au service et enregistre la première correspondance comme position
 * « source externe · à confirmer ». Lève `VALIDATION` sans adresse ou si aucune adresse ne
 * correspond, `SERVICE_INDISPONIBLE` si le service ne répond pas.
 */
export async function situerLieuDepuisAdresse(acteur: Acteur, params: { lieuId: string }): Promise<Lieu> {
  const lieu = obtenirLieu(acteur, params.lieuId);
  exiger(acteur, lieu.dossierId, "ecrire", "lieux");
  const adresse = lieu.adresse.valeur?.trim() ?? "";
  if (adresse === "") throw invalide("Ce lieu n'a pas d'adresse : renseignez-la d'abord, ou saisissez sa position.");
  if (adresse.length < 3) throw invalide("L'adresse est trop courte pour être cherchée : complétez-la, ou saisissez la position.");

  let reponse: Response;
  try {
    const url = new URL(urlGeocodage());
    url.searchParams.set("q", adresse.slice(0, 200));
    url.searchParams.set("limit", "1");
    reponse = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(DELAI_MS) });
  } catch {
    throw serviceIndisponible(MESSAGE_INDISPONIBLE);
  }
  if (reponse.status === 400) throw invalide("Le service d'adresses n'a pas compris cette adresse : vérifiez-la, ou saisissez la position.");
  if (!reponse.ok) throw serviceIndisponible(MESSAGE_INDISPONIBLE);

  let corps: unknown;
  try {
    corps = await reponse.json();
  } catch {
    throw serviceIndisponible(MESSAGE_INDISPONIBLE);
  }
  const resultat = interpreterReponseGeocodage(corps);
  if (!resultat) throw invalide("Adresse non reconnue par la Base Adresse Nationale : vérifiez-la, ou placez le repère à la main.");

  return modifierPositionLieu(acteur, {
    lieuId: lieu.id,
    latitudeMicrodeg: resultat.position.latitudeMicrodeg,
    longitudeMicrodeg: resultat.position.longitudeMicrodeg,
    positionSource: "source_externe",
    positionConfiance: "a_confirmer",
    note: resultat.libelle,
    motif: `Situé d'après l'adresse par la ${NOM_SERVICE_GEOCODAGE}${resultat.score === null ? "" : ` (score ${Math.round(resultat.score * 100)} %)`}`,
  });
}
