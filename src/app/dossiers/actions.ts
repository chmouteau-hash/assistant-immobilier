"use server";

// Server Actions — point d'entrée unique de tout changement d'état. Chaque action :
// 1. résout l'acteur courant (côté serveur, jamais depuis un champ du formulaire) ;
// 2. appelle une fonction de `src/lib/*`, qui applique les droits et valide ;
// 3. traduit une `ErreurApplicative` en message pour le formulaire ; laisse remonter le reste.
//
// Les Server Actions sont joignables par requête POST directe, pas seulement depuis l'interface
// (doc Next.js, « Mutating data ») : c'est pourquoi la vérification des droits est dans la lib,
// pas ici ni dans les composants.

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_ACTEUR, obtenirActeurCourant } from "@/lib/acteur-courant";
import { ErreurApplicative } from "@/lib/erreurs";
import { parserMontant } from "@/lib/montant";
import { parserSurface } from "@/domain/mesure";
import { parserCoordonnee, type AdresseProche, type Endroit, type Position } from "@/domain/geo";
import * as dossiers from "@/lib/dossiers";
import * as personnes from "@/lib/personnes";
import * as structure from "@/lib/structure";
import * as geocodage from "@/lib/geocodage";
import * as idees from "@/lib/idees";
import * as budget from "@/lib/budget";
import * as taches from "@/lib/taches";
import * as documents from "@/lib/documents";
import * as ia from "@/lib/ia";

export type EtatFormulaire = { erreur: string | null; ok?: boolean };

const texte = (fd: FormData, nom: string): string => String(fd.get(nom) ?? "").trim();
const texteOuNull = (fd: FormData, nom: string): string | null => texte(fd, nom) || null;
const liste = (fd: FormData, nom: string): string[] => fd.getAll(nom).map(String).filter((x) => x !== "");
// Un champ absent du formulaire n'est pas touché. Une liste (scénarios, bâtiments…) n'est proposée
// qu'à qui peut la lire ; sans elle, la correction laisse le rattachement tel qu'il est.
const siPresent = (fd: FormData, nom: string): string | undefined => (fd.has(nom) ? texte(fd, nom) : undefined);

async function executer(dossierId: string | null, fn: (acteur: Awaited<ReturnType<typeof obtenirActeurCourant>>) => void | Promise<void>): Promise<EtatFormulaire> {
  try {
    const acteur = await obtenirActeurCourant();
    await fn(acteur);
    if (dossierId) revalidatePath(`/dossiers/${dossierId}`, "layout");
    revalidatePath("/");
    revalidatePath("/dossiers");
    return { erreur: null, ok: true };
  } catch (erreur) {
    if (erreur instanceof ErreurApplicative) return { erreur: erreur.message, ok: false };
    throw erreur;
  }
}

// --- Acteur simulé (V1 locale) --------------------------------------------------------------------

