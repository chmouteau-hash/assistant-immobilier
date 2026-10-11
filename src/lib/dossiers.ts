// Dossiers, scénarios, hypothèses, décisions — accès aux données avec contrôle des droits.
// Les pages et Server Actions n'appellent que ces fonctions ; aucune requête SQL ailleurs.

import { randomUUID } from "node:crypto";
import { existsSync, rmSync, unlinkSync } from "node:fs";
import path from "node:path";
import { cheminFichiers, obtenirBase, transaction, versObjet, versObjets } from "./db/client";
import { enregistrerEvenement, historiqueDe, journalDossier, type EvenementAudit } from "./db/audit";
import { autorise, dossiersAccessibles, exiger, sectionsVisibles, type Acteur } from "./acces";
import { interdit, introuvable, invalide } from "./erreurs";
import { estSection, type Section } from "../domain/droits";
import { estSource } from "../domain/provenance";
import { SECTIONS_NON_TRANSMISSIBLES } from "../domain/ia/types";

export type Dossier = {
  id: string;
  nom: string;
  objectif: string | null;
  stade: string | null;
  typeProjet: string | null;
  iaActivee: boolean;
  iaPerimetre: Section[];
  iaFournisseur: string;
  tauxImprevusPourMille: number;
  createdAt: string;
};

export type Scenario = {
  id: string;
  dossierId: string;
  nom: string;
  description: string | null;
  statut: string;
  source: string;
  createdAt: string;
};

export type Hypothese = {
  id: string;
  dossierId: string;
  scenarioId: string | null;
  ideeId: string | null;
  enonce: string;
  statut: string;
  source: string;
  createdAt: string;
};

export type Decision = {
  id: string;
  dossierId: string;
  scenarioId: string | null;
  ideeId: string | null;
  choix: string;
  motif: string;
  alternativesEcartees: string | null;
  conditionsOuvertes: string | null;
  decidePar: string | null;
  dateDecision: string;
};

const COLONNES_DOSSIER = `id, nom, objectif, stade, type_projet, ia_activee, ia_perimetre, ia_fournisseur, taux_imprevus_pour_mille, created_at`;
const COLONNES_SCENARIO = `id, dossier_id, nom, description, statut, source, created_at`;
const COLONNES_HYPOTHESE = `id, dossier_id, scenario_id, idee_id, enonce, statut, source, created_at`;
const COLONNES_DECISION = `id, dossier_id, scenario_id, idee_id, choix, motif, alternatives_ecartees, conditions_ouvertes, decide_par, date_decision`;

type DossierBrut = Omit<Dossier, "iaActivee" | "iaPerimetre"> & { iaActivee: number; iaPerimetre: string };

function hydraterDossier(ligne: unknown): Dossier {
  const d = versObjet<DossierBrut>(ligne as Record<string, unknown>);
  return { ...d, iaActivee: d.iaActivee === 1, iaPerimetre: (JSON.parse(d.iaPerimetre) as string[]).filter(estSection) };
}

/** Lecture SANS contrôle de droits — réservée à ce module, pour retrouver le dossier d'une entité. */
function lireDossierBrut(id: string): Dossier {
  const ligne = obtenirBase().prepare(`SELECT ${COLONNES_DOSSIER} FROM dossier WHERE id = ?`).get(id);
  if (!ligne) throw interdit(); // ne pas révéler si le dossier existe
  return hydraterDossier(ligne);
}

// --- Dossiers ------------------------------------------------------------------------------------

export function listerDossiers(acteur: Acteur): Dossier[] {
  const ids = dossiersAccessibles(acteur);
  if (ids.length === 0) return [];
  const marqueurs = ids.map(() => "?").join(", ");
  return (
    obtenirBase()
      .prepare(`SELECT ${COLONNES_DOSSIER} FROM dossier WHERE id IN (${marqueurs}) ORDER BY created_at DESC`)
      .all(...ids) as unknown[]
  ).map(hydraterDossier);
}

