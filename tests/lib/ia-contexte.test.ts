// Ce que l'assistant reçoit, et ce que l'écran en montre (issue #19). Base en mémoire, données
// fictives, aucun appel réseau : le fournisseur distant n'est jamais invoqué ici.

import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { reinitialiserBasePourTests } from "@/lib/db/client";
import { creerDossier, creerScenario, configurerIA, obtenirDossier } from "@/lib/dossiers";
import { creerLieu, creerBatiment, creerPiece } from "@/lib/structure";
import { creerIdee } from "@/lib/idees";
import { creerPoste, ajouterLigne } from "@/lib/budget";
import { creerTache } from "@/lib/taches";
import { deposerDocument } from "@/lib/documents";
import { construireContexte } from "@/lib/ia";
import { serialiserContexte } from "@/domain/ia/types";
import type { Acteur } from "@/lib/acces";

const moi: Acteur = { personneId: "utilisateur-local", nom: "Utilisateur local" };

const NOM_DOSSIER = "Dossier des Tilleuls (fictif)";
const NOM_SCENARIO = "Rénover la grange (fictif)";
const ADRESSE = "12 chemin des Tilleuls (fictive)";
const RESPONSABLE = "Camille Martin (fictive)";
const FICHIER = "devis-martin-tilleuls.pdf";

/** Un dossier où chaque section transmissible a du contenu. */
function dossierRempli(): string {
  const d = creerDossier(moi, { nom: NOM_DOSSIER, typeProjet: "recherche_bien" });
  const lieu = creerLieu(moi, { dossierId: d.id, nom: "Bien candidat", typeLieu: "bien_candidat", adresse: ADRESSE, adresseSource: "saisie" });
  const bat = creerBatiment(moi, { dossierId: d.id, lieuId: lieu.id, nom: "Grange" });
  creerPiece(moi, { dossierId: d.id, batimentId: bat.id, nom: "Atelier" });
  const s = creerScenario(moi, { dossierId: d.id, nom: NOM_SCENARIO });
  const poste = creerPoste(moi, { scenarioId: s.id, nom: "Toiture" });
  ajouterLigne(moi, { posteId: poste.id, montantCentimes: 1_000_000, typeMontant: "estimation", source: "estimation" });
  creerIdee(moi, { dossierId: d.id, titre: "Poêle à bois", scenarioId: s.id });
  creerTache(moi, { dossierId: d.id, description: "Demander un devis de toiture", responsable: RESPONSABLE });
  deposerDocument(moi, { dossierId: d.id, nomOriginal: FICHIER, mime: "application/pdf", octets: Buffer.from("%PDF"), typeDocument: "devis" });
  return d.id;
}

/** Texte exact remis au fournisseur pour un périmètre donné. */
function texteTransmis(dossierId: string, perimetre: string[]): string {
  configurerIA(moi, dossierId, { activee: true, perimetre, fournisseur: "regles_locales" });
  return serialiserContexte(construireContexte(moi, obtenirDossier(moi, dossierId)));
}

describe("ce qui part vers l'assistant", () => {
  beforeEach(() => {
    reinitialiserBasePourTests();
    process.env.ASSISTANT_FICHIERS_PATH = mkdtempSync(path.join(tmpdir(), "assistant-fichiers-"));
  });

  it("le nom, le type et le stade du dossier ne partent que si « Identité du dossier » est cochée", () => {
    const id = dossierRempli();

    const sansIdentite = texteTransmis(id, ["lieux", "scenarios", "budget", "idees", "taches", "documents"]);
    expect(sansIdentite).not.toContain(NOM_DOSSIER);
    expect(sansIdentite).not.toContain("recherche_bien");
    expect(construireContexte(moi, obtenirDossier(moi, id)).dossier).toBeUndefined();

    const avecIdentite = texteTransmis(id, ["identite"]);
    expect(avecIdentite).toContain(NOM_DOSSIER);
    expect(construireContexte(moi, obtenirDossier(moi, id)).dossier).toEqual({ nom: NOM_DOSSIER, typeProjet: "recherche_bien", stade: null });
  });

  it("l'identifiant interne du dossier ne part jamais", () => {
    const id = dossierRempli();
    expect(texteTransmis(id, ["identite", "lieux", "scenarios", "budget", "idees", "taches", "documents"])).not.toContain(id);
  });

  it("le nom d'un scénario ne part que si « Scénarios » est cochée ; sinon un libellé neutre le remplace", () => {
    const id = dossierRempli();

    const sansScenarios = texteTransmis(id, ["budget", "idees"]);
    expect(sansScenarios).not.toContain(NOM_SCENARIO);
    const ctx = construireContexte(moi, obtenirDossier(moi, id));
    expect(ctx.budget).toEqual([expect.objectContaining({ scenarioNom: "Scénario 1", poste: "Toiture" })]);
    // L'idée reste « rattachée » pour les règles locales, sans que le nom du scénario parte.
    expect(ctx.idees).toEqual([expect.objectContaining({ titre: "Poêle à bois", scenarioNom: "Scénario 1" })]);

    expect(texteTransmis(id, ["scenarios", "budget", "idees"])).toContain(NOM_SCENARIO);
  });

  it("ni adresse, ni nom de responsable, ni nom de fichier, même avec toutes les sections cochées", () => {
    const id = dossierRempli();
    const tout = texteTransmis(id, ["identite", "lieux", "scenarios", "budget", "idees", "taches", "documents", "personnes", "droits", "ia"]);
    expect(tout).not.toContain(ADRESSE);
    expect(tout).not.toContain(RESPONSABLE);
    expect(tout).not.toContain(FICHIER);
    expect(tout).not.toContain("Utilisateur local");
    // Ce qui part bien, et que l'écran annonce : les noms et les textes saisis, les montants.
    expect(tout).toContain("Grange");
    expect(tout).toContain("Demander un devis de toiture");
    expect(tout).toContain("1000000");
  });
});

describe("ce que l'écran montre est ce qui part", () => {
  const lire = (chemin: string) => readFileSync(path.join(process.cwd(), chemin), "utf8");

  it("le fournisseur distant et l'écran de l'assistant écrivent le contexte par la même fonction", () => {
    const fournisseur = lire("src/lib/ia/anthropic.ts");
    expect(fournisseur).toContain("serialiserContexte(contexte)");
    expect(fournisseur).not.toContain("JSON.stringify(contexte");
    expect(lire("src/app/dossiers/[id]/assistant/page.tsx")).toContain("serialiserContexte(");
  });

  it("le texte remis au fournisseur est le contexte, lisible, sans rien d'autre", () => {
    const contexte = { sections: ["identite" as const], dossier: { nom: "Pilote", typeProjet: null, stade: null } };
    expect(JSON.parse(serialiserContexte(contexte))).toEqual(contexte);
    expect(serialiserContexte(contexte)).toContain("\n"); // une ligne par champ : relisible à l'écran
  });
});
