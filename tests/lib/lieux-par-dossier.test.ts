// Les lieux de chaque dossier dans « Mes dossiers » (issue #54). Base en mémoire, données
// fictives, aucun réseau.
//
// Ce que ces tests gardent : la liste ne montre à un acteur rien de plus que ce qu'il lirait en
// ouvrant chaque dossier. Un dossier dont il ne lit pas les lieux est absent du résultat, ce qui
// n'est pas la même chose qu'un dossier sans lieu. De chaque lieu, seuls sortent son nom et sa
// commune.

import { beforeEach, describe, expect, it } from "vitest";
import { reinitialiserBasePourTests } from "@/lib/db/client";
import { creerDossier, journalAudit } from "@/lib/dossiers";
import { creerLieu, listerLieuxParDossier, modifierPositionLieu } from "@/lib/structure";
import { inviterPersonne, revoquerParticipation } from "@/lib/personnes";
import type { Acteur } from "@/lib/acces";

const moi: Acteur = { personneId: "utilisateur-local", nom: "Utilisateur local" };

describe("lieux de chaque dossier, pour « Mes dossiers »", () => {
  beforeEach(() => reinitialiserBasePourTests());

  /** Un dossier avec un lieu complet (voie, commune, position, description) et un lieu nu. */
  function dossier(nom: string) {
    const d = creerDossier(moi, { nom });
    const complet = creerLieu(moi, {
      dossierId: d.id,
      nom: `Maison de ${nom}`,
      typeLieu: "bien_candidat",
      adresse: "3 chemin du Lavoir (fictive)",
      codePostal: "00100",
      ville: "Ville-Fictive",
      adresseSource: "saisie",
      description: "note privée (fictive)",
    });
    modifierPositionLieu(moi, { lieuId: complet.id, latitudeMicrodeg: 46_500_000, longitudeMicrodeg: 2_500_000, positionSource: "saisie" });
    const nu = creerLieu(moi, { dossierId: d.id, nom: `Terrain de ${nom}`, typeLieu: "terrain" });
    return { id: d.id, complet, nu };
  }
  // Inviter un professionnel exige de dire sa mission.
  const MISSION = "relecture du dossier (essai fictif)";
  const inviter = (dossierId: string, nom: string, role: string, perimetre?: string[]) =>
    inviterPersonne(moi, { dossierId, nom, role, perimetre, ...(role === "professionnel" ? { finalite: MISSION } : {}) });
  const acteurDe = (participation: { personneId: string }, nom: string): Acteur => ({ personneId: participation.personneId, nom });
  const refus = (dossierId: string) => journalAudit(moi, dossierId).filter((e) => e.action === "acces_refuse");

  it("le propriétaire retrouve les lieux de chacun de ses dossiers, dans l'ordre de leur création", () => {
    const a = dossier("Dossier A (fictif)");
    const b = dossier("Dossier B (fictif)");

    const parDossier = listerLieuxParDossier(moi);
    expect([...parDossier.keys()].sort()).toEqual([a.id, b.id].sort());
    expect(parDossier.get(a.id)).toEqual([
      { id: a.complet.id, nom: "Maison de Dossier A (fictif)", commune: { codePostal: "00100", ville: "Ville-Fictive" } },
      { id: a.nu.id, nom: "Terrain de Dossier A (fictif)", commune: null },
    ]);
    expect(parDossier.get(b.id)?.map((l) => l.id)).toEqual([b.complet.id, b.nu.id]);
  });

  it("ne donne du lieu que son nom et sa commune : ni voie, ni position, ni description, ni provenance", () => {
    const a = dossier("Dossier A (fictif)");
    const [lieu] = listerLieuxParDossier(moi).get(a.id) ?? [];
    expect(Object.keys(lieu).sort()).toEqual(["commune", "id", "nom"]);
    const texte = JSON.stringify([...listerLieuxParDossier(moi).values()]);
    expect(texte).not.toContain("Lavoir");
    expect(texte).not.toContain("note privée");
    expect(texte).not.toContain("46500000");
    expect(texte).not.toContain("saisie");
  });

  it("un dossier lisible et sans lieu figure avec une liste vide ; la commune garde ce qui est connu", () => {
    const vide = creerDossier(moi, { nom: "Dossier vide (fictif)" });
    creerLieu(moi, { dossierId: vide.id, nom: "Bien au code postal seul (fictif)", typeLieu: "bien_candidat", codePostal: "00100", adresseSource: "saisie" });
    const sansLieu = creerDossier(moi, { nom: "Dossier sans lieu (fictif)" });

    const parDossier = listerLieuxParDossier(moi);
    expect(parDossier.get(sansLieu.id)).toEqual([]);
    expect(parDossier.get(vide.id)?.[0].commune).toEqual({ codePostal: "00100", ville: null });
  });

  it("une personne invitée dans un seul dossier ne reçoit que les lieux de celui-là", () => {
    const a = dossier("Dossier A (fictif)");
    const b = dossier("Dossier B (fictif)");
    const amie = acteurDe(inviter(a.id, "Amie (fictive)", "lecteur"), "Amie (fictive)");

    const parDossier = listerLieuxParDossier(amie);
    expect([...parDossier.keys()]).toEqual([a.id]);
    expect(JSON.stringify([...parDossier.values()])).not.toContain("Dossier B");
    expect(parDossier.has(b.id)).toBe(false);
  });

  it("un professionnel dont le périmètre exclut les lieux n'en reçoit rien, pas même une liste vide", () => {
    const a = dossier("Dossier A (fictif)");
    const b = dossier("Dossier B (fictif)");
    const sansLieux = inviter(a.id, "Artisan (fictif)", "professionnel", ["budget"]);
    inviterPersonne(moi, { dossierId: b.id, personneId: sansLieux.personneId, role: "professionnel", perimetre: ["lieux"], finalite: MISSION });
    const artisan = acteurDe(sansLieux, "Artisan (fictif)");

    const parDossier = listerLieuxParDossier(artisan);
    expect(parDossier.has(a.id)).toBe(false);
    expect(parDossier.get(b.id)?.map((l) => l.id)).toEqual([b.complet.id, b.nu.id]);
  });

  it("une participation révoquée ne donne plus rien, et qui ne participe à aucun dossier reçoit une liste vide", () => {
    const a = dossier("Dossier A (fictif)");
    const participation = inviter(a.id, "Ancien invité (fictif)", "lecteur");
    const ancien = acteurDe(participation, "Ancien invité (fictif)");
    expect(listerLieuxParDossier(ancien).has(a.id)).toBe(true);

    revoquerParticipation(moi, { participationId: participation.id, motif: "fin de la relecture (essai fictif)" });
    expect(listerLieuxParDossier(ancien).size).toBe(0);
    expect(listerLieuxParDossier({ personneId: "inconnu", nom: "Personne (fictive)" }).size).toBe(0);
  });

  it("ne pas lire les lieux d'un dossier n'est pas un refus : rien ne s'écrit au journal", () => {
    const a = dossier("Dossier A (fictif)");
    const b = dossier("Dossier B (fictif)");
    const artisan = acteurDe(inviter(a.id, "Artisan (fictif)", "professionnel", ["budget"]), "Artisan (fictif)");

    listerLieuxParDossier(artisan);
    listerLieuxParDossier(moi);
    expect(refus(a.id)).toHaveLength(0);
    expect(refus(b.id)).toHaveLength(0);
  });
});