export function obtenirDossier(acteur: Acteur, id: string): Dossier {
  exiger(acteur, id, "lire", "identite");
  return lireDossierBrut(id);
}

/**
 * Pour la navigation : un acteur qui peut lire AU MOINS UNE section (un professionnel limité aux
 * documents, par exemple) voit l'en-tête du dossier (son nom) et les onglets de son périmètre.
 * Sans aucune section lisible : interdit, comme si le dossier n'existait pas.
 */
export function obtenirDossierPourNavigation(acteur: Acteur, id: string): Dossier {
  if (sectionsVisibles(acteur, id).length === 0) throw interdit();
  return lireDossierBrut(id);
}

/** Créer un dossier : seul le nom est obligatoire. Le créateur en devient propriétaire. */
export function creerDossier(
  acteur: Acteur,
  params: { nom: string; objectif?: string; stade?: string; typeProjet?: string },
): Dossier {
  const nom = params.nom.trim();
  if (nom === "") throw invalide("Le nom du dossier est obligatoire.");

  return transaction((db) => {
    const id = randomUUID();
    db.prepare(`INSERT INTO dossier (id, nom, objectif, stade, type_projet) VALUES (?, ?, ?, ?, ?)`).run(
      id,
      nom,
      params.objectif?.trim() || null,
      params.stade?.trim() || null,
      params.typeProjet?.trim() || null,
    );
    db.prepare(`INSERT INTO participation (id, dossier_id, personne_id, role) VALUES (?, ?, ?, 'proprietaire')`).run(
      randomUUID(),
      id,
      acteur.personneId,
    );
    enregistrerEvenement(db, { nomEntite: "dossier", entiteId: id, action: "creation", acteurId: acteur.personneId, dossierId: id });
    return hydraterDossier(db.prepare(`SELECT ${COLONNES_DOSSIER} FROM dossier WHERE id = ?`).get(id));
  });
}

export function modifierDossier(
  acteur: Acteur,
  id: string,
  params: { nom?: string; objectif?: string; stade?: string; typeProjet?: string; tauxImprevusPourMille?: number },
): Dossier {
  exiger(acteur, id, "ecrire", "identite");
  const avant = lireDossierBrut(id);
  const nom = params.nom?.trim() ?? avant.nom;
  if (nom === "") throw invalide("Le nom du dossier est obligatoire.");
  const taux = params.tauxImprevusPourMille ?? avant.tauxImprevusPourMille;
  if (!Number.isInteger(taux) || taux < 0 || taux > 1000) throw invalide("Le taux d'imprévus doit être un entier entre 0 et 1000 pour-mille.");

  const apres = {
    nom,
    objectif: params.objectif === undefined ? avant.objectif : params.objectif.trim() || null,
    stade: params.stade === undefined ? avant.stade : params.stade.trim() || null,
    typeProjet: params.typeProjet === undefined ? avant.typeProjet : params.typeProjet.trim() || null,
    taux,
  };

  return transaction((db) => {
    db.prepare(`UPDATE dossier SET nom = ?, objectif = ?, stade = ?, type_projet = ?, taux_imprevus_pour_mille = ? WHERE id = ?`).run(
      apres.nom,
      apres.objectif,
      apres.stade,
      apres.typeProjet,
      apres.taux,
      id,
    );
    enregistrerEvenement(db, {
      nomEntite: "dossier",
      entiteId: id,
      action: "modification",
      acteurId: acteur.personneId,
      dossierId: id,
      changements: [
        { champ: "nom", avant: avant.nom, apres: apres.nom },
        { champ: "stade", avant: avant.stade, apres: apres.stade },
        { champ: "type_projet", avant: avant.typeProjet, apres: apres.typeProjet },
        { champ: "taux_imprevus_pour_mille", avant: avant.tauxImprevusPourMille, apres: apres.taux },
      ].filter((c) => c.avant !== c.apres),
    });
    return lireDossierBrut(id);
  });
}