export async function actionChoisirActeur(donnees: FormData): Promise<void> {
  const store = await cookies();
  const id = texte(donnees, "personneId");
  if (id === "") store.delete(COOKIE_ACTEUR);
  else store.set(COOKIE_ACTEUR, id, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
  redirect("/");
}

// --- Dossier ------------------------------------------------------------------------------------------

export async function actionCreerDossier(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  let id: string | null = null;
  const etat = await executer(null, (acteur) => {
    id = dossiers.creerDossier(acteur, { nom: texte(fd, "nom"), objectif: texte(fd, "objectif"), stade: texte(fd, "stade"), typeProjet: texte(fd, "typeProjet") }).id;
  });
  if (id) redirect(`/dossiers/${id}`);
  return etat;
}

export async function actionModifierDossier(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const id = texte(fd, "dossierId");
  return executer(id, (acteur) => {
    const tauxBrut = texte(fd, "tauxImprevusPourcent");
    const taux = tauxBrut === "" ? undefined : Math.round(Number.parseFloat(tauxBrut.replace(",", ".")) * 10);
    dossiers.modifierDossier(acteur, id, {
      nom: texte(fd, "nom"),
      objectif: texte(fd, "objectif"),
      stade: texte(fd, "stade"),
      typeProjet: texte(fd, "typeProjet"),
      tauxImprevusPourMille: taux !== undefined && Number.isFinite(taux) ? taux : undefined,
    });
  });
}

export async function actionSupprimerDossier(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const id = texte(fd, "dossierId");
  let supprime = false;
  const etat = await executer(null, (acteur) => {
    dossiers.supprimerDossier(acteur, { dossierId: id, confirmationNom: texte(fd, "confirmationNom"), motif: texte(fd, "motif") });
    supprime = true;
  });
  if (supprime) redirect("/dossiers");
  return etat;
}

export async function actionConfigurerIA(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const id = texte(fd, "dossierId");
  return executer(id, (acteur) => {
    dossiers.configurerIA(acteur, id, { activee: fd.get("activee") === "on", perimetre: liste(fd, "perimetre"), fournisseur: texte(fd, "fournisseur") || "regles_locales" });
  });
}

// --- Personnes et droits -------------------------------------------------------------------------------

export async function actionInviterPersonne(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const dossierId = texte(fd, "dossierId");
  return executer(dossierId, (acteur) => {
    personnes.inviterPersonne(acteur, {
      dossierId,
      personneId: texteOuNull(fd, "personneId") ?? undefined,
      nom: texte(fd, "nom"),
      type: texte(fd, "type"),
      profession: texte(fd, "profession"),
      email: texte(fd, "email"),
      role: texte(fd, "role"),
      perimetre: liste(fd, "perimetre"),
      finalite: texte(fd, "finalite"),
    });
  });
}

export async function actionModifierParticipation(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    personnes.modifierParticipation(acteur, { participationId: texte(fd, "participationId"), role: texte(fd, "role"), perimetre: liste(fd, "perimetre"), finalite: texte(fd, "finalite"), motif: texte(fd, "motif") });
  });
}

export async function actionRevoquerParticipation(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    personnes.revoquerParticipation(acteur, { participationId: texte(fd, "participationId"), motif: texte(fd, "motif") });
  });
}

// --- Lieux, bâtiments, pièces ------------------------------------------------------------------------------

export async function actionCreerLieu(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const dossierId = texte(fd, "dossierId");
  return executer(dossierId, (acteur) => {
    structure.creerLieu(acteur, { dossierId, nom: texte(fd, "nom"), typeLieu: texte(fd, "typeLieu"), adresse: texte(fd, "adresse"), adresseSource: texte(fd, "adresseSource"), adresseConfiance: texte(fd, "adresseConfiance"), parcelle: texte(fd, "parcelle"), description: texte(fd, "description") });
  });
}

export async function actionModifierLieu(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    structure.modifierLieu(acteur, { lieuId: texte(fd, "lieuId"), nom: texte(fd, "nom"), typeLieu: texte(fd, "typeLieu"), parcelle: texte(fd, "parcelle"), description: texte(fd, "description") });
  });
}

export async function actionModifierAdresse(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    structure.modifierAdresseLieu(acteur, { lieuId: texte(fd, "lieuId"), adresse: texte(fd, "adresse"), adresseSource: texte(fd, "adresseSource"), adresseConfiance: texte(fd, "adresseConfiance"), motif: texte(fd, "motif") });
  });
}

function coordonneeDepuis(fd: FormData, nom: string, exemple: string): number | null {
  const brut = texte(fd, nom);
  if (brut === "") return null;
  const microdeg = parserCoordonnee(brut);
  if (microdeg === null) throw new ErreurApplicative("VALIDATION", `Coordonnée invalide : « ${brut} ». Exemple attendu : ${exemple}`);
  return microdeg;
}

export async function actionModifierPosition(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    structure.modifierPositionLieu(acteur, {
      lieuId: texte(fd, "lieuId"),
      latitudeMicrodeg: coordonneeDepuis(fd, "latitude", "48,868546"),
      longitudeMicrodeg: coordonneeDepuis(fd, "longitude", "2,33031"),
      positionSource: texte(fd, "positionSource"),
      positionConfiance: texte(fd, "positionConfiance"),
      // D'après quoi le repère est posé : rempli quand l'endroit vient de la liste de recherche.
      note: texte(fd, "note") || undefined,
      motif: texte(fd, "motif"),
    });
  });
}

