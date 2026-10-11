// Assistant IA — module SÉPARÉ, désactivé par défaut (priorité 6).
//
// Garanties tenues ici, pas dans le fournisseur :
// 1. Rien ne part si `dossier.ia_activee` est faux : l'application n'appelle jamais ce module
//    pour fonctionner — il n'est invoqué que par l'écran « Assistant » quand l'utilisateur pose
//    une question.
// 2. Le fournisseur reçoit un `ContexteAutorise` construit UNIQUEMENT à partir des sections que
//    le propriétaire a cochées (`ia_perimetre`) ET que l'acteur qui pose la question peut lire.
//    Jamais de fiche de personne, jamais de fichier, jamais d'adresse. Les noms et les textes
//    saisis dans une section cochée partent tels quels, avec les montants : l'écran le dit et
//    montre le texte exact avant l'envoi (voir `construireContexte`, issue #19).
// 3. Chaque réponse porte ses sources, leur date, son niveau d'incertitude et l'avertissement
//    standard. Elle est journalisée (`ia_echange`) et auditée (`ia_requete`).
// 4. L'IA n'écrit RIEN dans le dossier. Ses propositions passent par les mêmes formulaires que
//    les saisies humaines, avec la source « suggestion de l'IA » et le statut « à confirmer ».

import { randomUUID } from "node:crypto";
import { obtenirBase, transaction, versObjets } from "./db/client";
import { enregistrerEvenement } from "./db/audit";
import { exiger, sectionsVisibles, type Acteur } from "./acces";
import { ErreurApplicative, invalide } from "./erreurs";
import { obtenirDossier, type Dossier } from "./dossiers";
import type { Section } from "../domain/droits";
import { SECTIONS_NON_TRANSMISSIBLES, type ContexteAutorise, type FournisseurIA, type ReponseIA } from "../domain/ia/types";
import { FournisseurReglesLocales } from "../domain/ia/questions-manquantes";
import { synthetiserScenario } from "../domain/budget";
import { prerequisBloquants } from "../domain/planning";

export type EchangeIA = {
  id: string;
  dossierId: string;
  acteurId: string | null;
  fournisseur: string;
  modele: string | null;
  question: string;
  perimetre: Section[];
  reponse: ReponseIA;
  createdAt: string;
};

/** Sections effectivement transmises : périmètre choisi ∩ sections lisibles par l'acteur. */
export function perimetreEffectif(acteur: Acteur, dossier: Dossier): Section[] {
  const lisibles = new Set(sectionsVisibles(acteur, dossier.id));
  return dossier.iaPerimetre.filter((s) => lisibles.has(s) && !SECTIONS_NON_TRANSMISSIBLES.includes(s));
}

/**
 * Construit le contexte autorisé. Chaque bloc n'est ajouté que si sa section est dans le
 * périmètre effectif — absent sinon, pas vide. Aucune adresse, aucune fiche de personne, aucun
 * nom ni contenu de fichier, aucun identifiant. Le nom du dossier et le nom d'un scénario suivent
 * la même règle que le reste : ils ne partent que si leur section est cochée.
 */
