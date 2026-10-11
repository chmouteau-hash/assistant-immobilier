// Un écran ne dépend pas d'une section voisine pour dire vrai (issue #27). Le budget et les idées
// citent leur scénario : qui ne peut pas lire les scénarios en voit le regroupement sous un libellé
// neutre, « Scénario 1 », au lieu d'une page vide ou d'un « aucun » qui serait faux.

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { reinitialiserBasePourTests } from "@/lib/db/client";
import { creerDossier, creerScenario, changerStatutScenario, libelleNeutreScenario, listerScenarios, scenariosCites } from "@/lib/dossiers";
import { creerIdee, listerIdees } from "@/lib/idees";
import { creerPoste, ajouterLigne, listerPostes, syntheseScenario } from "@/lib/budget";
import { deposerDocument, modifierDocument, proposerExtraction, validerExtraction } from "@/lib/documents";
import { inviterPersonne } from "@/lib/personnes";
import { ErreurApplicative } from "@/lib/erreurs";
import type { Acteur } from "@/lib/acces";

const moi: Acteur = { personneId: "utilisateur-local", nom: "Utilisateur local" };

function professionnel(dossierId: string, nom: string, perimetre: string[]): Acteur {
  const invite = inviterPersonne(moi, { dossierId, nom, type: "professionnel", profession: "essai", role: "professionnel", perimetre, finalite: "Essai" });
  return { personneId: invite.personneId, nom };
}

describe("sections voisines", () => {
  beforeEach(() => {
    reinitialiserBasePourTests();
    process.env.ASSISTANT_FICHIERS_PATH = mkdtempSync(path.join(tmpdir(), "assistant-fichiers-"));
  });

  it("un professionnel limité au budget lit et alimente le budget, sans le nom des scénarios", () => {
    const d = creerDossier(moi, { nom: "Essai" });
    const premier = creerScenario(moi, { dossierId: d.id, nom: "Scénario d'essai A" });
    const second = creerScenario(moi, { dossierId: d.id, nom: "Scénario d'essai B" });
    changerStatutScenario(moi, { scenarioId: second.id, nouveauStatut: "ecartee", motif: "essai" });
    const poste = creerPoste(moi, { scenarioId: second.id, nom: "Poste d'essai" });
    const economiste = professionnel(d.id, "Économiste (fictif)", ["budget"]);

    // Qui lit les scénarios voit leur nom et leur statut.
    expect(scenariosCites(moi, d.id, "budget")).toEqual([
      { id: premier.id, nom: "Scénario d'essai A", statut: premier.statut },
      { id: second.id, nom: "Scénario d'essai B", statut: "ecartee" },
    ]);
    // Le professionnel voit le même regroupement, sous un libellé neutre et sans statut.
    expect(scenariosCites(economiste, d.id, "budget")).toEqual([
      { id: premier.id, nom: "Scénario 1", statut: null },
      { id: second.id, nom: "Scénario 2", statut: null },
    ]);

    // Il lit les postes, dépose un montant et ajoute un poste…
    expect(listerPostes(economiste, d.id).map((p) => p.nom)).toEqual(["Poste d'essai"]);
    ajouterLigne(economiste, { posteId: poste.id, montantCentimes: 45_600, typeMontant: "devis", source: "saisie" });
    creerPoste(economiste, { scenarioId: premier.id, nom: "Poste du professionnel" });
    expect(syntheseScenario(economiste, second.id).totalReferenceCentimes).toBe(45_600);
    expect(listerPostes(moi, d.id)).toHaveLength(2);

    // … mais ne lit toujours pas les scénarios eux-mêmes, ni ce que citent les idées.
    expect(() => listerScenarios(economiste, d.id)).toThrow(ErreurApplicative);
    expect(() => scenariosCites(economiste, d.id, "idees")).toThrow(ErreurApplicative);
  });

  it("une idée cite son scénario sous un libellé neutre, jamais « aucun », pour qui ne lit pas les scénarios", () => {
    const d = creerDossier(moi, { nom: "Essai" });
    creerScenario(moi, { dossierId: d.id, nom: "Scénario d'essai A" });
    const second = creerScenario(moi, { dossierId: d.id, nom: "Scénario d'essai B" });
    creerIdee(moi, { dossierId: d.id, titre: "Idée d'essai", scenarioId: second.id });
    const paysagiste = professionnel(d.id, "Paysagiste (fictif)", ["idees"]);

    const idee = listerIdees(paysagiste, d.id)[0];
    const cite = scenariosCites(paysagiste, d.id, "idees").find((s) => s.id === idee.scenarioId);
    expect(cite).toEqual({ id: second.id, nom: "Scénario 2", statut: null });
    expect(scenariosCites(moi, d.id, "idees").find((s) => s.id === idee.scenarioId)?.nom).toBe("Scénario d'essai B");
  });

  it("un professionnel limité aux documents dépose un devis ; le propriétaire le rattache et le fait entrer au budget", () => {
    const d = creerDossier(moi, { nom: "Essai" });
    const scenario = creerScenario(moi, { dossierId: d.id, nom: "Scénario d'essai A" });
    const artisan = professionnel(d.id, "Artisan (fictif)", ["documents"]);

    // L'artisan ne voit ni budget ni scénarios : il dépose sa pièce et propose ce qu'il y lit.
    const devis = deposerDocument(artisan, { dossierId: d.id, nomOriginal: "devis-essai.pdf", mime: "application/pdf", octets: Buffer.from("%PDF"), typeDocument: "devis" });
    proposerExtraction(artisan, { documentId: devis.id, champs: { montant_centimes: "1 250,00", poste: "Poste d'essai", fournisseur: "Entreprise fictive" }, source: "saisie" });
    expect(() => listerPostes(artisan, d.id)).toThrow(ErreurApplicative);
    expect(() => validerExtraction(artisan, { documentId: devis.id, corrections: {} })).toThrow(ErreurApplicative);

    // Le propriétaire classe la pièce dans un scénario, puis valide : le montant entre au budget.
    modifierDocument(moi, { documentId: devis.id, scenarioId: scenario.id });
    const { ligne } = validerExtraction(moi, { documentId: devis.id, corrections: {} });
    expect(ligne).toMatchObject({ montantCentimes: 125_000, typeMontant: "devis", source: "import", confiance: "connu", documentId: devis.id });
    expect(listerPostes(moi, d.id).map((p) => p.nom)).toEqual(["Poste d'essai"]);
  });

  it("le libellé neutre suit l'ordre de création, comme pour l'assistant", () => {
    expect([0, 1, 9].map(libelleNeutreScenario)).toEqual(["Scénario 1", "Scénario 2", "Scénario 10"]);
    // L'assistant emploie la même fonction : une seule règle pour une personne et pour un fournisseur.
    expect(readFileSync(path.resolve(__dirname, "../../src/lib/ia.ts"), "utf8")).toContain("libelleNeutreScenario(");
  });

  it("les écrans Budget et Idées citent les scénarios par cette fonction", () => {
    // Garde-fou qui lit le code source : `listerScenarios` exige de lire les scénarios. Appelée sous
    // condition, elle rendait une liste vide, que l'écran prenait pour « aucun scénario ».
    for (const ecran of ["budget", "idees"]) {
      const source = readFileSync(path.resolve(__dirname, `../../src/app/dossiers/[id]/${ecran}/page.tsx`), "utf8");
      expect(source, ecran).toContain("scenariosCites(");
      expect(source, ecran).not.toContain("listerScenarios(");
    }
  });
});