// L'adresse part vers le service d'adresses seulement ici, sur ce bouton (lib/geocodage.ts).
export async function actionSituerDepuisAdresse(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), async (acteur) => {
    await geocodage.situerLieuDepuisAdresse(acteur, { lieuId: texte(fd, "lieuId") });
  });
}

// Chercher un endroit (code postal, commune, adresse) : seul le texte saisi part, et rien n'est
// écrit. La liste revient au composant ; choisir un endroit passe ensuite par
// `actionModifierPosition`, avec sa provenance. Cette action renvoie des données : elle n'emploie
// donc pas `executer`, mais traite les erreurs de la même façon.
export type EtatRecherche = { erreur: string | null; texte: string; resultats: Endroit[] | null };

export async function actionChercherEndroit(_e: EtatRecherche, fd: FormData): Promise<EtatRecherche> {
  const recherche = texte(fd, "recherche");
  try {
    const acteur = await obtenirActeurCourant();
    return { erreur: null, texte: recherche, resultats: await geocodage.chercherEndroits(acteur, { dossierId: texte(fd, "dossierId"), texte: recherche }) };
  } catch (erreur) {
    if (erreur instanceof ErreurApplicative) return { erreur: erreur.message, texte: recherche, resultats: null };
    throw erreur;
  }
}

function positionDepuis(fd: FormData): Position {
  const latitudeMicrodeg = coordonneeDepuis(fd, "latitude", "48,868546");
  const longitudeMicrodeg = coordonneeDepuis(fd, "longitude", "2,33031");
  if (latitudeMicrodeg === null || longitudeMicrodeg === null) throw new ErreurApplicative("VALIDATION", "Choisissez un point sur la carte.");
  return { latitudeMicrodeg, longitudeMicrodeg };
}

// L'adresse connue la plus proche d'un point cliqué sur la carte : seul le point part, et rien
// n'est écrit. Appelée directement par la carte, pas par un formulaire.
export type EtatAdresseProche = { erreur: string | null; adresse: AdresseProche | null };

export async function actionAdresseLaPlusProche(fd: FormData): Promise<EtatAdresseProche> {
  try {
    const acteur = await obtenirActeurCourant();
    return { erreur: null, adresse: await geocodage.adresseLaPlusProche(acteur, { lieuId: texte(fd, "lieuId"), ...positionDepuis(fd) }) };
  } catch (erreur) {
    if (erreur instanceof ErreurApplicative) return { erreur: erreur.message, adresse: null };
    throw erreur;
  }
}

// Enregistrer le point choisi sur la carte. L'adresse montrée à l'écran n'est écrite que si la
// case est cochée : sans elle, `adresseVue` ne part pas, et l'adresse du lieu n'est pas touchée.
export async function actionSituerParClic(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), async (acteur) => {
    await geocodage.situerLieuParClic(acteur, {
      lieuId: texte(fd, "lieuId"),
      ...positionDepuis(fd),
      positionSource: texte(fd, "positionSource"),
      positionConfiance: texte(fd, "positionConfiance"),
      motif: texte(fd, "motif"),
      adresseVue: fd.get("adopterAdresse") === "on" ? texte(fd, "adresseVue") : null,
    });
  });
}

export async function actionCreerBatiment(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const dossierId = texte(fd, "dossierId");
  return executer(dossierId, (acteur) => {
    structure.creerBatiment(acteur, { dossierId, lieuId: texteOuNull(fd, "lieuId"), nom: texte(fd, "nom"), type: texte(fd, "type"), usageActuel: texte(fd, "usageActuel"), usageEnvisage: texte(fd, "usageEnvisage"), etat: texte(fd, "etat"), description: texte(fd, "description") });
  });
}