export function construireContexte(acteur: Acteur, dossier: Dossier): ContexteAutorise {
  const db = obtenirBase();
  const sections = perimetreEffectif(acteur, dossier);
  const ctx: ContexteAutorise = { sections };
  if (sections.includes("identite")) {
    ctx.dossier = { nom: dossier.nom, typeProjet: dossier.typeProjet, stade: dossier.stade };
  }
  const scenarios = versObjets<{ id: string; nom: string; statut: string }>(
    db.prepare(`SELECT id, nom, statut FROM scenario WHERE dossier_id = ? ORDER BY created_at`).all(dossier.id),
  );
  // Les idées et le budget citent leur scénario. Sans la section « scénarios », un libellé neutre
  // (« Scénario 1 ») garde le regroupement lisible sans transmettre le nom.
  const transmetScenarios = sections.includes("scenarios");
  const libelleScenario = (rang: number) => (transmetScenarios ? scenarios[rang].nom : `Scénario ${rang + 1}`);
  const nomScenario = (id: string | null) => {
    const rang = scenarios.findIndex((s) => s.id === id);
    return rang < 0 ? null : libelleScenario(rang);
  };

  if (sections.includes("lieux")) {
    const lieux = versObjets<{ id: string; nom: string; typeLieu: string; adresse: string | null }>(
      db.prepare(`SELECT id, nom, type_lieu, adresse FROM lieu WHERE dossier_id = ?`).all(dossier.id),
    );
    const batiments = versObjets<{ id: string; lieuId: string | null; nom: string }>(
      db.prepare(`SELECT id, lieu_id, nom FROM batiment WHERE dossier_id = ?`).all(dossier.id),
    );
    const pieces = versObjets<{ batimentId: string; nom: string; surfaceCentiemes: number | null; surfaceConfiance: string }>(
      db.prepare(`SELECT batiment_id, nom, surface_centiemes, surface_confiance FROM piece WHERE dossier_id = ?`).all(dossier.id),
    );
    const bloc = (lieuId: string | null) =>
      batiments
        .filter((b) => b.lieuId === lieuId)
        .map((b) => ({
          nom: b.nom,
          pieces: pieces.filter((p) => p.batimentId === b.id).map((p) => ({ nom: p.nom, surfaceCentiemes: p.surfaceCentiemes, surfaceConfiance: p.surfaceConfiance })),
        }));
    ctx.lieux = lieux.map((l) => ({ nom: l.nom, type: l.typeLieu, adresseRenseignee: l.adresse !== null, batiments: bloc(l.id) }));
    const sansLieu = bloc(null);
    if (sansLieu.length > 0) ctx.lieux.push({ nom: "(bâtiments sans lieu)", type: "—", adresseRenseignee: true, batiments: sansLieu });
  }

  if (sections.includes("idees")) {
    ctx.idees = versObjets<{ titre: string; statut: string; scenarioId: string | null }>(
      db.prepare(`SELECT titre, statut, scenario_id FROM idee WHERE dossier_id = ?`).all(dossier.id),
    ).map((i) => ({ titre: i.titre, statut: i.statut, scenarioNom: nomScenario(i.scenarioId) }));
  }

  if (sections.includes("scenarios") || sections.includes("budget")) {
    const postes = versObjets<{ id: string; nom: string; scenarioId: string }>(
      db.prepare(`SELECT id, nom, scenario_id FROM poste_budget WHERE dossier_id = ?`).all(dossier.id),
    );
    const lignes = versObjets<{ posteId: string; typeMontant: string; montantCentimes: number; source: string; confiance: string; statut: string }>(
      db.prepare(`SELECT poste_id, type_montant, montant_centimes, source, confiance, statut FROM ligne_budget WHERE scenario_id IN (SELECT id FROM scenario WHERE dossier_id = ?)`).all(dossier.id),
    );
    const syntheses = scenarios.map((s) => ({
      s,
      synthese: synthetiserScenario(
        s.id,
        postes,
        lignes.map((l) => ({ ...l, typeMontant: l.typeMontant as never, source: l.source as never, confiance: l.confiance as never, ecartee: l.statut === "ecartee" })),
        { tauxImprevusPourMille: dossier.tauxImprevusPourMille },
      ),
    }));
    if (sections.includes("scenarios")) {
      const hypotheses = versObjets<{ scenarioId: string | null; enonce: string }>(
        db.prepare(`SELECT scenario_id, enonce FROM hypothese WHERE dossier_id = ? AND statut = 'a_valider'`).all(dossier.id),
      );
      ctx.scenarios = syntheses.map(({ s, synthese }) => ({
        nom: s.nom,
        statut: s.statut,
        nbPostes: synthese.nbPostes,
        nbPostesARenseigner: synthese.nbPostesARenseigner,
        nbPostesSurEstimation: synthese.nbPostesSurEstimation,
        totalReferenceCentimes: synthese.totalReferenceCentimes,
        hypothesesOuvertes: hypotheses.filter((h) => h.scenarioId === s.id).map((h) => h.enonce),
      }));
    }
    if (sections.includes("budget")) {
      ctx.budget = syntheses.flatMap(({ synthese }, rang) =>
        synthese.postes.map((p) => ({ scenarioNom: libelleScenario(rang), poste: p.nom, statut: p.statut, referenceCentimes: p.referenceCentimes, natureReference: p.natureReference })),
      );
    }
  }

  if (sections.includes("documents")) {
    ctx.documents = versObjets<{ id: string; nomOriginal: string; typeDocument: string; rattache: number; enAttente: number }>(
      db
        .prepare(
          `SELECT d.id, d.nom_original, d.type_document,
                  (d.lieu_id IS NOT NULL OR d.batiment_id IS NOT NULL OR d.piece_id IS NOT NULL OR d.scenario_id IS NOT NULL OR d.poste_id IS NOT NULL OR d.idee_id IS NOT NULL OR d.tache_id IS NOT NULL) AS rattache,
                  (SELECT COUNT(*) FROM extraction_document e WHERE e.document_id = d.id AND e.statut = 'proposee') AS en_attente
           FROM document d WHERE d.dossier_id = ?`,
        )
        .all(dossier.id),
    ).map((d) => ({ nom: d.typeDocument, type: d.typeDocument, rattache: d.rattache === 1, extractionsEnAttente: d.enAttente }));
  }

  if (sections.includes("taches")) {
    const taches = versObjets<{ id: string; description: string; statut: string; echeance: string | null; responsable: string | null; estJalon: number; scenarioId: string | null }>(
      db.prepare(`SELECT id, description, statut, echeance, responsable, est_jalon, scenario_id FROM tache WHERE dossier_id = ?`).all(dossier.id),
    );
    const deps = versObjets<{ tacheId: string; dependDeId: string }>(
      db.prepare(`SELECT d.tache_id, d.depend_de_id FROM dependance_tache d JOIN tache t ON t.id = d.tache_id WHERE t.dossier_id = ?`).all(dossier.id),
    ).map((d) => ({ actionId: d.tacheId, dependDeId: d.dependDeId }));
    const planifiees = taches.map((t) => ({ ...t, estJalon: t.estJalon === 1 }));
    ctx.taches = planifiees.map((t) => ({
      description: t.description,
      statut: t.statut,
      echeance: t.echeance,
      // On transmet seulement « un responsable est désigné » ou non — pas son nom.
      responsable: t.responsable ? "désigné" : null,
      bloqueePar: prerequisBloquants(t.id, planifiees, deps).length,
    }));
  }

  return ctx;
}

