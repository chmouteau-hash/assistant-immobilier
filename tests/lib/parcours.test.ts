// Parcours de bout en bout sur base en mémoire : dossier incomplet → scénarios → budget →
// document + extraction corrigée → actions avec dépendances → assistant (sans IA, puis règles locales).

import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { obtenirBase, reinitialiserBasePourTests } from "@/lib/db/client";
import { creerDossier, creerScenario, changerStatutScenario, listerDecisions, configurerIA, modifierDossier, journalAudit, obtenirDossier } from "@/lib/dossiers";
import {
  creerLieu,
  creerBatiment,
  creerPiece,
  modifierSurfacePiece,
  rattacherBatiment,
  listerBatiments,
  listerLieux,
  listerPieces,
  modifierLieu,
  modifierBatiment,
  modifierPiece,
  objetsNonVides,
  retirerLieu,
  retirerBatiment,
  retirerPiece,
} from "@/lib/structure";
import { creerIdee, changerStatutIdee, listerIdees } from "@/lib/idees";
import { creerPoste, ajouterLigne, syntheseScenario, comparaisonDossier, listerLignes } from "@/lib/budget";
import { creerTache, modifierTache, ajouterDependance, retirerDependance, listerDependances, changerStatutTache, classementDossier, timelineDossier } from "@/lib/taches";
import { inviterPersonne } from "@/lib/personnes";
import { deposerDocument, proposerExtraction, validerExtraction, listerExtractions } from "@/lib/documents";
import { listerReference, libelle } from "@/lib/references";
import { demanderAssistant, construireContexte, listerEchanges } from "@/lib/ia";
import { ErreurApplicative } from "@/lib/erreurs";
import { REPONSES_CONFIANCE, REPONSES_SOURCE } from "@/domain/provenance";
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
    expect(() => modifierSurfacePiece(moi, { pieceId: piece.id, surfaceCentiemes: 4500 })).toThrow(/d'où vient/);
  });

  it("un bâtiment créé sans lieu se rattache ensuite, change de lieu, et chaque fois c'est tracé", () => {
    const d = creerDossier(moi, { nom: "Pilote" });
    const ailleurs = creerDossier(moi, { nom: "Autre dossier" });
    const terrain = creerLieu(moi, { dossierId: d.id, nom: "Terrain (fictif)", typeLieu: "terrain" });
    const bien = creerLieu(moi, { dossierId: d.id, nom: "Bien candidat (fictif)", typeLieu: "bien_candidat" });
    const lieuAilleurs = creerLieu(moi, { dossierId: ailleurs.id, nom: "Lieu d'un autre dossier", typeLieu: "terrain" });

    const bat = creerBatiment(moi, { dossierId: d.id, nom: "Maison bois" });
    expect(bat.lieuId).toBeNull();

    const changementsDeLieu = () =>
      journalAudit(moi, d.id)
        .filter((e) => e.nomEntite === "batiment" && e.action === "modification")
        .flatMap((e) => e.changements ?? []);

    expect(rattacherBatiment(moi, { batimentId: bat.id, lieuId: terrain.id }).lieuId).toBe(terrain.id);
    expect(listerBatiments(moi, d.id).find((b) => b.id === bat.id)?.lieuId).toBe(terrain.id);
    expect(changementsDeLieu()).toEqual([{ champ: "lieu_id", avant: null, apres: terrain.id }]);

    // Même lieu : rien ne change, rien n'est tracé.
    rattacherBatiment(moi, { batimentId: bat.id, lieuId: terrain.id });
    expect(changementsDeLieu()).toHaveLength(1);

    // Changer de lieu.
    expect(rattacherBatiment(moi, { batimentId: bat.id, lieuId: bien.id }).lieuId).toBe(bien.id);
    expect(changementsDeLieu()).toContainEqual({ champ: "lieu_id", avant: terrain.id, apres: bien.id });

    // Mêmes garde-fous qu'à la création, même droit.
    expect(() => rattacherBatiment(moi, { batimentId: bat.id, lieuId: lieuAilleurs.id })).toThrow(/n'appartient pas/);
    expect(() => rattacherBatiment(moi, { batimentId: bat.id, lieuId: "" })).toThrow(/lieu/i);
    expect(() => rattacherBatiment(moi, { batimentId: "inconnu", lieuId: bien.id })).toThrow(ErreurApplicative);
    const invite = inviterPersonne(moi, { dossierId: d.id, nom: "Ami", role: "lecteur" });
    expect(() => rattacherBatiment({ personneId: invite.personneId, nom: "Ami" }, { batimentId: bat.id, lieuId: terrain.id })).toThrow(ErreurApplicative);
    expect(listerBatiments(moi, d.id).find((b) => b.id === bat.id)?.lieuId).toBe(bien.id);
  });

  it("un lieu, un bâtiment et une pièce se corrigent après leur création, et la correction est tracée", () => {
    const d = creerDossier(moi, { nom: "Pilote" });
    const ailleurs = creerDossier(moi, { nom: "Autre dossier" });
    const lieu = creerLieu(moi, { dossierId: d.id, nom: "Bien candidta", typeLieu: "bien_candidat", parcelle: "AB 12", description: "à visiter" });
    const bat = creerBatiment(moi, { dossierId: d.id, lieuId: lieu.id, nom: "Batiment ancien", etat: "toiture refaite" });
    const autreBat = creerBatiment(moi, { dossierId: d.id, lieuId: lieu.id, nom: "Atelier d'essai" });
    const batAilleurs = creerBatiment(moi, { dossierId: ailleurs.id, nom: "Bâtiment d'un autre dossier" });
    const piece = creerPiece(moi, { dossierId: d.id, batimentId: bat.id, nom: "Chambr", usage: "nuit", surfaceCentiemes: 1200, surfaceSource: "estimation" });

    const changements = (entite: string) =>
      journalAudit(moi, d.id)
        .filter((e) => e.nomEntite === entite && e.action === "modification")
        .flatMap((e) => e.changements ?? []);

    // Lieu : un champ absent ne change pas, un champ vidé redevient inconnu.
    const lieuCorrige = modifierLieu(moi, { lieuId: lieu.id, nom: "Bien candidat", typeLieu: "bien_acquis", parcelle: "" });
    expect(lieuCorrige).toMatchObject({ nom: "Bien candidat", typeLieu: "bien_acquis", parcelle: null, description: "à visiter" });
    expect(lieuCorrige.adresse).toEqual(lieu.adresse); // l'adresse porte une provenance : elle garde son propre formulaire
    expect(changements("lieu")).toHaveLength(3);
    expect(changements("lieu")).toEqual(
      expect.arrayContaining([
        { champ: "nom", avant: "Bien candidta", apres: "Bien candidat" },
        { champ: "type_lieu", avant: "bien_candidat", apres: "bien_acquis" },
        { champ: "parcelle", avant: "AB 12", apres: null },
      ]),
    );
    modifierLieu(moi, { lieuId: lieu.id, nom: "Bien candidat" }); // rien ne change : rien n'est tracé
    expect(changements("lieu")).toHaveLength(3);

    // Bâtiment : son lieu se change à part (`rattacherBatiment`).
    const batCorrige = modifierBatiment(moi, { batimentId: bat.id, nom: "Bâtiment ancien", type: "pierre", etat: "", usageEnvisage: "habitation" });
    expect(batCorrige).toMatchObject({ nom: "Bâtiment ancien", type: "pierre", etat: null, usageActuel: null, usageEnvisage: "habitation", lieuId: lieu.id });
    expect(changements("batiment")).toHaveLength(4);

    // Pièce : une pièce posée dans le mauvais bâtiment se déplace, sa surface la suit.
    const pieceCorrigee = modifierPiece(moi, { pieceId: piece.id, nom: "Chambre", usage: "", batimentId: autreBat.id });
    expect(pieceCorrigee).toMatchObject({ nom: "Chambre", usage: null, batimentId: autreBat.id });
    expect(pieceCorrigee.surface).toEqual(piece.surface);
    expect(changements("piece")).toHaveLength(3);
    expect(changements("piece")).toContainEqual({ champ: "batiment_id", avant: bat.id, apres: autreBat.id });

    // Garde-fous de la création, même droit.
    expect(() => modifierLieu(moi, { lieuId: lieu.id, nom: "  " })).toThrow(/obligatoire/);
    expect(() => modifierLieu(moi, { lieuId: lieu.id, typeLieu: "chateau" })).toThrow(/type de lieu/i);
    expect(() => modifierBatiment(moi, { batimentId: bat.id, nom: "" })).toThrow(/obligatoire/);
    expect(() => modifierPiece(moi, { pieceId: piece.id, nom: " " })).toThrow(/obligatoire/);
    expect(() => modifierPiece(moi, { pieceId: piece.id, batimentId: batAilleurs.id })).toThrow(/n'appartient pas/);
    expect(() => modifierLieu(moi, { lieuId: "inconnu", nom: "x" })).toThrow(ErreurApplicative);
    const invite = inviterPersonne(moi, { dossierId: d.id, nom: "Ami", role: "lecteur" });
    const ami = { personneId: invite.personneId, nom: "Ami" };
    expect(() => modifierLieu(ami, { lieuId: lieu.id, nom: "x" })).toThrow(ErreurApplicative);
    expect(() => modifierBatiment(ami, { batimentId: bat.id, nom: "x" })).toThrow(ErreurApplicative);
    expect(() => modifierPiece(ami, { pieceId: piece.id, nom: "x" })).toThrow(ErreurApplicative);
    expect(listerLieux(moi, d.id)[0].nom).toBe("Bien candidat");
  });

  it("un lieu, un bâtiment et une pièce ne se retirent que vides, et le retrait est tracé", () => {
    const d = creerDossier(moi, { nom: "Pilote" });
    const essai = creerLieu(moi, { dossierId: d.id, nom: "Lieu d'essai (fictif)", typeLieu: "terrain", parcelle: "AB 12" });
    const garde = creerLieu(moi, { dossierId: d.id, nom: "Bien candidat (fictif)", typeLieu: "bien_candidat" });
    const abri = creerBatiment(moi, { dossierId: d.id, lieuId: essai.id, nom: "Abri d'essai", etat: "à démolir" });
    const maison = creerBatiment(moi, { dossierId: d.id, lieuId: essai.id, nom: "Atelier d'essai" });
    const cellier = creerPiece(moi, { dossierId: d.id, batimentId: abri.id, nom: "Cellier", surfaceCentiemes: 600, surfaceSource: "estimation" });
    const sejour = creerPiece(moi, { dossierId: d.id, batimentId: maison.id, nom: "Séjour" });

    // La maison et son séjour portent une idée, un poste de budget et des documents.
    const scenario = creerScenario(moi, { dossierId: d.id, nom: "Rénover" });
    const ideeMaison = creerIdee(moi, { dossierId: d.id, titre: "Auvent d'essai", batimentId: maison.id });
    const ideeSejour = creerIdee(moi, { dossierId: d.id, titre: "Verrière", pieceId: sejour.id });
    creerPoste(moi, { scenarioId: scenario.id, nom: "Toiture", batimentId: maison.id });
    const fichier = { dossierId: d.id, nomOriginal: "plan.pdf", mime: "application/pdf", octets: Buffer.from("%PDF"), typeDocument: "autre" };
    deposerDocument(moi, { ...fichier, batimentId: maison.id });
    deposerDocument(moi, { ...fichier, pieceId: sejour.id });
    deposerDocument(moi, { ...fichier, lieuId: garde.id });

    // Rien ne part tant que quelque chose y est rattaché. Le schéma, lui, emporterait les pièces
    // avec leur bâtiment et détacherait en silence idées, postes et documents.
    expect(() => retirerLieu(moi, { lieuId: essai.id })).toThrow(/2 bâtiments/);
    expect(() => retirerLieu(moi, { lieuId: garde.id })).toThrow(/1 document/);
    expect(() => retirerBatiment(moi, { batimentId: abri.id })).toThrow(/1 pièce/);
    expect(() => retirerBatiment(moi, { batimentId: maison.id })).toThrow(
      "Ce bâtiment n'est pas vide (1 pièce, 1 idée, 1 poste de budget, 1 document) : seul un bâtiment vide se retire.",
    );
    expect(() => retirerPiece(moi, { pieceId: sejour.id })).toThrow("Cette pièce n'est pas vide (1 idée, 1 document) : seule une pièce vide se retire.");
    expect(listerLieux(moi, d.id)).toHaveLength(2);
    expect(listerBatiments(moi, d.id)).toHaveLength(2);
    expect(listerPieces(moi, d.id)).toHaveLength(2);
    expect(listerIdees(moi, d.id).find((i) => i.id === ideeMaison.id)?.batimentId).toBe(maison.id);
    expect(listerIdees(moi, d.id).find((i) => i.id === ideeSejour.id)?.pieceId).toBe(sejour.id);

    // L'écran lit la même phrase que le contrôle ; un objet vide n'y figure pas.
    const nonVides = objetsNonVides(moi, d.id);
    expect(Object.keys(nonVides).sort()).toEqual([essai.id, garde.id, abri.id, maison.id, sejour.id].sort());
    expect(nonVides[maison.id]).toMatch(/1 poste de budget/);

    const retraits = (entite: string) => journalAudit(moi, d.id).filter((e) => e.nomEntite === entite && e.action === "suppression");

    // Une pièce vide part ; le journal garde ce qu'elle contenait.
    retirerPiece(moi, { pieceId: cellier.id });
    expect(listerPieces(moi, d.id).map((p) => p.nom)).toEqual(["Séjour"]);
    expect(retraits("piece")).toHaveLength(1);
    expect(retraits("piece")[0].entiteId).toBe(cellier.id);
    expect(retraits("piece")[0].changements).toEqual([
      { champ: "nom", avant: "Cellier", apres: null },
      { champ: "batiment_id", avant: abri.id, apres: null },
      { champ: "surface_centiemes", avant: 600, apres: null },
      { champ: "surface_source", avant: "estimation", apres: null },
      { champ: "surface_confiance", avant: "estime", apres: null },
    ]);
    expect(() => retirerPiece(moi, { pieceId: cellier.id })).toThrow(ErreurApplicative); // déjà retirée

    // Le bâtiment, une fois vide, part à son tour.
    retirerBatiment(moi, { batimentId: abri.id });
    expect(listerBatiments(moi, d.id).map((b) => b.nom)).toEqual(["Atelier d'essai"]);
    expect(retraits("batiment")[0].changements).toEqual([
      { champ: "nom", avant: "Abri d'essai", apres: null },
      { champ: "lieu_id", avant: essai.id, apres: null },
      { champ: "etat", avant: "à démolir", apres: null },
    ]);

    // Le lieu ne part qu'une fois son dernier bâtiment déplacé.
    expect(() => retirerLieu(moi, { lieuId: essai.id })).toThrow(/1 bâtiment\)/);
    rattacherBatiment(moi, { batimentId: maison.id, lieuId: garde.id });
    retirerLieu(moi, { lieuId: essai.id });
    expect(listerLieux(moi, d.id).map((l) => l.nom)).toEqual(["Bien candidat (fictif)"]);
    expect(retraits("lieu")[0].changements).toEqual([
      { champ: "nom", avant: "Lieu d'essai (fictif)", apres: null },
      { champ: "type_lieu", avant: "terrain", apres: null },
      { champ: "parcelle", avant: "AB 12", apres: null },
    ]);
    expect(listerBatiments(moi, d.id)[0].lieuId).toBe(garde.id);

    // Même droit qu'à la création ; qui ne peut pas retirer ne lit pas non plus ce qui est rattaché.
    const invite = inviterPersonne(moi, { dossierId: d.id, nom: "Ami", role: "lecteur" });
    const ami = { personneId: invite.personneId, nom: "Ami" };
    const vide = creerLieu(moi, { dossierId: d.id, nom: "Lieu vide (fictif)", typeLieu: "terrain" });
    expect(() => retirerLieu(ami, { lieuId: vide.id })).toThrow(ErreurApplicative);
    expect(() => retirerBatiment(ami, { batimentId: maison.id })).toThrow(ErreurApplicative);
    expect(() => retirerPiece(ami, { pieceId: sejour.id })).toThrow(ErreurApplicative);
    expect(() => objetsNonVides(ami, d.id)).toThrow(ErreurApplicative);
    expect(() => retirerLieu(moi, { lieuId: "inconnu" })).toThrow(ErreurApplicative);
    expect(listerLieux(moi, d.id)).toHaveLength(2);
  });

  it("chaque code des tables « source » et « confiance » a sa réponse en clair", () => {
    for (const r of listerReference("ref_source_donnee")) expect((REPONSES_SOURCE as Record<string, string>)[r.code]).toBeTruthy();
    for (const r of listerReference("ref_confiance")) expect((REPONSES_CONFIANCE as Record<string, string>)[r.code]).toBeTruthy();
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
    // L'écran affiche le libellé de la table de référence, jamais le code du statut.
    const statutsExtraction = listerReference("ref_statut_extraction");
    expect(extractions.map((e) => libelle(statutsExtraction, e.statut)).sort()).toEqual(expect.arrayContaining(["Corrigée puis validée", "Validée"]));
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

  it("une action se corrige après sa création, et la correction est tracée", () => {
    const d = creerDossier(moi, { nom: "Pilote" });
    const autre = creerDossier(moi, { nom: "Autre dossier" });
    const s = creerScenario(moi, { dossierId: d.id, nom: "Rénover" });
    const ailleurs = creerScenario(moi, { dossierId: autre.id, nom: "Ailleurs" });
    const t = creerTache(moi, { dossierId: d.id, description: "Demander le devi" });
    expect(classementDossier(moi, d.id).aExplorer.map((x) => x.id)).toEqual([t.id]);

    // Une action créée sans échéance peut en recevoir une : elle change alors de colonne.
    const corrigee = modifierTache(moi, { tacheId: t.id, description: " Demander le devis ", echeance: "2020-01-01", responsable: "moi", scenarioId: s.id, estJalon: true });
    expect(corrigee).toMatchObject({ description: "Demander le devis", echeance: "2020-01-01", responsable: "moi", scenarioId: s.id, estJalon: true, statut: "a_faire" });
    expect(classementDossier(moi, d.id).aujourdhui.map((x) => x.id)).toEqual([t.id]);

    // Seuls les champs changés sont tracés ; une saisie identique ne trace rien.
    const traces = () => journalAudit(moi, d.id).filter((e) => e.entiteId === t.id && e.action === "modification");
    expect(traces().map((e) => e.changements)).toEqual([
      [
        { champ: "description", avant: "Demander le devi", apres: "Demander le devis" },
        { champ: "echeance", avant: null, apres: "2020-01-01" },
        { champ: "responsable", avant: null, apres: "moi" },
        { champ: "scenario_id", avant: null, apres: s.id },
        { champ: "est_jalon", avant: 0, apres: 1 },
      ],
    ]);
    modifierTache(moi, { tacheId: t.id, description: "Demander le devis", echeance: "2020-01-01", responsable: "moi", scenarioId: s.id, estJalon: true });
    expect(traces()).toHaveLength(1);

    // Un champ absent reste inchangé ; un champ vide est effacé. L'échéance redevient alors
    // inconnue, jamais une date inventée.
    expect(modifierTache(moi, { tacheId: t.id, responsable: "courtier" })).toMatchObject({ description: "Demander le devis", echeance: "2020-01-01", responsable: "courtier", estJalon: true });
    expect(modifierTache(moi, { tacheId: t.id, echeance: "", responsable: "", scenarioId: "", estJalon: false })).toMatchObject({ echeance: null, responsable: null, scenarioId: null, estJalon: false });

    // Mêmes garde-fous qu'à la création, même droit.
    expect(() => modifierTache(moi, { tacheId: t.id, description: "  " })).toThrow(/obligatoire/);
    expect(() => modifierTache(moi, { tacheId: t.id, echeance: "01/01/2027" })).toThrow(/AAAA-MM-JJ/);
    expect(() => modifierTache(moi, { tacheId: t.id, scenarioId: ailleurs.id })).toThrow(/n'appartient pas/);
    const invite = inviterPersonne(moi, { dossierId: d.id, nom: "Ami", role: "lecteur" });
    expect(() => modifierTache({ personneId: invite.personneId, nom: "Ami" }, { tacheId: t.id, description: "x" })).toThrow(ErreurApplicative);
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