export async function actionModifierBatiment(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    structure.modifierBatiment(acteur, { batimentId: texte(fd, "batimentId"), nom: texte(fd, "nom"), type: texte(fd, "type"), etat: texte(fd, "etat"), usageActuel: texte(fd, "usageActuel"), usageEnvisage: texte(fd, "usageEnvisage") });
  });
}

export async function actionRattacherBatiment(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const dossierId = texte(fd, "dossierId");
  return executer(dossierId, (acteur) => {
    structure.rattacherBatiment(acteur, { batimentId: texte(fd, "batimentId"), lieuId: texte(fd, "lieuId") });
  });
}

function surfaceDepuis(fd: FormData): number | null {
  const brut = texte(fd, "surface");
  if (brut === "") return null;
  const centiemes = parserSurface(brut);
  if (centiemes === null) throw new ErreurApplicative("VALIDATION", `Surface invalide : « ${brut} ». Exemple attendu : 92,5`);
  return centiemes;
}

export async function actionCreerPiece(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const dossierId = texte(fd, "dossierId");
  return executer(dossierId, (acteur) => {
    structure.creerPiece(acteur, { dossierId, batimentId: texte(fd, "batimentId"), nom: texte(fd, "nom"), usage: texte(fd, "usage"), surfaceCentiemes: surfaceDepuis(fd), surfaceSource: texte(fd, "surfaceSource"), surfaceConfiance: texte(fd, "surfaceConfiance"), description: texte(fd, "description") });
  });
}

export async function actionModifierPiece(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    structure.modifierPiece(acteur, { pieceId: texte(fd, "pieceId"), nom: texte(fd, "nom"), usage: texte(fd, "usage"), batimentId: texte(fd, "batimentId") });
  });
}

export async function actionModifierSurface(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    structure.modifierSurfacePiece(acteur, { pieceId: texte(fd, "pieceId"), surfaceCentiemes: surfaceDepuis(fd), surfaceSource: texte(fd, "surfaceSource"), surfaceConfiance: texte(fd, "surfaceConfiance"), motif: texte(fd, "motif") });
  });
}

export async function actionRetirerLieu(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    structure.retirerLieu(acteur, { lieuId: texte(fd, "lieuId") });
  });
}

export async function actionRetirerBatiment(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    structure.retirerBatiment(acteur, { batimentId: texte(fd, "batimentId") });
  });
}

export async function actionRetirerPiece(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    structure.retirerPiece(acteur, { pieceId: texte(fd, "pieceId") });
  });
}

// --- Idées ---------------------------------------------------------------------------------------------------

export async function actionCreerIdee(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const dossierId = texte(fd, "dossierId");
  return executer(dossierId, (acteur) => {
    idees.creerIdee(acteur, { dossierId, titre: texte(fd, "titre"), description: texte(fd, "description"), scenarioId: texteOuNull(fd, "scenarioId"), batimentId: texteOuNull(fd, "batimentId"), pieceId: texteOuNull(fd, "pieceId"), source: texte(fd, "source") });
  });
}

export async function actionChangerStatutIdee(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    idees.changerStatutIdee(acteur, { ideeId: texte(fd, "ideeId"), nouveauStatut: texte(fd, "statut"), motif: texte(fd, "motif") });
  });
}

// Sert aux deux formulaires d'une idée : « Corriger » (titre, description) et « Rattacher »
// (scénario, bâtiment). Chacun n'envoie que ses champs.
export async function actionModifierIdee(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    idees.modifierIdee(acteur, { ideeId: texte(fd, "ideeId"), titre: siPresent(fd, "titre"), description: siPresent(fd, "description"), scenarioId: siPresent(fd, "scenarioId"), batimentId: siPresent(fd, "batimentId") });
  });
}

// --- Scénarios, hypothèses ----------------------------------------------------------------------------------------

export async function actionCreerScenario(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const dossierId = texte(fd, "dossierId");
  return executer(dossierId, (acteur) => {
    dossiers.creerScenario(acteur, { dossierId, nom: texte(fd, "nom"), description: texte(fd, "description") });
  });
}

