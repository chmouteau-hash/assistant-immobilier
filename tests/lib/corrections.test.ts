// Corriger après coup, et détacher : une idée, un scénario, un poste de budget, un document
// (issue #22). Même règle partout : un champ absent ne change pas, un champ vidé redevient inconnu
// ou détaché, seuls les champs changés sont tracés, et rien n'est tracé si rien ne change.

import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { reinitialiserBasePourTests } from "@/lib/db/client";
import { creerDossier, creerScenario, changerStatutScenario, listerDecisions, listerScenarios, modifierScenario, journalAudit } from "@/lib/dossiers";
import { creerLieu, creerBatiment, creerPiece, retirerBatiment, retirerLieu, retirerPiece } from "@/lib/structure";
import { creerIdee, changerStatutIdee, listerIdees, modifierIdee } from "@/lib/idees";
import { creerPoste, ajouterLigne, listerLignes, listerPostes, modifierPoste, syntheseScenario } from "@/lib/budget";
import { deposerDocument, listerDocuments, modifierDocument } from "@/lib/documents";
import { creerTache, listerTaches, modifierTache } from "@/lib/taches";
import { inviterPersonne } from "@/lib/personnes";
import { ErreurApplicative } from "@/lib/erreurs";
import type { Acteur } from "@/lib/acces";

const moi: Acteur = { personneId: "utilisateur-local", nom: "Utilisateur local" };