/**
 * Active/désactive l'assistant IA pour CE dossier et fixe les sections qu'il peut recevoir.
 * Réservé au propriétaire (action `activer_ia`). Désactivé par défaut.
 */
export function configurerIA(
  acteur: Acteur,
  id: string,
  params: { activee: boolean; perimetre: string[]; fournisseur: string },
): Dossier {
  exiger(acteur, id, "activer_ia", "ia");
  const avant = lireDossierBrut(id);
  const perimetre = params.perimetre.filter(estSection).filter((s) => !SECTIONS_NON_TRANSMISSIBLES.includes(s));
  if (params.activee && perimetre.length === 0) throw invalide("Choisissez au moins une section à transmettre à l'assistant.");
  if (!["regles_locales", "anthropic"].includes(params.fournisseur)) throw invalide(`Fournisseur IA inconnu : ${params.fournisseur}`);

  return transaction((db) => {
    db.prepare(`UPDATE dossier SET ia_activee = ?, ia_perimetre = ?, ia_fournisseur = ? WHERE id = ?`).run(
      params.activee ? 1 : 0,
      JSON.stringify(perimetre),
      params.fournisseur,
      id,
    );
    enregistrerEvenement(db, {
      nomEntite: "dossier",
      entiteId: id,
      action: "modification",
      acteurId: acteur.personneId,
      dossierId: id,
      motif: "Configuration de l'assistant IA",
      changements: [
        { champ: "ia_activee", avant: avant.iaActivee ? 1 : 0, apres: params.activee ? 1 : 0 },
        { champ: "ia_perimetre", avant: JSON.stringify(avant.iaPerimetre), apres: JSON.stringify(perimetre) },
        { champ: "ia_fournisseur", avant: avant.iaFournisseur, apres: params.fournisseur },
      ],
    });
    return lireDossierBrut(id);
  });
}

/**
 * Supprime DÉFINITIVEMENT un dossier (droit à l'effacement). Propriétaire seulement ; le nom
 * doit être retapé. Dans une seule transaction : les lignes du dossier (cascade), puis le journal
 * d'audit du dossier — purgé en levant temporairement le déclencheur d'ajout seul, parce que ces
 * événements contiennent des valeurs personnelles (adresses, montants). Il ne reste qu'UNE trace,
 * sans lien vers le dossier ni contenu : date, acteur, motif, nombre d'événements purgés. Les
 * fichiers déposés sont effacés du disque après validation de la transaction.
 */
export function supprimerDossier(
  acteur: Acteur,
  params: { dossierId: string; confirmationNom: string; motif: string },
): { fichiersSupprimes: number; fichiersIntrouvables: number; evenementsPurges: number } {
  exiger(acteur, params.dossierId, "supprimer_dossier", "identite");
  const dossier = lireDossierBrut(params.dossierId);
  if (params.confirmationNom.trim() !== dossier.nom) throw invalide("Pour supprimer, retapez exactement le nom du dossier.");
  const motif = params.motif.trim();
  if (motif === "") throw invalide("Un motif est obligatoire pour supprimer un dossier.");

  const db = obtenirBase();
  const chemins = (db.prepare(`SELECT chemin_relatif FROM document WHERE dossier_id = ?`).all(params.dossierId) as Array<{ chemin_relatif: string }>).map(
    (l) => l.chemin_relatif,
  );

  const evenementsPurges = transaction((tx) => {
    const n = (tx.prepare(`SELECT COUNT(*) AS n FROM audit_evenement WHERE dossier_id = ?`).get(params.dossierId) as { n: number }).n;
    tx.prepare(`DELETE FROM dossier WHERE id = ?`).run(params.dossierId); // cascade sur toutes les tables liées
    tx.exec(`DROP TRIGGER audit_evenement_pas_de_suppression`);
    try {
      tx.prepare(`DELETE FROM audit_evenement WHERE dossier_id = ?`).run(params.dossierId);
    } finally {
      tx.exec(`CREATE TRIGGER audit_evenement_pas_de_suppression
        BEFORE DELETE ON audit_evenement
        BEGIN
          SELECT RAISE(ABORT, 'Le journal d''audit est en ajout seul (aucune suppression).');
        END`);
    }
    enregistrerEvenement(tx, {
      nomEntite: "dossier",
      entiteId: params.dossierId,
      action: "suppression",
      acteurId: acteur.personneId,
      dossierId: null,
      motif,
      changements: [{ champ: "evenements_audit_purges", avant: n, apres: 0 }],
    });
    return n;
  });

  let fichiersSupprimes = 0;
  let fichiersIntrouvables = 0;
  for (const relatif of chemins) {
    const absolu = path.join(cheminFichiers(), relatif);
    if (!existsSync(absolu)) {
      fichiersIntrouvables++;
      continue;
    }
    unlinkSync(absolu);
    fichiersSupprimes++;
  }
  const repertoire = path.join(cheminFichiers(), params.dossierId);
  if (existsSync(repertoire)) rmSync(repertoire, { recursive: true, force: true });

  return { fichiersSupprimes, fichiersIntrouvables, evenementsPurges };
}