export async function actionModifierScenario(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    dossiers.modifierScenario(acteur, { scenarioId: texte(fd, "scenarioId"), nom: texte(fd, "nom"), description: texte(fd, "description") });
  });
}

export async function actionChangerStatutScenario(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    dossiers.changerStatutScenario(acteur, { scenarioId: texte(fd, "scenarioId"), nouveauStatut: texte(fd, "statut"), motif: texte(fd, "motif"), alternativesEcartees: texte(fd, "alternativesEcartees"), conditionsOuvertes: texte(fd, "conditionsOuvertes") });
  });
}

export async function actionAjouterHypothese(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const dossierId = texte(fd, "dossierId");
  return executer(dossierId, (acteur) => {
    dossiers.ajouterHypothese(acteur, { dossierId, scenarioId: texteOuNull(fd, "scenarioId"), enonce: texte(fd, "enonce"), source: texte(fd, "source") });
  });
}

export async function actionChangerStatutHypothese(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    dossiers.changerStatutHypothese(acteur, { hypotheseId: texte(fd, "hypotheseId"), statut: texte(fd, "statut"), motif: texte(fd, "motif") });
  });
}

// --- Budget --------------------------------------------------------------------------------------------------------

export async function actionCreerPoste(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    budget.creerPoste(acteur, { scenarioId: texte(fd, "scenarioId"), nom: texte(fd, "nom"), categorie: texte(fd, "categorie"), batimentId: texteOuNull(fd, "batimentId") });
  });
}

export async function actionModifierPoste(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    budget.modifierPoste(acteur, { posteId: texte(fd, "posteId"), nom: texte(fd, "nom"), categorie: texte(fd, "categorie"), batimentId: siPresent(fd, "batimentId") });
  });
}

export async function actionSolderPoste(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    budget.solderPoste(acteur, { posteId: texte(fd, "posteId"), motif: texte(fd, "motif") });
  });
}

export async function actionRouvrirPoste(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    budget.rouvrirPoste(acteur, { posteId: texte(fd, "posteId"), motif: texte(fd, "motif") });
  });
}

export async function actionAjouterLigne(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    const brut = texte(fd, "montant");
    const montantCentimes = parserMontant(brut);
    if (montantCentimes === null) throw new ErreurApplicative("VALIDATION", `Montant invalide : « ${brut} ». Exemple attendu : 1250,50`);
    budget.ajouterLigne(acteur, { posteId: texte(fd, "posteId"), montantCentimes, typeMontant: texte(fd, "typeMontant"), source: texte(fd, "source"), confiance: texte(fd, "confiance") || undefined, datePiece: texteOuNull(fd, "datePiece"), fournisseur: texteOuNull(fd, "fournisseur"), motif: texte(fd, "motif") });
  });
}

export async function actionModifierLigne(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    const brut = texte(fd, "montant");
    const montantCentimes = brut === "" ? undefined : parserMontant(brut);
    if (montantCentimes === null) throw new ErreurApplicative("VALIDATION", `Montant invalide : « ${brut} ». Exemple attendu : 1250,50`);
    budget.modifierLigne(acteur, {
      ligneId: texte(fd, "ligneId"),
      montantCentimes,
      typeMontant: texte(fd, "typeMontant") || undefined,
      source: texte(fd, "source") || undefined,
      confiance: texte(fd, "confiance") || undefined,
      datePiece: texte(fd, "datePiece"),
      fournisseur: texte(fd, "fournisseur"),
      statut: texte(fd, "statut") || undefined,
      motif: texte(fd, "motif"),
    });
  });
}

// --- Actions et planning -------------------------------------------------------------------------------------------

export async function actionCreerTache(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const dossierId = texte(fd, "dossierId");
  return executer(dossierId, (acteur) => {
    taches.creerTache(acteur, { dossierId, scenarioId: texteOuNull(fd, "scenarioId"), description: texte(fd, "description"), echeance: texteOuNull(fd, "echeance"), responsable: texteOuNull(fd, "responsable"), estJalon: fd.get("estJalon") === "on", dependDeIds: liste(fd, "dependDe") });
  });
}

