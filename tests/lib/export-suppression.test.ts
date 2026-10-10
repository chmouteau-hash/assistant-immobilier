// Export complet (portabilité) et suppression définitive (effacement) d'un dossier.

import { beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { obtenirBase, reinitialiserBasePourTests, cheminFichiers } from "@/lib/db/client";
import { creerDossier, creerScenario, listerDossiers, supprimerDossier, journalAudit } from "@/lib/dossiers";
import { inviterPersonne } from "@/lib/personnes";
import { creerLieu } from "@/lib/structure";
import { creerPoste, ajouterLigne, modifierLigne, syntheseScenario, listerLignes } from "@/lib/budget";
import { deposerDocument } from "@/lib/documents";
import { construireExport, exporterDossierZip } from "@/lib/export";
import { lireZip } from "@/lib/zip";
import { ErreurApplicative } from "@/lib/erreurs";
import type { Acteur } from "@/lib/acces";

const moi: Acteur = { personneId: "utilisateur-local", nom: "Utilisateur local" };

function monterDossier() {
  const d = creerDossier(moi, { nom: "Pilote export" });
  const lieu = creerLieu(moi, { dossierId: d.id, nom: "Bien", typeLieu: "bien_candidat", adresse: "12 rue Fictive", adresseSource: "saisie" });
  const s = creerScenario(moi, { dossierId: d.id, nom: "Rénovation" });
  const poste = creerPoste(moi, { scenarioId: s.id, nom: "Toiture" });
  ajouterLigne(moi, { posteId: poste.id, montantCentimes: 100, typeMontant: "devis", source: "saisie", fournisseur: "A" });
  const doc = deposerDocument(moi, { dossierId: d.id, nomOriginal: "devis-a.pdf", mime: "application/pdf", octets: Buffer.from("%PDF devis A"), typeDocument: "devis", scenarioId: s.id });
  return { d, lieu, s, poste, doc };
}

describe("export et suppression", () => {
  beforeEach(() => {
    reinitialiserBasePourTests();
    process.env.ASSISTANT_FICHIERS_PATH = mkdtempSync(path.join(tmpdir(), "assistant-export-"));
  });

  it("l'export contient toutes les tables du dossier et les fichiers, CRC intacts", () => {
    const { d, doc } = monterDossier();
    const exporte = construireExport(moi, d.id);
    expect(exporte.lieux).toHaveLength(1);
    expect(exporte.lignesBudget).toHaveLength(1);
    expect(exporte.documents[0].nomOriginal).toBe("devis-a.pdf");
    expect(exporte.journalAudit.length).toBeGreaterThan(3);
    expect(exporte.participations[0].role).toBe("proprietaire");

    const { nomFichier, archive } = exporterDossierZip(moi, d.id);
    expect(nomFichier).toMatch(/^export-Pilote-export-\d{4}-\d{2}-\d{2}\.zip$/);
    const entrees = lireZip(archive);
    expect(entrees.map((e) => e.nom)).toEqual(["LISEZMOI.txt", "dossier.json", `fichiers/${path.basename(doc.cheminRelatif)}`]);
    expect(entrees.every((e) => e.crcOk)).toBe(true);
    const json = JSON.parse(entrees[1].contenu.toString("utf8"));
    expect(json.format.version).toBe(1);
    expect(json.fichiersManquants).toEqual([]);
    expect(entrees[2].contenu.toString()).toBe("%PDF devis A");
  });

  it("seul le propriétaire exporte ou supprime ; le nom doit être retapé", () => {
    const { d } = monterDossier();
    const c = inviterPersonne(moi, { dossierId: d.id, nom: "Compagne", role: "contributeur" });
    const compagne: Acteur = { personneId: c.personneId, nom: "Compagne" };
    expect(() => construireExport(compagne, d.id)).toThrow(ErreurApplicative);
    expect(() => supprimerDossier(compagne, { dossierId: d.id, confirmationNom: "Pilote export", motif: "x" })).toThrow(ErreurApplicative);
    expect(() => supprimerDossier(moi, { dossierId: d.id, confirmationNom: "autre nom", motif: "x" })).toThrow(/retapez/);
    expect(() => supprimerDossier(moi, { dossierId: d.id, confirmationNom: "Pilote export", motif: " " })).toThrow(/motif/);
    expect(listerDossiers(moi)).toHaveLength(1);
  });

  it("la suppression efface tout : lignes, fichiers, journal (sauf une trace sans contenu)", () => {
    const { d, doc } = monterDossier();
    const autre = creerDossier(moi, { nom: "Autre dossier" });
    const absolu = path.join(cheminFichiers(), doc.cheminRelatif);
    expect(existsSync(absolu)).toBe(true);
    const avant = journalAudit(moi, d.id).length;
    expect(avant).toBeGreaterThan(0);

    const resultat = supprimerDossier(moi, { dossierId: d.id, confirmationNom: "Pilote export", motif: "Fin du test, effacement demandé" });
    expect(resultat).toEqual({ fichiersSupprimes: 1, fichiersIntrouvables: 0, evenementsPurges: avant });
    expect(existsSync(absolu)).toBe(false);
    expect(listerDossiers(moi).map((x) => x.id)).toEqual([autre.id]);

    const db = obtenirBase();
    const compte = (sql: string) => (db.prepare(sql).get(d.id) as { n: number }).n;
    expect(compte(`SELECT COUNT(*) AS n FROM lieu WHERE dossier_id = ?`)).toBe(0);
    expect(compte(`SELECT COUNT(*) AS n FROM ligne_budget WHERE scenario_id IN (SELECT id FROM scenario WHERE dossier_id = ?)`)).toBe(0);
    expect(compte(`SELECT COUNT(*) AS n FROM document WHERE dossier_id = ?`)).toBe(0);
    expect(compte(`SELECT COUNT(*) AS n FROM audit_evenement WHERE dossier_id = ?`)).toBe(0);
    // Une trace, sans lien vers le dossier, sans valeur personnelle, et le journal reste en ajout seul.
    const trace = db.prepare(`SELECT motif, changements, dossier_id FROM audit_evenement WHERE entite_id = ? AND action = 'suppression'`).get(d.id) as { motif: string; changements: string; dossier_id: null };
    expect(trace.dossier_id).toBeNull();
    expect(trace.motif).toMatch(/effacement/);
    expect(JSON.parse(trace.changements)[0]).toMatchObject({ champ: "evenements_audit_purges", avant });
    expect(() => db.prepare(`DELETE FROM audit_evenement WHERE entite_id = ?`).run(d.id)).toThrow(/ajout seul/);
    // L'autre dossier est intact.
    expect(journalAudit(moi, autre.id).length).toBeGreaterThan(0);
  });

  it("une ligne écartée reste visible mais ne compte plus ; la modification est tracée", () => {
    const { d, s, poste } = monterDossier();
    const b = ajouterLigne(moi, { posteId: poste.id, montantCentimes: 250, typeMontant: "devis", source: "saisie", fournisseur: "B" });
    expect(syntheseScenario(moi, s.id).postes[0].devisCentimes).toBe(350); // les deux devis s'additionnent

    expect(() => modifierLigne(moi, { ligneId: b.id, statut: "ecartee", motif: "" })).toThrow(/motif/);
    const ecartee = modifierLigne(moi, { ligneId: b.id, statut: "ecartee", motif: "Devis B non retenu" });
    expect(ecartee.statut).toBe("ecartee");
    expect(syntheseScenario(moi, s.id).postes[0].devisCentimes).toBe(100);
    expect(listerLignes(moi, d.id)).toHaveLength(2); // toujours visible

    expect(() => modifierLigne(moi, { ligneId: b.id, montantCentimes: 300, source: "estimation", confiance: "connu", motif: "x" })).toThrow(/estimation/);
    const modifiee = modifierLigne(moi, { ligneId: b.id, montantCentimes: 300, fournisseur: "B bis", motif: "Erreur de saisie" });
    expect(modifiee).toMatchObject({ montantCentimes: 300, fournisseur: "B bis", statut: "ecartee" });
    const journal = journalAudit(moi, d.id);
    const evt = journal.find((e) => e.entiteId === b.id && e.action === "modification")!;
    expect(evt.motif).toBe("Erreur de saisie");
    expect(evt.changements).toEqual(expect.arrayContaining([{ champ: "montant_centimes", avant: 250, apres: 300 }]));
    const transition = journal.find((e) => e.entiteId === b.id && e.action === "transition_statut")!;
    expect(transition.changements).toEqual([{ champ: "statut", avant: "active", apres: "ecartee" }]);
  });
});
