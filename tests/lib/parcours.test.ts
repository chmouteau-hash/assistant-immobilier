// Parcours de bout en bout sur base en mémoire : dossier incomplet → scénarios → budget →
// document + extraction corrigée → actions avec dépendances → assistant (sans IA, puis règles locales).

import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { obtenirBase, reinitialiserBasePourTests } from "@/lib/db/client";
import { creerDossier, creerScenario, changerStatutScenario, listerDecisions, configurerIA, modifierDossier, journalAudit, obtenirDossier } from "@/lib/dossiers";
import { creerLieu, creerBatiment, creerPiece, modifierSurfacePiece } from "@/lib/structure";
import { creerIdee, changerStatutIdee } from "@/lib/idees";
import { creerPoste, ajouterLigne, syntheseScenario, comparaisonDossier, listerLignes } from "@/lib/budget";
import { creerTache, ajouterDependance, retirerDependance, listerDependances, changerStatutTache, classementDossier, timelineDossier } from "@/lib/taches";
import { inviterPersonne } from "@/lib/personnes";
import { deposerDocument, proposerExtraction, validerExtraction, listerExtractions } from "@/lib/documents";
import { demanderAssistant, construireContexte, listerEchanges } from "@/lib/ia";
import { ErreurApplicative } from "@/lib/erreurs";
import type { Acteur } from "@/lib/acces";

const moi: Acteur = { personneId: "utilisateur-local", nom: "Utilisateur local" };