export function journalAudit(acteur: Acteur, dossierId: string): EvenementAudit[] {
  exiger(acteur, dossierId, "lire", "droits");
  return journalDossier(obtenirBase(), dossierId);
}

// --- Scénarios -----------------------------------------------------------------------------------

export function lireScenarioBrut(id: string): Scenario {
  const ligne = obtenirBase().prepare(`SELECT ${COLONNES_SCENARIO} FROM scenario WHERE id = ?`).get(id);
  if (!ligne) throw interdit();
  return versObjet<Scenario>(ligne as Record<string, unknown>);
}

export function listerScenarios(acteur: Acteur, dossierId: string): Scenario[] {
  exiger(acteur, dossierId, "lire", "scenarios");
  return versObjets<Scenario>(
    obtenirBase().prepare(`SELECT ${COLONNES_SCENARIO} FROM scenario WHERE dossier_id = ? ORDER BY created_at`).all(dossierId),
  );
}

/** Libellé d'un scénario pour qui ne peut pas lire son nom : son rang dans l'ordre de création. */
export function libelleNeutreScenario(rang: number): string {
  return `Scénario ${rang + 1}`;
}

export type ScenarioCite = { id: string; nom: string; statut: string | null };

/**
 * Les scénarios du dossier tels que les cite une section voisine (budget, idées), dans l'ordre de
 * création. Qui lit les scénarios voit leur nom et leur statut. Les autres voient le même
 * regroupement sous un libellé neutre (« Scénario 1 ») et sans statut : la règle de l'assistant
 * (DECISIONS, 2026-10-11), appliquée à une personne. Un écran ne doit pas dire « aucun scénario »
 * quand il y en a que l'acteur ne peut pas lire (issue #27).
 */
export function scenariosCites(acteur: Acteur, dossierId: string, section: "budget" | "idees"): ScenarioCite[] {
  exiger(acteur, dossierId, "lire", section);
  const nommes = autorise(acteur, dossierId, "lire", "scenarios");
  const scenarios = versObjets<{ id: string; nom: string; statut: string }>(
    obtenirBase().prepare(`SELECT id, nom, statut FROM scenario WHERE dossier_id = ? ORDER BY created_at`).all(dossierId),
  );
  return scenarios.map((s, rang) => (nommes ? s : { id: s.id, nom: libelleNeutreScenario(rang), statut: null }));
}

export function obtenirScenario(acteur: Acteur, id: string): Scenario {
  const s = lireScenarioBrut(id);
  exiger(acteur, s.dossierId, "lire", "scenarios");
  return s;
}

