// Surface d'un bâtiment (issue #2, bloc « Bâtiment »). Base en mémoire, données fictives.
//
// Ce que ces tests gardent : la surface d'un bâtiment est une valeur tracée, « à renseigner » tant
// qu'elle n'est pas connue ; elle obéit aux règles de provenance, redites par la base ; elle ne
// dépend pas des pièces ; tout changement est tracé ; un lecteur ne change rien ; retirer un
// bâtiment, ou un lieu, garde au journal tout ce qui avait été saisi ; l'export l'emporte, et
// l'assistant ne la reçoit pas.

import { beforeEach, describe, expect, it } from "vitest";
import { obtenirBase, reinitialiserBasePourTests } from "@/lib/db/client";
import { configurerIA, creerDossier, journalAudit, obtenirDossier } from "@/lib/dossiers";
import {
  changerStatutBien,
  creerBatiment,
  creerLieu,
  creerPiece,
  listerBatiments,
  modifierPrixDemandeLieu,
  modifierSurfaceBatiment,
  modifierSurfacePiece,
  retirerBatiment,
  retirerLieu,
} from "@/lib/structure";
import { inviterPersonne } from "@/lib/personnes";
import { construireContexte } from "@/lib/ia";
import { construireExport } from "@/lib/export";
import { serialiserContexte } from "@/domain/ia/types";
import { ErreurApplicative } from "@/lib/erreurs";
import type { Acteur } from "@/lib/acces";

const moi: Acteur = { personneId: "utilisateur-local", nom: "Utilisateur local" };
const A_RENSEIGNER = { valeur: null, source: null, confiance: "a_renseigner" };