async function choisirFournisseur(code: string): Promise<FournisseurIA> {
  if (code === "regles_locales") return new FournisseurReglesLocales();
  if (code === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new ErreurApplicative("IA_INDISPONIBLE", "Le fournisseur distant n'est pas configuré (variable ANTHROPIC_API_KEY absente). Utilisez les règles locales.");
    }
    const { FournisseurAnthropic } = await import("./ia/anthropic");
    return new FournisseurAnthropic();
  }
  throw invalide(`Fournisseur IA inconnu : ${code}`);
}

/** Pose une question à l'assistant pour un dossier. Lève `IA_INDISPONIBLE` si désactivé. */
export async function demanderAssistant(acteur: Acteur, dossierId: string, question: string): Promise<ReponseIA> {
  exiger(acteur, dossierId, "lire", "ia");
  const dossier = obtenirDossier(acteur, dossierId);
  if (!dossier.iaActivee) throw new ErreurApplicative("IA_INDISPONIBLE", "L'assistant IA est désactivé pour ce dossier.");
  const q = question.trim();
  if (q === "") throw invalide("Posez une question (ou « que manque-t-il ? »).");

  const contexte = construireContexte(acteur, dossier);
  if (contexte.sections.length === 0) {
    throw new ErreurApplicative("IA_INDISPONIBLE", "Aucune section du dossier n'est transmissible à l'assistant pour votre rôle.");
  }
  const fournisseur = await choisirFournisseur(dossier.iaFournisseur);
  const reponse = await fournisseur.repondre(contexte, q, new Date().toISOString());

  transaction((db) => {
    const id = randomUUID();
    db.prepare(`INSERT INTO ia_echange (id, dossier_id, acteur_id, fournisseur, modele, question, perimetre, reponse) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      dossierId,
      acteur.personneId,
      reponse.fournisseur,
      reponse.modele,
      q,
      JSON.stringify(contexte.sections),
      JSON.stringify(reponse),
    );
    enregistrerEvenement(db, {
      nomEntite: "ia_echange",
      entiteId: id,
      action: "ia_requete",
      acteurId: acteur.personneId,
      dossierId,
      motif: `Fournisseur ${reponse.fournisseur} ; sections : ${contexte.sections.join(", ")}`,
    });
  });
  return reponse;
}

export function listerEchanges(acteur: Acteur, dossierId: string, limite = 20): EchangeIA[] {
  exiger(acteur, dossierId, "lire", "ia");
  return versObjets<Omit<EchangeIA, "perimetre" | "reponse"> & { perimetre: string; reponse: string }>(
    obtenirBase()
      .prepare(`SELECT id, dossier_id, acteur_id, fournisseur, modele, question, perimetre, reponse, created_at FROM ia_echange WHERE dossier_id = ? ORDER BY created_at DESC LIMIT ?`)
      .all(dossierId, limite),
  ).map((e) => ({ ...e, perimetre: JSON.parse(e.perimetre) as Section[], reponse: JSON.parse(e.reponse) as ReponseIA }));
}