export function creerScenario(
  acteur: Acteur,
  params: { dossierId: string; nom: string; description?: string; source?: string },
): Scenario {
  exiger(acteur, params.dossierId, "ecrire", "scenarios");
  const nom = params.nom.trim();
  if (nom === "") throw invalide("Le nom du scénario est obligatoire.");
  const source = params.source && estSource(params.source) ? params.source : "saisie";

  return transaction((db) => {
    const id = randomUUID();
    db.prepare(`INSERT INTO scenario (id, dossier_id, nom, description, source) VALUES (?, ?, ?, ?, ?)`).run(
      id,
      params.dossierId,
      nom,
      params.description?.trim() || null,
      source,
    );
    enregistrerEvenement(db, { nomEntite: "scenario", entiteId: id, action: "creation", acteurId: acteur.personneId, dossierId: params.dossierId });
    return lireScenarioBrut(id);
  });
}

/**
 * Corriger un scénario après sa création : nom, description. Un champ absent ne change pas, une
 * description vidée redevient inconnue, seuls les champs changés sont tracés. Une décision déjà
 * prise garde le nom que le scénario portait : elle n'est pas réécrite.
 */
export function modifierScenario(acteur: Acteur, params: { scenarioId: string; nom?: string; description?: string }): Scenario {
  const avant = lireScenarioBrut(params.scenarioId);
  exiger(acteur, avant.dossierId, "ecrire", "scenarios");
  const nom = params.nom === undefined ? avant.nom : params.nom.trim();
  if (nom === "") throw invalide("Le nom du scénario est obligatoire.");
  const description = params.description === undefined ? avant.description : params.description.trim() || null;

  const changements = [
    { champ: "nom", avant: avant.nom, apres: nom },
    { champ: "description", avant: avant.description, apres: description },
  ].filter((c) => c.avant !== c.apres);
  if (changements.length === 0) return avant;

  return transaction((db) => {
    db.prepare(`UPDATE scenario SET nom = ?, description = ? WHERE id = ?`).run(nom, description, params.scenarioId);
    enregistrerEvenement(db, { nomEntite: "scenario", entiteId: params.scenarioId, action: "modification", acteurId: acteur.personneId, dossierId: avant.dossierId, changements });
    return lireScenarioBrut(params.scenarioId);
  });
}

/**
 * Change le statut d'un scénario, toujours avec un motif. Passer à « retenue » ou « écartée »
 * est une DÉCISION : elle est enregistrée comme telle (table `decision`), avec les alternatives
 * écartées et les conditions encore ouvertes si on les donne.
 */
