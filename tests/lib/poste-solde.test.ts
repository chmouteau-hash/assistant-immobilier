// Facture partielle et poste soldé (issue #4, bloc 2). Tant qu'un poste n'est pas soldé, une
// facture partielle ne fait pas baisser son montant de référence ; un poste se solde et se rouvre à
// la main, avec un motif ; un poste soldé n'accepte plus de facture.

import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { obtenirBase, reinitialiserBasePourTests } from "@/lib/db/client";
import { creerDossier, creerScenario, configurerIA, journalAudit, obtenirDossier } from "@/lib/dossiers";
import { creerPoste, ajouterLigne, modifierLigne, solderPoste, rouvrirPoste, listerPostes, syntheseScenario } from "@/lib/budget";
import { deposerDocument, proposerExtraction, validerExtraction, listerExtractions } from "@/lib/documents";
import { inviterPersonne } from "@/lib/personnes";
import { construireContexte } from "@/lib/ia";
import { ErreurApplicative } from "@/lib/erreurs";
import type { Acteur } from "@/lib/acces";

const moi: Acteur = { personneId: "utilisateur-local", nom: "Utilisateur local" };

describe("facture partielle et poste soldé", () => {
  beforeEach(() => {
    reinitialiserBasePourTests();
    process.env.ASSISTANT_FICHIERS_PATH = mkdtempSync(path.join(tmpdir(), "assistant-fichiers-"));
  });

  // Un dossier, un scénario, un poste sans montant.
  function chantier() {
    const dossier = creerDossier(moi, { nom: "Essai" });
    const scenario = creerScenario(moi, { dossierId: dossier.id, nom: "Scénario d'essai" });
    const poste = creerPoste(moi, { scenarioId: scenario.id, nom: "Charpente" });
    const synthese = () => syntheseScenario(moi, scenario.id);
    const montant = (typeMontant: string, montantCentimes: number, source = "saisie") => ajouterLigne(moi, { posteId: poste.id, montantCentimes, typeMontant, source });
    return { dossier, poste, synthese, montant };
  }

  it("une facture partielle ne fait pas baisser le total ; soldé, le poste vaut son facturé", () => {
    const { dossier, poste, synthese, montant } = chantier();
    expect(poste.solde).toBe(false);
    montant("devis", 1_000_000);
    montant("facture", 300_000);
    expect(synthese().postes[0]).toMatchObject({ referenceCentimes: 1_000_000, natureReference: "devis", solde: false });
    expect(synthese().totalReferenceCentimes).toBe(1_000_000);

    // 950 000 facturés en deux fois : le devis reste la référence tant que le poste n'est pas soldé.
    montant("facture", 650_000);
    expect(synthese().totalReferenceCentimes).toBe(1_000_000);

    expect(solderPoste(moi, { posteId: poste.id, motif: "facture finale reçue" }).solde).toBe(true);
    expect(synthese().postes[0]).toMatchObject({ referenceCentimes: 950_000, natureReference: "facture", solde: true });
    expect(synthese().totalReferenceCentimes).toBe(950_000);
    expect(listerPostes(moi, dossier.id)[0].solde).toBe(true);

    expect(rouvrirPoste(moi, { posteId: poste.id, motif: "facture complémentaire annoncée" }).solde).toBe(false);
    expect(synthese().postes[0]).toMatchObject({ referenceCentimes: 1_000_000, natureReference: "devis", solde: false });
  });

  it("un poste qui n'a qu'une estimation suit la même règle", () => {
    const { poste, synthese, montant } = chantier();
    montant("estimation", 1_800_000, "estimation");
    montant("facture", 420_000);
    expect(synthese()).toMatchObject({ totalReferenceCentimes: 1_800_000, nbPostesSurEstimation: 1 });

    solderPoste(moi, { posteId: poste.id, motif: "aucune autre facture" });
    expect(synthese()).toMatchObject({ totalReferenceCentimes: 420_000, nbPostesSurEstimation: 0 });
  });

  it("solder et rouvrir : un motif, au moins une facture retenue, le droit d'écrire le budget, une trace", () => {
    const { dossier, poste, montant } = chantier();
    montant("devis", 1_000_000);
    expect(() => solderPoste(moi, { posteId: poste.id, motif: " " })).toThrow(/motif/);
    expect(() => solderPoste(moi, { posteId: poste.id, motif: "terminé" })).toThrow(/n'en a aucune/);

    // Une facture écartée ne compte pas.
    const facture = montant("facture", 300_000);
    modifierLigne(moi, { ligneId: facture.id, statut: "ecartee", motif: "saisie en double" });
    expect(() => solderPoste(moi, { posteId: poste.id, motif: "terminé" })).toThrow(/n'en a aucune/);
    modifierLigne(moi, { ligneId: facture.id, statut: "active", motif: "c'était la bonne" });

    const invite = inviterPersonne(moi, { dossierId: dossier.id, nom: "Ami", role: "lecteur" });
    const lecteur: Acteur = { personneId: invite.personneId, nom: "Ami" };
    expect(() => solderPoste(lecteur, { posteId: poste.id, motif: "terminé" })).toThrow(ErreurApplicative);
    expect(() => solderPoste(moi, { posteId: "inconnu", motif: "terminé" })).toThrow(ErreurApplicative);
    expect(listerPostes(moi, dossier.id)[0].solde).toBe(false);

    solderPoste(moi, { posteId: poste.id, motif: "facture finale reçue" });
    solderPoste(moi, { posteId: poste.id, motif: "une seconde fois" }); // déjà soldé : rien ne change, rien n'est tracé
    expect(() => rouvrirPoste(moi, { posteId: poste.id, motif: "" })).toThrow(/motif/);
    expect(() => rouvrirPoste(lecteur, { posteId: poste.id, motif: "erreur" })).toThrow(ErreurApplicative);
    rouvrirPoste(moi, { posteId: poste.id, motif: "facture complémentaire annoncée" });

    const traces = journalAudit(moi, dossier.id).filter((e) => e.nomEntite === "poste_budget" && e.action === "transition_statut");
    expect(traces).toHaveLength(2);
    expect(traces.map((e) => ({ motif: e.motif, changements: e.changements }))).toEqual(
      expect.arrayContaining([
        { motif: "facture finale reçue", changements: [{ champ: "solde", avant: 0, apres: 1 }] },
        { motif: "facture complémentaire annoncée", changements: [{ champ: "solde", avant: 1, apres: 0 }] },
      ]),
    );
  });

  it("un poste soldé n'accepte plus de facture : ni saisie, ni par modification, ni depuis un document", () => {
    const { dossier, poste, synthese, montant } = chantier();
    const devis = montant("devis", 1_000_000);
    const facture = montant("facture", 950_000);
    solderPoste(moi, { posteId: poste.id, motif: "facture finale reçue" });

    expect(() => montant("facture", 50_000)).toThrow(/rouvrez-le/);
    expect(() => modifierLigne(moi, { ligneId: devis.id, typeMontant: "facture", motif: "erreur de nature" })).toThrow(/rouvrez-le/);

    // Les autres natures restent permises, et une facture déjà là se corrige.
    montant("paiement", 950_000);
    expect(synthese().postes[0]).toMatchObject({ statut: "paye", solde: true, referenceCentimes: 950_000 });
    modifierLigne(moi, { ligneId: facture.id, montantCentimes: 940_000, motif: "avoir reçu" });
    expect(synthese().postes[0].referenceCentimes).toBe(940_000);

    // Depuis un document : la validation est refusée en bloc, aucun champ n'est validé.
    const document = deposerDocument(moi, { dossierId: dossier.id, nomOriginal: "facture.pdf", mime: "application/pdf", octets: Buffer.from("%PDF"), typeDocument: "facture", posteId: poste.id });
    proposerExtraction(moi, { documentId: document.id, champs: { montant_centimes: "500" }, source: "saisie" });
    expect(() => validerExtraction(moi, { documentId: document.id, corrections: {} })).toThrow(/rouvrez-le/);
    expect(listerExtractions(moi, document.id).every((e) => e.statut === "proposee")).toBe(true);

    // Rouvert, le poste accepte de nouveau une facture.
    rouvrirPoste(moi, { posteId: poste.id, motif: "facture complémentaire reçue" });
    expect(validerExtraction(moi, { documentId: document.id, corrections: {} }).ligne).toMatchObject({ typeMontant: "facture", montantCentimes: 50_000 });
  });

  it("l'assistant lit les mêmes montants de référence que l'écran Budget", () => {
    const { dossier, poste, montant } = chantier();
    montant("devis", 1_000_000);
    montant("facture", 300_000);
    configurerIA(moi, dossier.id, { activee: true, perimetre: ["scenarios", "budget"], fournisseur: "regles_locales" });
    const contexte = () => construireContexte(moi, obtenirDossier(moi, dossier.id));

    expect(contexte().scenarios?.[0].totalReferenceCentimes).toBe(1_000_000);
    expect(contexte().budget?.[0]).toMatchObject({ referenceCentimes: 1_000_000, natureReference: "devis" });

    solderPoste(moi, { posteId: poste.id, motif: "facture finale reçue" });
    expect(contexte().scenarios?.[0].totalReferenceCentimes).toBe(300_000);
    expect(contexte().budget?.[0]).toMatchObject({ referenceCentimes: 300_000, natureReference: "facture" });
  });

  it("la base refuse une autre valeur que 0 ou 1 pour « soldé »", () => {
    const { poste } = chantier();
    expect(() => obtenirBase().prepare(`UPDATE poste_budget SET solde = 2 WHERE id = ?`).run(poste.id)).toThrow(/CHECK/i);
  });
});