describe("surface d'un bâtiment", () => {
  beforeEach(() => reinitialiserBasePourTests());

  function dossierEtBatiment() {
    const d = creerDossier(moi, { nom: "Dossier d'essai (fictif)" });
    const lieu = creerLieu(moi, { dossierId: d.id, nom: "Bien d'essai (fictif)", typeLieu: "bien_candidat" });
    const bat = creerBatiment(moi, { dossierId: d.id, lieuId: lieu.id, nom: "Maison d'essai (fictive)" });
    return { d, lieu, bat };
  }
  const surfaceDe = (dossierId: string, batimentId: string) => listerBatiments(moi, dossierId).find((b) => b.id === batimentId)!.surface;
  const evenements = (dossierId: string, entite: string, action: string) => journalAudit(moi, dossierId).filter((e) => e.nomEntite === entite && e.action === action);

  it("est à renseigner tant qu'on ne l'a pas dite", () => {
    const { d, bat } = dossierEtBatiment();
    expect(bat.surface).toEqual(A_RENSEIGNER);
    expect(surfaceDe(d.id, bat.id)).toEqual(A_RENSEIGNER);
  });

  it("suit les règles de provenance : estimée, d'annonce, saisie", () => {
    const { bat } = dossierEtBatiment();
    expect(modifierSurfaceBatiment(moi, { batimentId: bat.id, surfaceCentiemes: 12_050, surfaceSource: "estimation" }).surface).toEqual({ valeur: 12_050, source: "estimation", confiance: "estime" });
    expect(modifierSurfaceBatiment(moi, { batimentId: bat.id, surfaceCentiemes: 11_000, surfaceSource: "source_externe" }).surface).toEqual({ valeur: 11_000, source: "source_externe", confiance: "a_confirmer" });
    expect(() => modifierSurfaceBatiment(moi, { batimentId: bat.id, surfaceCentiemes: 11_000, surfaceSource: "source_externe", surfaceConfiance: "connu" })).toThrow(/source externe/);
    expect(() => modifierSurfaceBatiment(moi, { batimentId: bat.id, surfaceCentiemes: 11_000, surfaceSource: "estimation", surfaceConfiance: "connu" })).toThrow(/estimation/);
    expect(modifierSurfaceBatiment(moi, { batimentId: bat.id, surfaceCentiemes: 10_800, surfaceSource: "saisie" }).surface.confiance).toBe("connu");
  });

  it("refuse une surface sans source, nulle ou négative ; vidée, elle redevient à renseigner", () => {
    const { bat } = dossierEtBatiment();
    expect(() => modifierSurfaceBatiment(moi, { batimentId: bat.id, surfaceCentiemes: 5_000 })).toThrow(/d'où vient/);
    expect(() => modifierSurfaceBatiment(moi, { batimentId: bat.id, surfaceCentiemes: 0, surfaceSource: "saisie" })).toThrow(/positif/);
    expect(() => modifierSurfaceBatiment(moi, { batimentId: bat.id, surfaceCentiemes: -100, surfaceSource: "saisie" })).toThrow(/positif/);
    modifierSurfaceBatiment(moi, { batimentId: bat.id, surfaceCentiemes: 5_000, surfaceSource: "saisie" });
    expect(modifierSurfaceBatiment(moi, { batimentId: bat.id, surfaceCentiemes: null }).surface).toEqual(A_RENSEIGNER);
  });

  it("la base refuse d'elle-même une surface d'annonce présentée comme connue, ou nulle", () => {
    const { bat } = dossierEtBatiment();
    const ecrire = (centiemes: number, source: string, confiance: string) =>
      obtenirBase().prepare(`UPDATE batiment SET surface_centiemes = ?, surface_source = ?, surface_confiance = ? WHERE id = ?`).run(centiemes, source, confiance, bat.id);
    expect(() => ecrire(100, "source_externe", "connu")).toThrow(/CHECK/);
    expect(() => ecrire(100, "estimation", "connu")).toThrow(/CHECK/);
    expect(() => ecrire(0, "saisie", "connu")).toThrow(/CHECK/);
    expect(() => ecrire(100, "source_externe", "a_confirmer")).not.toThrow();
  });

  it("ne dépend pas des pièces : renseigner une pièce ne la change pas", () => {
    const { d, bat } = dossierEtBatiment();
    const piece = creerPiece(moi, { dossierId: d.id, batimentId: bat.id, nom: "Séjour d'essai" });
    modifierSurfacePiece(moi, { pieceId: piece.id, surfaceCentiemes: 3_000, surfaceSource: "saisie" });
    expect(surfaceDe(d.id, bat.id)).toEqual(A_RENSEIGNER);
    modifierSurfaceBatiment(moi, { batimentId: bat.id, surfaceCentiemes: 9_000, surfaceSource: "saisie" });
    modifierSurfacePiece(moi, { pieceId: piece.id, surfaceCentiemes: 3_500, surfaceSource: "saisie" });
    expect(surfaceDe(d.id, bat.id).valeur).toBe(9_000);
  });

  it("le changement est tracé avec avant, après et motif", () => {
    const { d, bat } = dossierEtBatiment();
    modifierSurfaceBatiment(moi, { batimentId: bat.id, surfaceCentiemes: 12_000, surfaceSource: "source_externe", motif: "surface de l'annonce" });
    const [evenement] = evenements(d.id, "batiment", "modification");
    expect(evenement.motif).toBe("surface de l'annonce");
    expect(evenement.changements).toEqual([
      { champ: "surface_centiemes", avant: null, apres: 12_000 },
      { champ: "surface_source", avant: null, apres: "source_externe" },
      { champ: "surface_confiance", avant: "a_renseigner", apres: "a_confirmer" },
    ]);
  });

  it("un enregistrement qui ne change rien n'écrit rien au journal (surface, et prix demandé d'un bien)", () => {
    const { d, lieu, bat } = dossierEtBatiment();
    modifierSurfaceBatiment(moi, { batimentId: bat.id, surfaceCentiemes: null });
    expect(evenements(d.id, "batiment", "modification")).toHaveLength(0);
    modifierSurfaceBatiment(moi, { batimentId: bat.id, surfaceCentiemes: 8_000, surfaceSource: "saisie" });
    modifierSurfaceBatiment(moi, { batimentId: bat.id, surfaceCentiemes: 8_000, surfaceSource: "saisie", motif: "rien de neuf" });
    expect(evenements(d.id, "batiment", "modification")).toHaveLength(1);

    modifierPrixDemandeLieu(moi, { lieuId: lieu.id, prixCentimes: null });
    expect(evenements(d.id, "lieu", "modification")).toHaveLength(0);
    modifierPrixDemandeLieu(moi, { lieuId: lieu.id, prixCentimes: 100_000, prixSource: "saisie" });
    modifierPrixDemandeLieu(moi, { lieuId: lieu.id, prixCentimes: 100_000, prixSource: "saisie" });
    expect(evenements(d.id, "lieu", "modification")).toHaveLength(1);
  });

  it("un lecteur ne la change pas", () => {
    const { d, bat } = dossierEtBatiment();
    const invite = inviterPersonne(moi, { dossierId: d.id, nom: "Ami (fictif)", role: "lecteur" });
    const lecteur: Acteur = { personneId: invite.personneId, nom: "Ami (fictif)" };
    expect(() => modifierSurfaceBatiment(lecteur, { batimentId: bat.id, surfaceCentiemes: 100, surfaceSource: "saisie" })).toThrow(ErreurApplicative);
    expect(() => modifierSurfaceBatiment(moi, { batimentId: "inconnu", surfaceCentiemes: 100, surfaceSource: "saisie" })).toThrow(ErreurApplicative);
    expect(surfaceDe(d.id, bat.id)).toEqual(A_RENSEIGNER);
  });

  it("retirer un bâtiment, ou un lieu, garde au journal tout ce qui avait été saisi", () => {
    const { d, lieu, bat } = dossierEtBatiment();
    modifierSurfaceBatiment(moi, { batimentId: bat.id, surfaceCentiemes: 9_000, surfaceSource: "estimation" });
    retirerBatiment(moi, { batimentId: bat.id });
    expect(evenements(d.id, "batiment", "suppression")[0].changements).toEqual(
      expect.arrayContaining([
        { champ: "surface_centiemes", avant: 9_000, apres: null },
        { champ: "surface_source", avant: "estimation", apres: null },
        { champ: "surface_confiance", avant: "estime", apres: null },
      ]),
    );

    // Le prix demandé et le statut d'un bien (PR #68) manquaient à cette trace.
    modifierPrixDemandeLieu(moi, { lieuId: lieu.id, prixCentimes: 15_000_000, prixSource: "source_externe" });
    changerStatutBien(moi, { lieuId: lieu.id, statut: "ecarte", motif: "essai fictif" });
    retirerLieu(moi, { lieuId: lieu.id });
    expect(evenements(d.id, "lieu", "suppression")[0].changements).toEqual(
      expect.arrayContaining([
        { champ: "statut_bien", avant: "ecarte", apres: null },
        { champ: "prix_demande_centimes", avant: 15_000_000, apres: null },
        { champ: "prix_demande_source", avant: "source_externe", apres: null },
        { champ: "prix_demande_confiance", avant: "a_confirmer", apres: null },
      ]),
    );
  });

  it("l'export l'emporte, l'assistant ne la reçoit pas", () => {
    const { d, bat } = dossierEtBatiment();
    modifierSurfaceBatiment(moi, { batimentId: bat.id, surfaceCentiemes: 13_700, surfaceSource: "saisie" });
    expect(construireExport(moi, d.id).batiments).toMatchObject([{ surfaceCentiemes: 13_700, surfaceSource: "saisie", surfaceConfiance: "connu" }]);
    configurerIA(moi, d.id, { activee: true, perimetre: ["identite", "lieux", "scenarios", "budget", "idees", "taches", "documents"], fournisseur: "regles_locales" });
    expect(serialiserContexte(construireContexte(moi, obtenirDossier(moi, d.id)))).not.toMatch(/13700|137 m|137,00/);
  });
});