export function changerStatutScenario(
  acteur: Acteur,
  params: { scenarioId: string; nouveauStatut: string; motif: string; alternativesEcartees?: string; conditionsOuvertes?: string },
): Scenario {
  const motif = params.motif.trim();
  if (motif === "") throw invalide("Un motif est obligatoire pour changer le statut d'un scénario.");
  const avant = lireScenarioBrut(params.scenarioId);
  exiger(acteur, avant.dossierId, "ecrire", "scenarios");
  if (avant.statut === params.nouveauStatut) return avant;

  return transaction((db) => {
    db.prepare(`UPDATE scenario SET statut = ? WHERE id = ?`).run(params.nouveauStatut, params.scenarioId);
    enregistrerEvenement(db, {
      nomEntite: "scenario",
      entiteId: params.scenarioId,
      action: "transition_statut",
      acteurId: acteur.personneId,
      dossierId: avant.dossierId,
      motif,
      changements: [{ champ: "statut", avant: avant.statut, apres: params.nouveauStatut }],
    });
    if (params.nouveauStatut === "retenue" || params.nouveauStatut === "ecartee") {
      const decisionId = randomUUID();
      db.prepare(
        `INSERT INTO decision (id, dossier_id, scenario_id, choix, motif, alternatives_ecartees, conditions_ouvertes, decide_par)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        decisionId,
        avant.dossierId,
        params.scenarioId,
        `Scénario « ${avant.nom} » ${params.nouveauStatut === "retenue" ? "retenu" : "écarté"}`,
        motif,
        params.alternativesEcartees?.trim() || null,
        params.conditionsOuvertes?.trim() || null,
        acteur.personneId,
      );
      enregistrerEvenement(db, { nomEntite: "decision", entiteId: decisionId, action: "creation", acteurId: acteur.personneId, dossierId: avant.dossierId, motif });
    }
    return lireScenarioBrut(params.scenarioId);
  });
}

export function historiqueScenario(acteur: Acteur, scenarioId: string): EvenementAudit[] {
  const s = lireScenarioBrut(scenarioId);
  exiger(acteur, s.dossierId, "lire", "scenarios");
  return historiqueDe(obtenirBase(), "scenario", scenarioId);
}

// --- Hypothèses ------------------------------------------------------------------------------------

export function listerHypotheses(acteur: Acteur, dossierId: string): Hypothese[] {
  exiger(acteur, dossierId, "lire", "scenarios");
  return versObjets<Hypothese>(
    obtenirBase().prepare(`SELECT ${COLONNES_HYPOTHESE} FROM hypothese WHERE dossier_id = ? ORDER BY created_at`).all(dossierId),
  );
}

export function ajouterHypothese(
  acteur: Acteur,
  params: { dossierId: string; scenarioId?: string | null; ideeId?: string | null; enonce: string; source?: string },
): Hypothese {
  exiger(acteur, params.dossierId, "ecrire", "scenarios");
  const enonce = params.enonce.trim();
  if (enonce === "") throw invalide("L'énoncé de l'hypothèse est obligatoire.");
  const source = params.source && estSource(params.source) ? params.source : "saisie";

  return transaction((db) => {
    const id = randomUUID();
    db.prepare(`INSERT INTO hypothese (id, dossier_id, scenario_id, idee_id, enonce, source) VALUES (?, ?, ?, ?, ?, ?)`).run(
      id,
      params.dossierId,
      params.scenarioId || null,
      params.ideeId || null,
      enonce,
      source,
    );
    enregistrerEvenement(db, { nomEntite: "hypothese", entiteId: id, action: "creation", acteurId: acteur.personneId, dossierId: params.dossierId });
    return versObjet<Hypothese>(db.prepare(`SELECT ${COLONNES_HYPOTHESE} FROM hypothese WHERE id = ?`).get(id) as Record<string, unknown>);
  });
}

export function changerStatutHypothese(acteur: Acteur, params: { hypotheseId: string; statut: string; motif: string }): Hypothese {
  const motif = params.motif.trim();
  if (motif === "") throw invalide("Un motif est obligatoire pour valider ou invalider une hypothèse.");
  const ligne = obtenirBase().prepare(`SELECT ${COLONNES_HYPOTHESE} FROM hypothese WHERE id = ?`).get(params.hypotheseId);
  if (!ligne) throw introuvable("Hypothèse");
  const avant = versObjet<Hypothese>(ligne as Record<string, unknown>);
  exiger(acteur, avant.dossierId, "ecrire", "scenarios");
  if (!["a_valider", "validee", "invalidee"].includes(params.statut)) throw invalide(`Statut d'hypothèse inconnu : ${params.statut}`);

  return transaction((db) => {
    db.prepare(`UPDATE hypothese SET statut = ? WHERE id = ?`).run(params.statut, params.hypotheseId);
    enregistrerEvenement(db, {
      nomEntite: "hypothese",
      entiteId: params.hypotheseId,
      action: "transition_statut",
      acteurId: acteur.personneId,
      dossierId: avant.dossierId,
      motif,
      changements: [{ champ: "statut", avant: avant.statut, apres: params.statut }],
    });
    return versObjet<Hypothese>(db.prepare(`SELECT ${COLONNES_HYPOTHESE} FROM hypothese WHERE id = ?`).get(params.hypotheseId) as Record<string, unknown>);
  });
}

// --- Décisions -----------------------------------------------------------------------------------

export function listerDecisions(acteur: Acteur, dossierId: string): Decision[] {
  exiger(acteur, dossierId, "lire", "scenarios");
  return versObjets<Decision>(
    obtenirBase().prepare(`SELECT ${COLONNES_DECISION} FROM decision WHERE dossier_id = ? ORDER BY date_decision DESC`).all(dossierId),
  );
}