export async function actionModifierTache(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    taches.modifierTache(acteur, {
      tacheId: texte(fd, "tacheId"),
      description: texte(fd, "description"),
      echeance: texte(fd, "echeance"),
      responsable: texte(fd, "responsable"),
      scenarioId: siPresent(fd, "scenarioId"),
      estJalon: fd.get("estJalon") === "on",
    });
  });
}

export async function actionAjouterDependance(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    taches.ajouterDependance(acteur, { tacheId: texte(fd, "tacheId"), dependDeId: texte(fd, "dependDeId") });
  });
}

export async function actionRetirerDependance(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    taches.retirerDependance(acteur, { tacheId: texte(fd, "tacheId"), dependDeId: texte(fd, "dependDeId") });
  });
}

export async function actionChangerStatutTache(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    taches.changerStatutTache(acteur, { tacheId: texte(fd, "tacheId"), nouveauStatut: texte(fd, "statut") });
  });
}

// --- Documents -------------------------------------------------------------------------------------------------------

export async function actionDeposerDocument(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const dossierId = texte(fd, "dossierId");
  return executer(dossierId, async (acteur) => {
    const fichier = fd.get("fichier");
    if (!(fichier instanceof File) || fichier.size === 0) throw new ErreurApplicative("VALIDATION", "Choisissez un fichier.");
    documents.deposerDocument(acteur, {
      dossierId,
      nomOriginal: fichier.name,
      mime: fichier.type || "application/octet-stream",
      octets: Buffer.from(await fichier.arrayBuffer()),
      typeDocument: texte(fd, "typeDocument"),
      dateDocument: texteOuNull(fd, "dateDocument"),
      note: texte(fd, "note"),
      lieuId: texteOuNull(fd, "lieuId"),
      batimentId: texteOuNull(fd, "batimentId"),
      pieceId: texteOuNull(fd, "pieceId"),
      scenarioId: texteOuNull(fd, "scenarioId"),
      posteId: texteOuNull(fd, "posteId"),
      ideeId: texteOuNull(fd, "ideeId"),
      tacheId: texteOuNull(fd, "tacheId"),
    });
  });
}

export async function actionModifierDocument(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    documents.modifierDocument(acteur, {
      documentId: texte(fd, "documentId"),
      typeDocument: texte(fd, "typeDocument") || undefined,
      dateDocument: texte(fd, "dateDocument"),
      note: texte(fd, "note"),
      lieuId: siPresent(fd, "lieuId"),
      batimentId: siPresent(fd, "batimentId"),
      pieceId: siPresent(fd, "pieceId"),
      scenarioId: siPresent(fd, "scenarioId"),
      posteId: siPresent(fd, "posteId"),
      ideeId: siPresent(fd, "ideeId"),
      tacheId: siPresent(fd, "tacheId"),
    });
  });
}

const CHAMPS = ["montant_centimes", "date", "fournisseur", "poste", "type_montant"] as const;

export async function actionProposerExtraction(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    const champs: Partial<Record<(typeof CHAMPS)[number], string>> = {};
    for (const c of CHAMPS) champs[c] = texte(fd, c);
    documents.proposerExtraction(acteur, { documentId: texte(fd, "documentId"), champs, source: "saisie" });
  });
}

export async function actionValiderExtraction(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return executer(texte(fd, "dossierId"), (acteur) => {
    const corrections: Partial<Record<(typeof CHAMPS)[number], string>> = {};
    for (const c of CHAMPS) corrections[c] = texte(fd, c);
    documents.validerExtraction(acteur, { documentId: texte(fd, "documentId"), corrections, motif: texte(fd, "motif") });
  });
}

// --- Assistant IA ------------------------------------------------------------------------------------------------------

export async function actionDemanderAssistant(_e: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const dossierId = texte(fd, "dossierId");
  return executer(dossierId, async (acteur) => {
    await ia.demanderAssistant(acteur, dossierId, texte(fd, "question"));
  });
}