describe("corriger et détacher", () => {
  beforeEach(() => {
    reinitialiserBasePourTests();
    process.env.ASSISTANT_FICHIERS_PATH = mkdtempSync(path.join(tmpdir(), "assistant-fichiers-"));
  });

  const changements = (dossierId: string, entite: string) =>
    journalAudit(moi, dossierId)
      .filter((e) => e.nomEntite === entite && e.action === "modification")
      .flatMap((e) => e.changements ?? []);

  function lecteurDe(dossierId: string): Acteur {
    const invite = inviterPersonne(moi, { dossierId, nom: "Ami", role: "lecteur" });
    return { personneId: invite.personneId, nom: "Ami" };
  }

  it("une idée se corrige et change de rattachement, et c'est tracé", () => {
    const d = creerDossier(moi, { nom: "Essai" });
    const ailleurs = creerDossier(moi, { nom: "Autre essai" });
    const scenario = creerScenario(moi, { dossierId: d.id, nom: "Scénario d'essai" });
    const remise = creerBatiment(moi, { dossierId: d.id, nom: "Remise d'essai" });
    const reduit = creerPiece(moi, { dossierId: d.id, batimentId: remise.id, nom: "Réduit d'essai" });
    const batAilleurs = creerBatiment(moi, { dossierId: ailleurs.id, nom: "Bâtiment d'un autre dossier" });
    const idee = creerIdee(moi, { dossierId: d.id, titre: "Auvnet", description: "côté jardin", batimentId: remise.id, pieceId: reduit.id });

    // Texte : un champ absent ne change pas, une description vidée redevient inconnue.
    const corrigee = modifierIdee(moi, { ideeId: idee.id, titre: "Auvent", description: "" });
    expect(corrigee).toMatchObject({ titre: "Auvent", description: null, batimentId: remise.id, pieceId: reduit.id, scenarioId: null, statut: "idee" });
    expect(changements(d.id, "idee")).toEqual([
      { champ: "titre", avant: "Auvnet", apres: "Auvent" },
      { champ: "description", avant: "côté jardin", apres: null },
    ]);
    modifierIdee(moi, { ideeId: idee.id, titre: "Auvent" }); // rien ne change : rien n'est tracé
    expect(changements(d.id, "idee")).toHaveLength(2);

    // Rattachements : chacun se pose, se change et se retire, sans toucher aux autres.
    expect(modifierIdee(moi, { ideeId: idee.id, scenarioId: scenario.id })).toMatchObject({ scenarioId: scenario.id, batimentId: remise.id, pieceId: reduit.id });
    expect(modifierIdee(moi, { ideeId: idee.id, batimentId: "", pieceId: null })).toMatchObject({ scenarioId: scenario.id, batimentId: null, pieceId: null });
    expect(changements(d.id, "idee")).toEqual(
      expect.arrayContaining([
        { champ: "scenario_id", avant: null, apres: scenario.id },
        { champ: "batiment_id", avant: remise.id, apres: null },
        { champ: "piece_id", avant: reduit.id, apres: null },
      ]),
    );
    expect(changements(d.id, "idee")).toHaveLength(5);

    // Garde-fous de la création, même droit.
    expect(() => modifierIdee(moi, { ideeId: idee.id, titre: "  " })).toThrow(/obligatoire/);
    expect(() => modifierIdee(moi, { ideeId: idee.id, batimentId: batAilleurs.id })).toThrow(/n'appartient pas/);
    expect(() => modifierIdee(moi, { ideeId: "inconnue", titre: "x" })).toThrow(ErreurApplicative);
    expect(() => modifierIdee(lecteurDe(d.id), { ideeId: idee.id, titre: "x" })).toThrow(ErreurApplicative);
    expect(listerIdees(moi, d.id)[0]).toMatchObject({ titre: "Auvent", batimentId: null });

    // Une décision déjà prise garde le titre que l'idée portait.
    changerStatutIdee(moi, { ideeId: idee.id, nouveauStatut: "retenue", motif: "utile par temps de pluie" });
    modifierIdee(moi, { ideeId: idee.id, titre: "Auvent vitré" });
    expect(listerDecisions(moi, d.id)[0].choix).toContain("« Auvent »");
  });

  it("un scénario se corrige, et la décision déjà prise garde le nom qu'il portait", () => {
    const d = creerDossier(moi, { nom: "Essai" });
    const scenario = creerScenario(moi, { dossierId: d.id, nom: "Scenario dessai", description: "à préciser" });
    changerStatutScenario(moi, { scenarioId: scenario.id, nouveauStatut: "retenue", motif: "le seul étudié" });

    const corrige = modifierScenario(moi, { scenarioId: scenario.id, nom: "Scénario d'essai", description: "" });
    expect(corrige).toMatchObject({ nom: "Scénario d'essai", description: null, statut: "retenue" });
    expect(changements(d.id, "scenario")).toEqual([
      { champ: "nom", avant: "Scenario dessai", apres: "Scénario d'essai" },
      { champ: "description", avant: "à préciser", apres: null },
    ]);
    modifierScenario(moi, { scenarioId: scenario.id, nom: "Scénario d'essai" }); // rien ne change
    expect(changements(d.id, "scenario")).toHaveLength(2);
    // Une décision dit ce qui a été décidé, avec les mots du moment : elle n'est pas réécrite.
    expect(listerDecisions(moi, d.id)[0].choix).toContain("Scenario dessai");

    expect(() => modifierScenario(moi, { scenarioId: scenario.id, nom: "" })).toThrow(/obligatoire/);
    expect(() => modifierScenario(moi, { scenarioId: "inconnu", nom: "x" })).toThrow(ErreurApplicative);
    expect(() => modifierScenario(lecteurDe(d.id), { scenarioId: scenario.id, nom: "x" })).toThrow(ErreurApplicative);
    expect(listerScenarios(moi, d.id)[0].nom).toBe("Scénario d'essai");
  });

  it("un poste se corrige, ses lignes suivent son nom, et il se détache de son bâtiment", () => {
    const d = creerDossier(moi, { nom: "Essai" });
    const ailleurs = creerDossier(moi, { nom: "Autre essai" });
    const scenario = creerScenario(moi, { dossierId: d.id, nom: "Scénario d'essai" });
    const remise = creerBatiment(moi, { dossierId: d.id, nom: "Remise d'essai" });
    const batAilleurs = creerBatiment(moi, { dossierId: ailleurs.id, nom: "Bâtiment d'un autre dossier" });
    const poste = creerPoste(moi, { scenarioId: scenario.id, nom: "Poste dessai", categorie: "divers", batimentId: remise.id });
    creerPoste(moi, { scenarioId: scenario.id, nom: "Autre poste" });
    ajouterLigne(moi, { posteId: poste.id, montantCentimes: 12_300, typeMontant: "devis", source: "saisie" });

    const corrige = modifierPoste(moi, { posteId: poste.id, nom: "Poste d'essai", categorie: "" });
    expect(corrige).toMatchObject({ nom: "Poste d'essai", categorie: null, batimentId: remise.id });
    // Chaque ligne garde une copie du nom de son poste : elle est mise à jour avec lui.
    expect(listerLignes(moi, d.id).map((l) => l.poste)).toEqual(["Poste d'essai"]);
    expect(syntheseScenario(moi, scenario.id).postes.map((p) => p.nom).sort()).toEqual(["Autre poste", "Poste d'essai"]);
    expect(changements(d.id, "poste_budget")).toEqual([
      { champ: "nom", avant: "Poste dessai", apres: "Poste d'essai" },
      { champ: "categorie", avant: "divers", apres: null },
    ]);
    modifierPoste(moi, { posteId: poste.id, nom: "Poste d'essai" }); // rien ne change
    expect(changements(d.id, "poste_budget")).toHaveLength(2);

    expect(modifierPoste(moi, { posteId: poste.id, batimentId: "" }).batimentId).toBeNull();
    expect(changements(d.id, "poste_budget")).toContainEqual({ champ: "batiment_id", avant: remise.id, apres: null });
    expect(modifierPoste(moi, { posteId: poste.id, batimentId: remise.id }).batimentId).toBe(remise.id);

    // Un nom reste unique dans son scénario ; un bâtiment vient du même dossier, à la création aussi.
    expect(() => modifierPoste(moi, { posteId: poste.id, nom: "Autre poste" })).toThrow(/existe déjà/);
    expect(() => modifierPoste(moi, { posteId: poste.id, nom: " " })).toThrow(/obligatoire/);
    expect(() => modifierPoste(moi, { posteId: poste.id, batimentId: batAilleurs.id })).toThrow(/n'appartient pas/);
    expect(() => creerPoste(moi, { scenarioId: scenario.id, nom: "Poste égaré", batimentId: batAilleurs.id })).toThrow(/n'appartient pas/);
    expect(() => modifierPoste(moi, { posteId: "inconnu", nom: "x" })).toThrow(ErreurApplicative);
    expect(() => modifierPoste(lecteurDe(d.id), { posteId: poste.id, nom: "x" })).toThrow(ErreurApplicative);
    expect(listerPostes(moi, d.id)).toHaveLength(2);
  });

  it("un document se reclasse : type, date, note et rattachements", () => {
    const d = creerDossier(moi, { nom: "Essai" });
    const ailleurs = creerDossier(moi, { nom: "Autre essai" });
    const scenario = creerScenario(moi, { dossierId: d.id, nom: "Scénario d'essai" });
    const lieu = creerLieu(moi, { dossierId: d.id, nom: "Lieu d'essai (fictif)", typeLieu: "terrain" });
    const remise = creerBatiment(moi, { dossierId: d.id, lieuId: lieu.id, nom: "Remise d'essai" });
    const reduit = creerPiece(moi, { dossierId: d.id, batimentId: remise.id, nom: "Réduit d'essai" });
    const poste = creerPoste(moi, { scenarioId: scenario.id, nom: "Poste d'essai" });
    const idee = creerIdee(moi, { dossierId: d.id, titre: "Auvent" });
    const tache = creerTache(moi, { dossierId: d.id, description: "Demander un devis d'essai" });
    const lieuAilleurs = creerLieu(moi, { dossierId: ailleurs.id, nom: "Lieu d'un autre dossier", typeLieu: "terrain" });
    const fichier = { dossierId: d.id, nomOriginal: "plan-essai.pdf", mime: "application/pdf", octets: Buffer.from("%PDF") };
    const doc = deposerDocument(moi, { ...fichier, typeDocument: "autre", note: "à trier", lieuId: lieu.id, batimentId: remise.id, pieceId: reduit.id });

    const reclasse = modifierDocument(moi, { documentId: doc.id, typeDocument: "devis", dateDocument: "2026-09-30", note: "" });
    expect(reclasse).toMatchObject({ typeDocument: "devis", dateDocument: "2026-09-30", note: null, lieuId: lieu.id, batimentId: remise.id, pieceId: reduit.id });
    expect(reclasse).toMatchObject({ nomOriginal: doc.nomOriginal, sha256: doc.sha256, cheminRelatif: doc.cheminRelatif }); // le fichier ne bouge pas
    expect(changements(d.id, "document")).toEqual([
      { champ: "type_document", avant: "autre", apres: "devis" },
      { champ: "date_document", avant: null, apres: "2026-09-30" },
      { champ: "note", avant: "à trier", apres: null },
    ]);
    modifierDocument(moi, { documentId: doc.id, typeDocument: "devis" }); // rien ne change
    expect(changements(d.id, "document")).toHaveLength(3);

    // Un rattachement absent ne change pas, un rattachement vide est détaché.
    const rattache = modifierDocument(moi, { documentId: doc.id, lieuId: "", batimentId: null, scenarioId: scenario.id, posteId: poste.id, ideeId: idee.id, tacheId: tache.id });
    expect(rattache).toMatchObject({ lieuId: null, batimentId: null, pieceId: reduit.id, scenarioId: scenario.id, posteId: poste.id, ideeId: idee.id, tacheId: tache.id });
    expect(changements(d.id, "document")).toHaveLength(9);
    expect(changements(d.id, "document")).toContainEqual({ champ: "lieu_id", avant: lieu.id, apres: null });

    expect(() => modifierDocument(moi, { documentId: doc.id, lieuId: lieuAilleurs.id })).toThrow(/n'appartient pas/);
    expect(() => modifierDocument(moi, { documentId: doc.id, typeDocument: "parchemin" })).toThrow(/type de document/i);
    expect(() => modifierDocument(moi, { documentId: doc.id, dateDocument: "30/09/2026" })).toThrow(/AAAA-MM-JJ/);
    expect(() => deposerDocument(moi, { ...fichier, typeDocument: "parchemin" })).toThrow(/type de document/i);
    expect(() => modifierDocument(moi, { documentId: "inconnu", note: "x" })).toThrow(ErreurApplicative);
    expect(() => modifierDocument(lecteurDe(d.id), { documentId: doc.id, note: "x" })).toThrow(ErreurApplicative);
    expect(listerDocuments(moi, d.id)).toHaveLength(1);
  });

  it("un rattachement ne se change pas sans pouvoir lire ce qu'il vise", () => {
    const d = creerDossier(moi, { nom: "Essai" });
    const scenario = creerScenario(moi, { dossierId: d.id, nom: "Scénario d'essai" });
    const remise = creerBatiment(moi, { dossierId: d.id, nom: "Remise d'essai" });
    const poste = creerPoste(moi, { scenarioId: scenario.id, nom: "Poste d'essai", batimentId: remise.id });
    const tache = creerTache(moi, { dossierId: d.id, description: "Demander un devis d'essai", scenarioId: scenario.id });
    const fichier = { dossierId: d.id, nomOriginal: "plan-essai.pdf", mime: "application/pdf", octets: Buffer.from("%PDF"), typeDocument: "autre" };
    const doc = deposerDocument(moi, { ...fichier, scenarioId: scenario.id, batimentId: remise.id });
    // Un professionnel écrit les documents, le budget et les actions de son périmètre, sans lire
    // les scénarios ni les lieux : l'écran ne lui propose pas ces listes.
    const invite = inviterPersonne(moi, {
      dossierId: d.id,
      nom: "Artisan (fictif)",
      type: "professionnel",
      profession: "couvreur",
      role: "professionnel",
      perimetre: ["documents", "budget", "taches"],
      finalite: "Devis",
    });
    const artisan: Acteur = { personneId: invite.personneId, nom: "Artisan (fictif)" };

    // Ce qui ne touche à aucun de ces rattachements lui reste permis.
    expect(modifierDocument(artisan, { documentId: doc.id, note: "reçu", posteId: poste.id })).toMatchObject({ note: "reçu", posteId: poste.id });
    expect(modifierPoste(artisan, { posteId: poste.id, categorie: "couverture" }).categorie).toBe("couverture");
    expect(modifierTache(artisan, { tacheId: tache.id, responsable: "Artisan (fictif)" }).responsable).toBe("Artisan (fictif)");

    // Une requête directe ne détache pas, et ne rattache pas, ce qu'il ne peut pas lire.
    expect(() => modifierDocument(artisan, { documentId: doc.id, scenarioId: "" })).toThrow(ErreurApplicative);
    expect(() => modifierDocument(artisan, { documentId: doc.id, batimentId: "" })).toThrow(ErreurApplicative);
    expect(() => modifierPoste(artisan, { posteId: poste.id, batimentId: "" })).toThrow(ErreurApplicative);
    expect(() => modifierTache(artisan, { tacheId: tache.id, scenarioId: "" })).toThrow(ErreurApplicative);
    expect(listerDocuments(moi, d.id)[0]).toMatchObject({ scenarioId: scenario.id, batimentId: remise.id });
    expect(listerPostes(moi, d.id)[0].batimentId).toBe(remise.id);
    expect(listerTaches(moi, d.id)[0].scenarioId).toBe(scenario.id);
    // Chaque refus est inscrit au journal, comme tout accès refusé.
    expect(journalAudit(moi, d.id).filter((e) => e.action === "acces_refuse")).toHaveLength(4);
  });

  it("un bâtiment, sa pièce et son lieu se retirent une fois l'idée, le poste et les documents détachés", () => {
    const d = creerDossier(moi, { nom: "Essai" });
    const scenario = creerScenario(moi, { dossierId: d.id, nom: "Scénario d'essai" });
    const lieu = creerLieu(moi, { dossierId: d.id, nom: "Lieu d'essai (fictif)", typeLieu: "terrain" });
    const remise = creerBatiment(moi, { dossierId: d.id, lieuId: lieu.id, nom: "Remise d'essai" });
    const reduit = creerPiece(moi, { dossierId: d.id, batimentId: remise.id, nom: "Réduit d'essai" });
    const idee = creerIdee(moi, { dossierId: d.id, titre: "Auvent", batimentId: remise.id, pieceId: reduit.id });
    const poste = creerPoste(moi, { scenarioId: scenario.id, nom: "Poste d'essai", batimentId: remise.id });
    const fichier = { dossierId: d.id, nomOriginal: "plan-essai.pdf", mime: "application/pdf", octets: Buffer.from("%PDF"), typeDocument: "autre" };
    const doc = deposerDocument(moi, { ...fichier, lieuId: lieu.id, batimentId: remise.id, pieceId: reduit.id });

    expect(() => retirerPiece(moi, { pieceId: reduit.id })).toThrow(/1 idée, 1 document/);
    expect(() => retirerBatiment(moi, { batimentId: remise.id })).toThrow(/1 pièce, 1 idée, 1 poste de budget, 1 document/);

    modifierIdee(moi, { ideeId: idee.id, batimentId: "", pieceId: "" });
    modifierPoste(moi, { posteId: poste.id, batimentId: "" });
    modifierDocument(moi, { documentId: doc.id, lieuId: "", batimentId: "", pieceId: "" });

    retirerPiece(moi, { pieceId: reduit.id });
    retirerBatiment(moi, { batimentId: remise.id });
    retirerLieu(moi, { lieuId: lieu.id });
    // Rien n'a disparu avec eux : l'idée, le poste et le document sont toujours là, sans rattachement.
    expect(listerIdees(moi, d.id)).toHaveLength(1);
    expect(listerPostes(moi, d.id)).toHaveLength(1);
    expect(listerDocuments(moi, d.id)[0]).toMatchObject({ lieuId: null, batimentId: null, pieceId: null });
  });
});
