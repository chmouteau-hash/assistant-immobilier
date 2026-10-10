// Qui agit ? — V1 locale : une seule machine, pas d'authentification. L'acteur par défaut est
// l'« utilisateur local » (créé par la migration 002). Pour TESTER les droits (ce que voit un
// notaire, un artisan), un cookie `acteur_simule` permet d'agir en tant qu'une autre personne du
// dossier. Ce n'est PAS une authentification : c'est un simulateur, visible dans l'interface
// (« Vous agissez en tant que… »). Le jour où l'application est hébergée pour plusieurs
// utilisateurs, ce module est remplacé par une vraie session — rien d'autre ne change, car tout
// le reste reçoit un `Acteur` en paramètre.

import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { obtenirBase, versObjet } from "./db/client";
import { exiger, type Acteur } from "./acces";
import { ErreurApplicative } from "./erreurs";
import type { Section } from "../domain/droits";

export const COOKIE_ACTEUR = "acteur_simule";

export function utilisateurLocal(): Acteur {
  const ligne = obtenirBase()
    .prepare(`SELECT id AS personne_id, nom FROM personne WHERE est_utilisateur_local = 1 LIMIT 1`)
    .get() as Record<string, unknown> | undefined;
  if (!ligne) throw new Error("Utilisateur local absent : la migration 002 n'a pas été appliquée.");
  return versObjet<Acteur>(ligne);
}

export async function obtenirActeurCourant(): Promise<Acteur & { simule: boolean }> {
  const local = utilisateurLocal();
  const cookieStore = await cookies();
  const simuleId = cookieStore.get(COOKIE_ACTEUR)?.value;
  if (!simuleId || simuleId === local.personneId) return { ...local, simule: false };

  const ligne = obtenirBase()
    .prepare(`SELECT id AS personne_id, nom FROM personne WHERE id = ?`)
    .get(simuleId) as Record<string, unknown> | undefined;
  if (!ligne) return { ...local, simule: false }; // cookie obsolète : on retombe sur le local
  return { ...versObjet<Acteur>(ligne), simule: true };
}

/**
 * Acteur courant d'une page de section. Si la section lui est interdite, `exiger` journalise le
 * refus, puis la page répond « introuvable » : un dossier inconnu, un dossier interdit et une
 * section interdite se présentent de la même façon. Sans ce rattrapage, l'erreur `INTERDIT` levée
 * par la première lecture remontait telle quelle : erreur serveur 500 (issue #20).
 */
export async function obtenirActeurPourSection(dossierId: string, section: Section): Promise<Acteur & { simule: boolean }> {
  const acteur = await obtenirActeurCourant();
  try {
    exiger(acteur, dossierId, "lire", section);
  } catch (erreur) {
    if (erreur instanceof ErreurApplicative) notFound();
    throw erreur;
  }
  return acteur;
}