describe("parcours pilote", () => {
  beforeEach(() => {
    reinitialiserBasePourTests();
    process.env.ASSISTANT_FICHIERS_PATH = mkdtempSync(path.join(tmpdir(), "assistant-fichiers-"));
  });

  it("un dossier se crée sans connaître les réponses, et les inconnues restent explicites", () => {
    const d = creerDossier(moi, { nom: "Lieu à acheter" });
    expect(d.typeProjet).toBeNull();
    expect(d.iaActivee).toBe(false);

    const lieu = creerLieu(moi, { dossierId: d.id, nom: "Bien candidat (fictif)", typeLieu: "bien_candidat" });
    expect(lieu.adresse).toEqual({ valeur: null, source: null, confiance: "a_renseigner" });

    const bat = creerBatiment(moi, { dossierId: d.id, lieuId: lieu.id, nom: "Bâtiment ancien", etat: "toiture refaite (à vérifier)" });
    const piece = creerPiece(moi, { dossierId: d.id, batimentId: bat.id, nom: "Grande pièce principale" });
    expect(piece.surface.confiance).toBe("a_renseigner");

    // Une surface estimée ne peut pas être « connue » ; une saisie l'est par défaut.
    expect(() => modifierSurfacePiece(moi, { pieceId: piece.id, surfaceCentiemes: 4500, surfaceSource: "estimation", surfaceConfiance: "connu" })).toThrow(/estimation/);
    const estimee = modifierSurfacePiece(moi, { pieceId: piece.id, surfaceCentiemes: 4500, surfaceSource: "estimation" });
    expect(estimee.surface).toMatchObject({ valeur: 4500, source: "estimation", confiance: "estime" });
    expect(() => modifierSurfacePiece(moi, { pieceId: piece.id, surfaceCentiemes: 4500 })).toThrow(/source/);
  });

  it("deux scénarios se comparent sans s'écraser, la comparaison reste prudente", () => {
    const d = creerDossier(moi, { nom: "Pilote", typeProjet: "recherche_bien" });
    modifierDossier(moi, d.id, { tauxImprevusPourMille: 150 });
    const reno = creerScenario(moi, { dossierId: d.id, nom: "Rénover l'ancien" });
    const neuf = creerScenario(moi, { dossierId: d.id, nom: "Construire en bois à côté" });

    const toiture = creerPoste(moi, { scenarioId: reno.id, nom: "Toiture" });
    const iso = creerPoste(moi, { scenarioId: reno.id, nom: "Isolation" });
    const gros = creerPoste(moi, { scenarioId: neuf.id, nom: "Gros œuvre bois" });

    // Une estimation doit être étiquetée estimation.
    expect(() => ajouterLigne(moi, { posteId: toiture.id, montantCentimes: 1_800_000, typeMontant: "estimation", source: "saisie" })).toThrow(/estimation/);
    ajouterLigne(moi, { posteId: toiture.id, montantCentimes: 1_800_000, typeMontant: "estimation", source: "estimation" });
    ajouterLigne(moi, { posteId: gros.id, montantCentimes: 9_000_000, typeMontant: "devis", source: "saisie" });
    expect(() => ajouterLigne(moi, { posteId: gros.id, montantCentimes: 10.5, typeMontant: "devis", source: "saisie" })).toThrow(/entier/);

    const sReno = syntheseScenario(moi, reno.id);
    expect(sReno.complet).toBe(false); // isolation à renseigner
    expect(sReno.nbPostesARenseigner).toBe(1);
    expect(sReno.totalReferenceCentimes).toBe(1_800_000);
    expect(sReno.margeImprevusCentimes).toBe(270_000);

    let c = comparaisonDossier(moi, d.id);
    expect(c.comparable).toBe(false);
    expect(c.reserve).toMatch(/Rénover l'ancien.*à renseigner/);

    ajouterLigne(moi, { posteId: iso.id, montantCentimes: 2_000_000, typeMontant: "devis", source: "saisie" });
    c = comparaisonDossier(moi, d.id);
    expect(c.comparable).toBe(true);
    expect(c.reserve).toMatch(/indicative/); // la toiture reste une estimation
    expect(c.lignes.find((l) => l.nom === "Rénover l'ancien")!.rangCout).toBe(1);
    expect(c.lignes.find((l) => l.nom === "Construire en bois à côté")!.ecartAuMoinsCherCentimes).toBe(5_200_000);

    // Retenir un scénario exige un motif et crée une décision ; l'autre n'est pas effacé.
    expect(() => changerStatutScenario(moi, { scenarioId: reno.id, nouveauStatut: "retenue", motif: " " })).toThrow(/motif/);
    changerStatutScenario(moi, { scenarioId: reno.id, nouveauStatut: "retenue", motif: "Moins cher, toiture déjà refaite", conditionsOuvertes: "devis toiture à confirmer" });
    const decisions = listerDecisions(moi, d.id);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].conditionsOuvertes).toBe("devis toiture à confirmer");
    expect(comparaisonDossier(moi, d.id).scenarios).toHaveLength(2);

    // Idées : retenir demande un motif et crée une décision.
    const idee = creerIdee(moi, { dossierId: d.id, titre: "Piscine intérieure" });
    expect(() => changerStatutIdee(moi, { ideeId: idee.id, nouveauStatut: "ecartee", motif: "" })).toThrow(/motif/);
    changerStatutIdee(moi, { ideeId: idee.id, nouveauStatut: "a_etudier", motif: "" });
    changerStatutIdee(moi, { ideeId: idee.id, nouveauStatut: "ecartee", motif: "Hors budget pour l'instant" });
    expect(listerDecisions(moi, d.id)).toHaveLength(2);
  });

  it("une facture jointe est lue, corrigée, puis entre au budget avec sa provenance", () => {
    const d = creerDossier(moi, { nom: "Pilote" });
    const s = creerScenario(moi, { dossierId: d.id, nom: "Rénovation" });
    const doc = deposerDocument(moi, {
      dossierId: d.id,
      nomOriginal: "facture-couvreur.pdf",
      mime: "application/pdf",
      octets: Buffer.from("%PDF-1.4 fausse facture de test"),
      typeDocument: "facture",
      scenarioId: s.id,
    });
    expect(doc.sha256).toHaveLength(64);
    expect(doc.cheminRelatif).not.toContain("facture-couvreur"); // nommé par id, pas par nom d'origine

    // Lecture humaine : montant lu avec une faute de frappe.
    proposerExtraction(moi, { documentId: doc.id, champs: { montant_centimes: "12 345,67", date: "2026-09-30", fournisseur: "Couvreur X", poste: "Toiture" }, source: "saisie" });
    expect(listerExtractions(moi, doc.id).every((e) => e.statut === "proposee" && e.confiance === "a_confirmer")).toBe(true);
    expect(listerLignes(moi, d.id)).toHaveLength(0); // rien au budget avant validation

    const { extractions, ligne } = validerExtraction(moi, { documentId: doc.id, corrections: { montant_centimes: "12 435,67" } });
    expect(extractions.find((e) => e.champ === "montant_centimes")).toMatchObject({ statut: "corrigee", valeurValidee: "12 435,67", confiance: "connu" });
    expect(extractions.find((e) => e.champ === "date")).toMatchObject({ statut: "validee" });
    expect(ligne).toMatchObject({ montantCentimes: 1_243_567, typeMontant: "facture", source: "import", confiance: "connu", documentId: doc.id, fournisseur: "Couvreur X", poste: "Toiture" });
    expect(syntheseScenario(moi, s.id).postes[0]).toMatchObject({ nom: "Toiture", statut: "facture", referenceCentimes: 1_243_567 });

    // Une extraction par l'IA reste une suggestion jusqu'à validation.
    const doc2 = deposerDocument(moi, { dossierId: d.id, nomOriginal: "devis.pdf", mime: "application/pdf", octets: Buffer.from("x"), typeDocument: "devis" });
    const ext = proposerExtraction(moi, { documentId: doc2.id, champs: { montant_centimes: "100" }, source: "suggestion_ia" });
    expect(ext[0]).toMatchObject({ source: "suggestion_ia", confiance: "a_confirmer", statut: "proposee" });
    // Sans scénario ni poste, impossible d'alimenter le budget.
    expect(() => validerExtraction(moi, { documentId: doc2.id, corrections: { poste: "Toiture" } })).toThrow(/rattaché à un scénario/);
    expect(() => deposerDocument(moi, { dossierId: d.id, nomOriginal: "x.exe", mime: "application/octet-stream", octets: Buffer.from("x"), typeDocument: "autre" })).toThrow(/non accepté/);
  });

  it("actions, dépendances, liste du jour et timeline sans date inventée", () => {
    const d = creerDossier(moi, { nom: "Pilote" });
    const devis = creerTache(moi, { dossierId: d.id, description: "Obtenir le devis toiture", responsable: "moi" });
    const commande = creerTache(moi, { dossierId: d.id, description: "Commander la toiture", dependDeIds: [devis.id], echeance: "2020-01-01" });
    const jalon = creerTache(moi, { dossierId: d.id, description: "Réception", estJalon: true });
    expect(() => ajouterDependance(moi, { tacheId: devis.id, dependDeId: commande.id })).toThrow(/cycle/);
    expect(() => creerTache(moi, { dossierId: d.id, description: "x", echeance: "01/01/2027" })).toThrow(/AAAA-MM-JJ/);

    const c = classementDossier(moi, d.id);
    expect(c.aDebloquer.map((t) => t.id)).toEqual([commande.id]); // en retard mais bloquée → à débloquer
    expect(c.aExplorer.map((t) => t.id).sort()).toEqual([devis.id, jalon.id].sort());

    expect(() => changerStatutTache(moi, { tacheId: commande.id, nouveauStatut: "fait" })).toThrow(/prérequis/);
    changerStatutTache(moi, { tacheId: devis.id, nouveauStatut: "fait" });
    expect(classementDossier(moi, d.id).aujourdhui.map((t) => t.id)).toEqual([commande.id]);

    const t = timelineDossier(moi, d.id);
    expect(t.datees.map((e) => e.action.id)).toEqual([commande.id]);
    expect(t.sansDate.map((e) => e.action.id).sort()).toEqual([devis.id, jalon.id].sort());
  });

  it("une dépendance posée par erreur se retire, une action faite se rouvre", () => {
    const d = creerDossier(moi, { nom: "Pilote" });
    const devis = creerTache(moi, { dossierId: d.id, description: "Obtenir le devis toiture" });
    const commande = creerTache(moi, { dossierId: d.id, description: "Commander la toiture", dependDeIds: [devis.id] });
    const pose = creerTache(moi, { dossierId: d.id, description: "Poser la toiture", dependDeIds: [devis.id] });

    // Retirer : même droit que poser, tracé, sans effet si la dépendance n'existe plus.
    const invite = inviterPersonne(moi, { dossierId: d.id, nom: "Ami", role: "lecteur" });
    const lecteur: Acteur = { personneId: invite.personneId, nom: "Ami" };
    expect(() => retirerDependance(lecteur, { tacheId: pose.id, dependDeId: devis.id })).toThrow(ErreurApplicative);
    retirerDependance(moi, { tacheId: pose.id, dependDeId: devis.id });
    retirerDependance(moi, { tacheId: pose.id, dependDeId: devis.id });
    expect(listerDependances(moi, d.id)).toEqual([{ actionId: commande.id, dependDeId: devis.id }]);
    expect(changerStatutTache(moi, { tacheId: pose.id, nouveauStatut: "en_cours" }).statut).toBe("en_cours");
    const retraits = journalAudit(moi, d.id).filter((e) => e.entiteId === pose.id && e.action === "modification");
    expect(retraits.map((e) => e.changements)).toEqual([[{ champ: "depend_de", avant: devis.id, apres: null }]]);

    // Rouvrir : une action faite par erreur revient dans la liste du jour ; celle qui en dépend
    // repasse d'elle-même dans « à débloquer », sans que son statut soit touché.
    changerStatutTache(moi, { tacheId: devis.id, nouveauStatut: "fait" });
    changerStatutTache(moi, { tacheId: commande.id, nouveauStatut: "en_cours" });
    expect(classementDossier(moi, d.id).aDebloquer).toEqual([]);
    changerStatutTache(moi, { tacheId: devis.id, nouveauStatut: "a_faire" });
    const c = classementDossier(moi, d.id);
    expect(c.aExplorer.map((t) => t.id)).toContain(devis.id);
    expect(c.aDebloquer.map((t) => ({ id: t.id, statut: t.statut }))).toEqual([{ id: commande.id, statut: "en_cours" }]);
  });

  it("sans IA tout fonctionne ; l'assistant ne reçoit que le périmètre autorisé et ne modifie rien", async () => {
    const d = creerDossier(moi, { nom: "Pilote" });
    creerScenario(moi, { dossierId: d.id, nom: "Seul scénario" });
    await expect(demanderAssistant(moi, d.id, "que manque-t-il ?")).rejects.toMatchObject({ code: "IA_INDISPONIBLE" });

    expect(() => configurerIA(moi, d.id, { activee: true, perimetre: [], fournisseur: "regles_locales" })).toThrow(/au moins une section/);
    configurerIA(moi, d.id, { activee: true, perimetre: ["scenarios", "droits", "personnes"], fournisseur: "regles_locales" });
    const dossier = obtenirDossier(moi, d.id);
    expect(dossier.iaPerimetre).toEqual(["scenarios"]); // droits et personnes ne sont jamais transmis

    const ctx = construireContexte(moi, dossier);
    expect(ctx.sections).toEqual(["scenarios"]);
    expect(ctx.lieux).toBeUndefined();
    expect(ctx.taches).toBeUndefined();
    expect(JSON.stringify(ctx)).not.toContain("Utilisateur local");

    const r = await demanderAssistant(moi, d.id, "que manque-t-il ?");
    expect(r.fournisseur).toBe("regles_locales");
    expect(r.perimetreUtilise).toEqual(["scenarios"]);
    expect(r.elements.some((e) => /Un seul scénario/.test(e.constat.texte))).toBe(true);
    expect(r.elements.every((e) => e.constat.sources.length > 0)).toBe(true);
    expect(listerEchanges(moi, d.id)).toHaveLength(1);
    expect(comparaisonDossier(moi, d.id).scenarios).toHaveLength(1); // rien n'a été créé par l'IA

    // Fournisseur distant non configuré : erreur claire, pas de plantage.
    delete process.env.ANTHROPIC_API_KEY;
    configurerIA(moi, d.id, { activee: true, perimetre: ["scenarios"], fournisseur: "anthropic" });
    await expect(demanderAssistant(moi, d.id, "?")).rejects.toSatisfy((e) => e instanceof ErreurApplicative && /ANTHROPIC_API_KEY/.test(e.message));
  });

  it("le journal d'audit est en ajout seul, garanti par la base", () => {
    const d = creerDossier(moi, { nom: "Pilote" });
    const db = obtenirBase();
    const evt = db.prepare(`SELECT id FROM audit_evenement WHERE dossier_id = ? LIMIT 1`).get(d.id) as { id: string };
    expect(() => db.prepare(`UPDATE audit_evenement SET motif = 'falsifié' WHERE id = ?`).run(evt.id)).toThrow(/ajout seul/);
    expect(() => db.prepare(`DELETE FROM audit_evenement WHERE id = ?`).run(evt.id)).toThrow(/ajout seul/);
    const journal = journalAudit(moi, d.id);
    expect(journal.every((e) => e.acteurId === moi.personneId)).toBe(true);
  });
});
