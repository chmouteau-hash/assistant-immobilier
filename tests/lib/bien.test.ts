// Prix demandé et statut d'un bien (issue #2, bloc « Bien »). Base en mémoire, données fictives.
//
// Ce que ces tests gardent : le prix demandé est une valeur tracée, « à renseigner » tant qu'il
// n'est pas connu, et un prix d'annonce n'est jamais « connu » ; écarter ou acquérir un bien
// demande un motif ; acquérir un bien candidat le range en « Bien acquis », revenir sur l'achat
// l'en sort, un terrain garde son type ; corriger le type ne peut pas contredire le statut ; la
// base refuse d'elle-même un type et un statut qui se contredisent ; tout est tracé au journal ;
// un lecteur ne change rien ; le prix et le statut ne partent pas vers l'assistant.

import { beforeEach, describe, expect, it } from "vitest";
import { obtenirBase, reinitialiserBasePourTests } from "@/lib/db/client";
import { configurerIA, creerDossier, journalAudit, obtenirDossier } from "@/lib/dossiers";
import { changerStatutBien, creerLieu, modifierLieu, modifierPrixDemandeLieu, obtenirLieu } from "@/lib/structure";
import { inviterPersonne } from "@/lib/personnes";
import { construireContexte } from "@/lib/ia";
import { construireExport } from "@/lib/export";
import { serialiserContexte } from "@/domain/ia/types";
import { ErreurApplicative } from "@/lib/erreurs";
import type { Acteur } from "@/lib/acces";

const moi: Acteur = { personneId: "utilisateur-local", nom: "Utilisateur local" };
const A_RENSEIGNER = { valeur: null, source: null, confiance: "a_renseigner" };

