// Personnes et participations — priorité 1 (« ajouter personnes… rôles configurables ») et
// contrainte « accès professionnels limités aux données autorisées par le client, révocables ».

import { randomUUID } from "node:crypto";
import { obtenirBase, transaction, versObjets } from "./db/client";
import { enregistrerEvenement } from "./db/audit";
import { exiger, participationsDe, type Acteur, type ParticipationDetaillee } from "./acces";
import { invalide, introuvable } from "./erreurs";
import { estRole, estSection, peutRetirerProprietaire, type Role, type Section } from "../domain/droits";

export type Personne = {
  id: string;
  nom: string;
  email: string | null;
  type: string;
  profession: string | null;
  estUtilisateurLocal: boolean;
};

const COLONNES = `id, nom, email, type, profession, est_utilisateur_local`;

function hydrater(lignes: unknown[]): Personne[] {
  return versObjets<Omit<Personne, "estUtilisateurLocal"> & { estUtilisateurLocal: number }>(lignes).map((p) => ({
    ...p,
    estUtilisateurLocal: p.estUtilisateurLocal === 1,
  }));
}

/** Personnes participant au dossier (actives ou révoquées), avec leur rôle. */
export function listerParticipations(acteur: Acteur, dossierId: string): ParticipationDetaillee[] {
  exiger(acteur, dossierId, "lire", "personnes");
  return participationsDe(obtenirBase(), dossierId);
}

/** Personnes connues de la base et PAS encore dans ce dossier — pour inviter sans doublon. */
export function listerPersonnesInvitables(acteur: Acteur, dossierId: string): Personne[] {
  exiger(acteur, dossierId, "gerer_droits", "droits");
  return hydrater(
    obtenirBase()
      .prepare(
        `SELECT ${COLONNES} FROM personne
         WHERE id NOT IN (SELECT personne_id FROM participation WHERE dossier_id = ?)
         ORDER BY nom`,
      )
      .all(dossierId),
  );
}

function perimetreValide(brut: string[] | undefined, role: Role): Section[] {
  if (role !== "professionnel") return [];
  const sections = (brut ?? []).filter(estSection);
  if (sections.length === 0) throw invalide("Un professionnel doit avoir au moins une section autorisée.");
  return sections;
}

/**
 * Ajoute une personne au dossier : nouvelle (nom, type, profession) ou existante (`personneId`).
 * Pour un professionnel, `perimetre` (sections visibles) et `finalite` (sa mission) sont requis :
 * c'est la traduction du principe « il voit uniquement les informations nécessaires à sa mission ».
 */
