// Application des droits CÔTÉ SERVEUR. Toute fonction de `src/lib/*` qui lit ou écrit un dossier
// commence par `exiger(acteur, dossierId, action, section)`. La règle elle-même est dans
// `src/domain/droits.ts` (pure) ; ici on la branche sur la base et sur l'acteur.
//
// L'acteur est passé explicitement à chaque fonction (pas de variable globale) : c'est ce qui
// rend les droits testables sans Next.js, et ce qui empêche d'« oublier » le contrôle.

import type { DatabaseSync } from "node:sqlite";
import { obtenirBase, versObjets } from "./db/client";
import { enregistrerEvenement } from "./db/audit";
import { interdit } from "./erreurs";
import { peut, sectionsLisibles, type Action, type Participation, type Role, type Section } from "../domain/droits";

export type Acteur = { personneId: string; nom: string };

export type ParticipationDetaillee = Participation & {
  id: string;
  dossierId: string;
  personneNom: string;
  personneType: string;
  profession: string | null;
  finalite: string | null;
};

export function participationsDe(db: DatabaseSync, dossierId: string): ParticipationDetaillee[] {
  const lignes = versObjets<{
    id: string;
    dossierId: string;
    personneId: string;
    role: Role;
    perimetre: string;
    finalite: string | null;
    revoqueeLe: string | null;
    personneNom: string;
    personneType: string;
    profession: string | null;
  }>(
    db
      .prepare(
        `SELECT pa.id, pa.dossier_id, pa.personne_id, pa.role, pa.perimetre, pa.finalite, pa.revoquee_le,
                pe.nom AS personne_nom, pe.type AS personne_type, pe.profession
         FROM participation pa JOIN personne pe ON pe.id = pa.personne_id
         WHERE pa.dossier_id = ? ORDER BY pa.created_at`,
      )
      .all(dossierId),
  );
  return lignes.map((l) => ({ ...l, perimetre: JSON.parse(l.perimetre) as Section[] }));
}

/**
 * Lève `INTERDIT` si l'acteur ne peut pas faire `action` sur `section` du dossier. Le refus est
 * journalisé (sans détail du contenu), ce qui permet de voir les tentatives d'un professionnel
 * hors de son périmètre.
 */
export function exiger(acteur: Acteur, dossierId: string, action: Action, section: Section): void {
  const db = obtenirBase();
  const participations = participationsDe(db, dossierId);
  if (peut(participations, acteur.personneId, action, section)) return;
  enregistrerEvenement(db, {
    nomEntite: "dossier",
    entiteId: dossierId,
    action: "acces_refuse",
    acteurId: acteur.personneId,
    dossierId,
    motif: `${action} sur ${section}`,
  });
  throw interdit();
}

/** Variante booléenne, pour que l'interface masque ce qui serait refusé. */
export function autorise(acteur: Acteur, dossierId: string, action: Action, section: Section): boolean {
  return peut(participationsDe(obtenirBase(), dossierId), acteur.personneId, action, section);
}

export function sectionsVisibles(acteur: Acteur, dossierId: string): Section[] {
  return sectionsLisibles(participationsDe(obtenirBase(), dossierId), acteur.personneId);
}

/** Identifiants des dossiers auxquels l'acteur participe activement — la seule liste qu'il voit. */
export function dossiersAccessibles(acteur: Acteur): string[] {
  const db = obtenirBase();
  return (
    db
      .prepare(`SELECT dossier_id FROM participation WHERE personne_id = ? AND revoquee_le IS NULL`)
      .all(acteur.personneId) as Array<{ dossier_id: string }>
  ).map((l) => l.dossier_id);
}