describe("prix demandé et statut d'un bien", () => {
  beforeEach(() => reinitialiserBasePourTests());

  function dossierEtLieu(typeLieu = "bien_candidat") {
    const d = creerDossier(moi, { nom: "Dossier d'essai (fictif)" });
    const lieu = creerLieu(moi, { dossierId: d.id, nom: "Bien candidat (fictif)", typeLieu });
    return { d, lieu };
  }
  const lecteurDe = (dossierId: string): Acteur => {
    const invite = inviterPersonne(moi, { dossierId, nom: "Ami (fictif)", role: "lecteur" });
    return { personneId: invite.personneId, nom: "Ami (fictif)" };
  };
  const evenementsLieu = (dossierId: string, action: string) => journalAudit(moi, dossierId).filter((e) => e.nomEntite === "lieu" && e.action === action);

  // --- Prix demandé ----------------------------------------------------------------------------------

  it("le prix demandé est à renseigner tant qu'on ne l'a pas dit", () => {
    const { lieu } = dossierEtLieu();
    expect(lieu.prixDemande).toEqual(A_RENSEIGNER);
  });

  it("un prix lu sur une annonce est une source externe, au mieux à confirmer", () => {
    const { lieu } = dossierEtLieu();
    const apres = modifierPrixDemandeLieu(moi, { lieuId: lieu.id, prixCentimes: 24_500_000, prixSource: "source_externe" });
    expect(apres.prixDemande).toEqual({ valeur: 24_500_000, source: "source_externe", confiance: "a_confirmer" });
    expect(() => modifierPrixDemandeLieu(moi, { lieuId: lieu.id, prixCentimes: 24_500_000, prixSource: "source_externe", prixConfiance: "connu" })).toThrow(/source externe/);
  });

  it("refuse un prix sans source, nul ou négatif ; un prix vidé redevient à renseigner", () => {
    const { lieu } = dossierEtLieu();
    expect(() => modifierPrixDemandeLieu(moi, { lieuId: lieu.id, prixCentimes: 100_000 })).toThrow(/d'où vient/);
    expect(() => modifierPrixDemandeLieu(moi, { lieuId: lieu.id, prixCentimes: 0, prixSource: "saisie" })).toThrow(/positif/);
    expect(() => modifierPrixDemandeLieu(moi, { lieuId: lieu.id, prixCentimes: -100, prixSource: "saisie" })).toThrow(/positif/);
    modifierPrixDemandeLieu(moi, { lieuId: lieu.id, prixCentimes: 100_000, prixSource: "saisie" });
    expect(modifierPrixDemandeLieu(moi, { lieuId: lieu.id, prixCentimes: null }).prixDemande).toEqual(A_RENSEIGNER);
  });

  it("le changement de prix est tracé avec avant, après et motif", () => {
    const { d, lieu } = dossierEtLieu();
    modifierPrixDemandeLieu(moi, { lieuId: lieu.id, prixCentimes: 100_000, prixSource: "estimation", motif: "ordre de grandeur du secteur" });
    const [evenement] = evenementsLieu(d.id, "modification");
    expect(evenement.motif).toBe("ordre de grandeur du secteur");
    expect(evenement.changements).toEqual([
      { champ: "prix_demande_centimes", avant: null, apres: 100_000 },
      { champ: "prix_demande_source", avant: null, apres: "estimation" },
      { champ: "prix_demande_confiance", avant: "a_renseigner", apres: "estime" },
    ]);
  });

  it("la base refuse un prix d'annonce présenté comme connu, même écrit sans passer par lib", () => {
    const { lieu } = dossierEtLieu();
    const ecrire = (confiance: string) => obtenirBase().prepare(`UPDATE lieu SET prix_demande_centimes = 100, prix_demande_source = 'source_externe', prix_demande_confiance = ? WHERE id = ?`).run(confiance, lieu.id);
    expect(() => ecrire("connu")).toThrow(/CHECK/);
    expect(() => ecrire("a_confirmer")).not.toThrow();
  });

  // --- Statut ------------------------------------------------------------------------------------------

  it("un bien candidat ou un terrain part d'un statut à renseigner, un bien acquis du statut « acquis »", () => {
    expect(dossierEtLieu("bien_candidat").lieu.statutBien).toBeNull();
    expect(dossierEtLieu("terrain").lieu.statutBien).toBeNull();
    expect(dossierEtLieu("bien_acquis").lieu.statutBien).toBe("acquis");
  });

  it("repéré, visité et offre faite se posent sans motif ; écarter ou acquérir en demande un", () => {
    const { lieu } = dossierEtLieu();
    expect(changerStatutBien(moi, { lieuId: lieu.id, statut: "repere" }).statutBien).toBe("repere");
    expect(changerStatutBien(moi, { lieuId: lieu.id, statut: "visite" }).statutBien).toBe("visite");
    expect(changerStatutBien(moi, { lieuId: lieu.id, statut: "offre_faite", motif: "  " }).statutBien).toBe("offre_faite");
    expect(() => changerStatutBien(moi, { lieuId: lieu.id, statut: "ecarte" })).toThrow(/motif est obligatoire pour écarter/);
    expect(() => changerStatutBien(moi, { lieuId: lieu.id, statut: "acquis", motif: " " })).toThrow(/motif est obligatoire pour dire qu'un bien est acquis/);
    expect(() => changerStatutBien(moi, { lieuId: lieu.id, statut: "vendu" })).toThrow(/inconnu/);
    expect(obtenirLieu(moi, lieu.id).statutBien).toBe("offre_faite");
    expect(changerStatutBien(moi, { lieuId: lieu.id, statut: "ecarte", motif: "toiture à refaire" }).statutBien).toBe("ecarte");
  });

  it("acquérir un bien candidat le range en « Bien acquis », dans la même écriture, tracée avec son motif", () => {
    const { d, lieu } = dossierEtLieu();
    const apres = changerStatutBien(moi, { lieuId: lieu.id, statut: "acquis", motif: "acte signé" });
    expect(apres).toMatchObject({ statutBien: "acquis", typeLieu: "bien_acquis" });
    const [evenement] = evenementsLieu(d.id, "transition_statut");
    expect(evenement.motif).toBe("acte signé");
    expect(evenement.changements).toEqual([
      { champ: "statut_bien", avant: null, apres: "acquis" },
      { champ: "type_lieu", avant: "bien_candidat", apres: "bien_acquis" },
    ]);
  });

  it("revenir sur l'achat remet le bien en « Bien candidat »", () => {
    const { lieu } = dossierEtLieu("bien_acquis");
    expect(changerStatutBien(moi, { lieuId: lieu.id, statut: "offre_faite" })).toMatchObject({ statutBien: "offre_faite", typeLieu: "bien_candidat" });
  });

  it("un terrain acquis reste un terrain", () => {
    const { lieu } = dossierEtLieu("terrain");
    expect(changerStatutBien(moi, { lieuId: lieu.id, statut: "acquis", motif: "acte signé" })).toMatchObject({ statutBien: "acquis", typeLieu: "terrain" });
  });

  it("un statut inchangé n'écrit rien au journal", () => {
    const { d, lieu } = dossierEtLieu();
    changerStatutBien(moi, { lieuId: lieu.id, statut: "visite" });
    changerStatutBien(moi, { lieuId: lieu.id, statut: "visite" });
    expect(evenementsLieu(d.id, "transition_statut")).toHaveLength(1);
  });

  it("corriger le type ne peut pas contredire le statut", () => {
    const { lieu } = dossierEtLieu();
    expect(() => modifierLieu(moi, { lieuId: lieu.id, typeLieu: "bien_acquis" })).toThrow(/changez son statut en « Acquis »/);
    expect(modifierLieu(moi, { lieuId: lieu.id, typeLieu: "terrain" }).typeLieu).toBe("terrain");

    const acquis = dossierEtLieu("bien_acquis").lieu;
    expect(() => modifierLieu(moi, { lieuId: acquis.id, typeLieu: "bien_candidat" })).toThrow(/changez d'abord son statut/);
    expect(modifierLieu(moi, { lieuId: acquis.id, typeLieu: "terrain" })).toMatchObject({ typeLieu: "terrain", statutBien: "acquis" });
  });

  it("la base refuse d'elle-même un type et un statut qui se contredisent", () => {
    const { d, lieu } = dossierEtLieu();
    const db = obtenirBase();
    expect(() => db.prepare(`UPDATE lieu SET statut_bien = 'acquis' WHERE id = ?`).run(lieu.id)).toThrow(/bien candidat ne l'a jamais/);
    expect(() => db.prepare(`UPDATE lieu SET type_lieu = 'bien_acquis' WHERE id = ?`).run(lieu.id)).toThrow(/bien acquis a le statut/);
    expect(() =>
      db.prepare(`INSERT INTO lieu (id, dossier_id, nom, type_lieu) VALUES ('lieu-direct', ?, 'Bien acquis (fictif)', 'bien_acquis')`).run(d.id),
    ).toThrow(/bien acquis a le statut/);
  });

  // --- Droits, assistant, export ---------------------------------------------------------------------

  it("un lecteur ne change ni le prix ni le statut", () => {
    const { d, lieu } = dossierEtLieu();
    const lecteur = lecteurDe(d.id);
    expect(() => modifierPrixDemandeLieu(lecteur, { lieuId: lieu.id, prixCentimes: 100, prixSource: "saisie" })).toThrow(ErreurApplicative);
    expect(() => changerStatutBien(lecteur, { lieuId: lieu.id, statut: "visite" })).toThrow(ErreurApplicative);
    expect(obtenirLieu(moi, lieu.id)).toMatchObject({ statutBien: null, prixDemande: A_RENSEIGNER });
  });

  it("le prix et le statut ne partent pas vers l'assistant", () => {
    const { d, lieu } = dossierEtLieu();
    modifierPrixDemandeLieu(moi, { lieuId: lieu.id, prixCentimes: 31_400_000, prixSource: "saisie" });
    changerStatutBien(moi, { lieuId: lieu.id, statut: "offre_faite" });
    configurerIA(moi, d.id, { activee: true, perimetre: ["identite", "lieux", "scenarios", "budget", "idees", "taches", "documents"], fournisseur: "regles_locales" });
    const texte = serialiserContexte(construireContexte(moi, obtenirDossier(moi, d.id)));
    expect(texte).not.toMatch(/314000|314 000|31400000|offre_faite|Offre faite/);
  });

  it("l'export complet du dossier emporte le prix et le statut", () => {
    const { d, lieu } = dossierEtLieu();
    modifierPrixDemandeLieu(moi, { lieuId: lieu.id, prixCentimes: 100_000, prixSource: "saisie" });
    changerStatutBien(moi, { lieuId: lieu.id, statut: "visite" });
    expect(construireExport(moi, d.id).lieux).toMatchObject([{ statutBien: "visite", prixDemandeCentimes: 100_000, prixDemandeSource: "saisie", prixDemandeConfiance: "connu" }]);
  });
});