export function inviterPersonne(
  acteur: Acteur,
  params: {
    dossierId: string;
    personneId?: string;
    nom?: string;
    type?: string;
    profession?: string;
    email?: string;
    role: string;
    perimetre?: string[];
    finalite?: string;
  },
): ParticipationDetaillee {
  exiger(acteur, params.dossierId, "gerer_droits", "droits");
  if (!estRole(params.role)) throw invalide(`Rôle inconnu : ${params.role}`);
  const role = params.role;
  const perimetre = perimetreValide(params.perimetre, role);
  const finalite = params.finalite?.trim() || null;
  if (role === "professionnel" && !finalite) throw invalide("La mission du professionnel (finalité) est obligatoire.");

  return transaction((db) => {
    let personneId = params.personneId?.trim() || null;
    if (!personneId) {
      const nom = params.nom?.trim() ?? "";
      if (nom === "") throw invalide("Le nom de la personne est obligatoire.");
      const type = params.type && ["particulier", "professionnel", "societe"].includes(params.type) ? params.type : "particulier";
      personneId = randomUUID();
      db.prepare(`INSERT INTO personne (id, nom, email, type, profession) VALUES (?, ?, ?, ?, ?)`).run(
        personneId,
        nom,
        params.email?.trim() || null,
        type,
        params.profession?.trim() || null,
      );
      enregistrerEvenement(db, { nomEntite: "personne", entiteId: personneId, action: "creation", acteurId: acteur.personneId, dossierId: params.dossierId });
    }
    const existante = db
      .prepare(`SELECT id FROM participation WHERE dossier_id = ? AND personne_id = ?`)
      .get(params.dossierId, personneId) as { id: string } | undefined;
    if (existante) throw invalide("Cette personne participe déjà au dossier (modifiez son rôle ou réactivez-la).");

    const id = randomUUID();
    db.prepare(
      `INSERT INTO participation (id, dossier_id, personne_id, role, perimetre, finalite) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, params.dossierId, personneId, role, JSON.stringify(perimetre), finalite);
    enregistrerEvenement(db, {
      nomEntite: "participation",
      entiteId: id,
      action: "creation",
      acteurId: acteur.personneId,
      dossierId: params.dossierId,
      changements: [
        { champ: "role", avant: null, apres: role },
        { champ: "perimetre", avant: null, apres: JSON.stringify(perimetre) },
      ],
    });
    const p = participationsDe(db, params.dossierId).find((x) => x.id === id);
    if (!p) throw introuvable("Participation");
    return p;
  });
}

export function modifierParticipation(
  acteur: Acteur,
  params: { participationId: string; role: string; perimetre?: string[]; finalite?: string; motif: string },
): ParticipationDetaillee {
  const motif = params.motif.trim();
  if (motif === "") throw invalide("Un motif est obligatoire pour changer un droit d'accès.");
  if (!estRole(params.role)) throw invalide(`Rôle inconnu : ${params.role}`);
  const role = params.role;

  const db = obtenirBase();
  const brute = db.prepare(`SELECT dossier_id, personne_id FROM participation WHERE id = ?`).get(params.participationId) as
    | { dossier_id: string; personne_id: string }
    | undefined;
  if (!brute) throw introuvable("Participation");
  exiger(acteur, brute.dossier_id, "gerer_droits", "droits");

  const participations = participationsDe(db, brute.dossier_id);
  const avant = participations.find((p) => p.id === params.participationId)!;
  if (avant.role === "proprietaire" && role !== "proprietaire" && !peutRetirerProprietaire(participations, avant.personneId)) {
    throw invalide("Impossible de rétrograder le dernier propriétaire du dossier.");
  }
  const perimetre = perimetreValide(params.perimetre, role);

  return transaction((tx) => {
    tx.prepare(`UPDATE participation SET role = ?, perimetre = ?, finalite = ? WHERE id = ?`).run(
      role,
      JSON.stringify(perimetre),
      params.finalite?.trim() || avant.finalite,
      params.participationId,
    );
    enregistrerEvenement(tx, {
      nomEntite: "participation",
      entiteId: params.participationId,
      action: "modification",
      acteurId: acteur.personneId,
      dossierId: brute.dossier_id,
      motif,
      changements: [
        { champ: "role", avant: avant.role, apres: role },
        { champ: "perimetre", avant: JSON.stringify(avant.perimetre), apres: JSON.stringify(perimetre) },
      ],
    });
    return participationsDe(tx, brute.dossier_id).find((p) => p.id === params.participationId)!;
  });
}

/** Révoque un accès (la ligne reste : on garde l'historique de qui a eu accès à quoi, et quand). */
export function revoquerParticipation(acteur: Acteur, params: { participationId: string; motif: string }): void {
  const motif = params.motif.trim();
  if (motif === "") throw invalide("Un motif est obligatoire pour révoquer un accès.");
  const db = obtenirBase();
  const brute = db.prepare(`SELECT dossier_id, personne_id FROM participation WHERE id = ?`).get(params.participationId) as
    | { dossier_id: string; personne_id: string }
    | undefined;
  if (!brute) throw introuvable("Participation");
  exiger(acteur, brute.dossier_id, "gerer_droits", "droits");

  const participations = participationsDe(db, brute.dossier_id);
  if (!peutRetirerProprietaire(participations, brute.personne_id)) {
    throw invalide("Impossible de révoquer le dernier propriétaire du dossier.");
  }

  transaction((tx) => {
    tx.prepare(`UPDATE participation SET revoquee_le = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND revoquee_le IS NULL`).run(
      params.participationId,
    );
    enregistrerEvenement(tx, {
      nomEntite: "participation",
      entiteId: params.participationId,
      action: "revocation",
      acteurId: acteur.personneId,
      dossierId: brute.dossier_id,
      motif,
    });
  });
}

/** Toutes les personnes de la base (pour le sélecteur « agir en tant que » de la V1 locale). */
export function listerToutesPersonnes(): Personne[] {
  return hydrater(obtenirBase().prepare(`SELECT ${COLONNES} FROM personne ORDER BY est_utilisateur_local DESC, nom`).all());
}
