// Les biens des autres dossiers sur la carte d'un dossier (issue #50). Base en mémoire, données
// fictives, aucun réseau.
//
// Ce que ces tests gardent : la carte ne montre à un acteur rien de plus que ce qu'il lirait en
// ouvrant chaque dossier. Un dossier auquel il ne participe pas, ou dont il ne lit pas les lieux,
// n'y laisse aucune trace.

import { beforeEach, describe, expect, it } from "vitest";
import { reinitialiserBasePourTests } from "@/lib/db/client";
import { creerDossier, journalAudit } from "@/lib/dossiers";
import { creerLieu, listerLieuxVoisins, modifierPositionLieu } from "@/lib/structure";
import { inviterPersonne, revoquerParticipation } from "@/lib/personnes";
import type { Acteur } from "@/lib/acces";

const moi: Acteur = { personneId: "utilisateur-local", nom: "Utilisateur local" };

describe("lieux des autres dossiers sur la carte", () => {
  beforeEach(() => reinitialiserBasePourTests());

  /** Un dossier avec un lieu situé et un lieu non situé. */
  function dossier(nom: string, latitudeMicrodeg: number) {
    const d = creerDossier(moi, { nom });
    const situe = creerLieu(moi, { dossierId: d.id, nom: `Bien situé de ${nom}`, typeLieu: "bien_candidat", adresse: "3 chemin du Lavoir (fictive)", adresseSource: "saisie", description: "note privée (fictive)" });
    modifierPositionLieu(moi, { lieuId: situe.id, latitudeMicrodeg, longitudeMicrodeg: 2_500_000, positionSource: "saisie" });
    const nonSitue = creerLieu(moi, { dossierId: d.id, nom: `Bien non situé de ${nom}`, typeLieu: "bien_candidat" });
    return { id: d.id, situe, nonSitue };
  }
  // Inviter un professionnel exige de dire sa mission.
  const MISSION = "relecture du dossier (essai fictif)";
  const inviter = (dossierId: string, nom: string, role: string, perimetre?: string[]) =>
    inviterPersonne(moi, { dossierId, nom, role, perimetre, ...(role === "professionnel" ? { finalite: MISSION } : {}) });
  const acteurDe = (participation: { personneId: string }, nom: string): Acteur => ({ personneId: participation.personneId, nom });
  const refus = (dossierId: string) => journalAudit(moi, dossierId).filter((e) => e.action === "acces_refuse");

  it("le propriétaire de deux dossiers voit, depuis l'un, les lieux situés de l'autre, et eux seuls", () => {
    const a = dossier("Dossier A (fictif)", 46_500_000);
    const b = dossier("Dossier B (fictif)", 46_600_000);

    expect(listerLieuxVoisins(moi, a.id)).toEqual([
      { id: b.situe.id, nom: "Bien situé de Dossier B (fictif)", dossierId: b.id, dossierNom: "Dossier B (fictif)", position: { latitudeMicrodeg: 46_600_000, longitudeMicrodeg: 2_500_000 } },
    ]);
    expect(listerLieuxVoisins(moi, b.id).map((v) => v.id)).toEqual([a.situe.id]);
  });

  it("ne donne du lieu que son nom, son dossier et sa position : ni adresse, ni description, ni provenance", () => {
    const a = dossier("Dossier A (fictif)", 46_500_000);
    dossier("Dossier B (fictif)", 46_600_000);
    const [voisin] = listerLieuxVoisins(moi, a.id);
    expect(Object.keys(voisin).sort()).toEqual(["dossierId", "dossierNom", "id", "nom", "position"]);
    expect(JSON.stringify(voisin)).not.toContain("Lavoir");
    expect(JSON.stringify(voisin)).not.toContain("note privée");
  });

  it("un dossier seul n'a pas de voisin, et les lieux suivent l'ordre de création", () => {
    const a = dossier("Dossier A (fictif)", 46_500_000);
    expect(listerLieuxVoisins(moi, a.id)).toEqual([]);
    const b = dossier("Dossier B (fictif)", 46_600_000);
    const c = dossier("Dossier C (fictif)", 46_700_000);
    const second = creerLieu(moi, { dossierId: b.id, nom: "Second bien de B (fictif)", typeLieu: "terrain" });
    modifierPositionLieu(moi, { lieuId: second.id, latitudeMicrodeg: 46_650_000, longitudeMicrodeg: 2_500_000, positionSource: "estimation" });
    expect(listerLieuxVoisins(moi, a.id).map((v) => v.id)).toEqual([b.situe.id, second.id, c.situe.id]);
  });

  it("un invité d'un seul dossier ne voit rien des autres, et aucun refus n'est écrit pour autant", () => {
    const a = dossier("Dossier A (fictif)", 46_500_000);
    const b = dossier("Dossier B (fictif)", 46_600_000);
    const ami = acteurDe(inviter(a.id, "Ami (fictif)", "lecteur"), "Ami (fictif)");

    expect(listerLieuxVoisins(ami, a.id)).toEqual([]);
    // Ne pas participer à un dossier voisin n'est pas une tentative d'accès.
    expect(refus(b.id)).toHaveLength(0);
    // En revanche, demander la carte d'un dossier où l'on n'est pas invité en est une.
    expect(() => listerLieuxVoisins(ami, b.id)).toThrow(/Accès refusé/);
    expect(refus(b.id)).toHaveLength(1);
  });

  it("un professionnel invité dans plusieurs dossiers ne voit que ceux dont il lit les lieux", () => {
    const a = dossier("Dossier A (fictif)", 46_500_000);
    const b = dossier("Dossier B (fictif)", 46_600_000);
    const c = dossier("Dossier C (fictif)", 46_700_000);
    const invitation = inviter(a.id, "Notaire (fictif)", "professionnel", ["lieux"]);
    const notaire = acteurDe(invitation, "Notaire (fictif)");
    inviterPersonne(moi, { dossierId: b.id, personneId: invitation.personneId, role: "professionnel", perimetre: ["documents"], finalite: MISSION });

    // Invité dans B, mais sans la section « lieux » : rien de B n'apparaît.
    expect(listerLieuxVoisins(notaire, a.id)).toEqual([]);
    expect(refus(b.id)).toHaveLength(0);

    inviterPersonne(moi, { dossierId: c.id, personneId: invitation.personneId, role: "professionnel", perimetre: ["lieux"], finalite: MISSION });
    expect(listerLieuxVoisins(notaire, a.id).map((v) => `${v.nom} · ${v.dossierNom}`)).toEqual(["Bien situé de Dossier C (fictif) · Dossier C (fictif)"]);

    // Depuis B, où il ne lit pas les lieux, il n'a pas de carte du tout.
    expect(() => listerLieuxVoisins(notaire, b.id)).toThrow(/Accès refusé/);
  });

  it("une participation révoquée ne laisse plus rien voir", () => {
    const a = dossier("Dossier A (fictif)", 46_500_000);
    const b = dossier("Dossier B (fictif)", 46_600_000);
    const invitation = inviter(a.id, "Associée (fictive)", "contributeur");
    const associee = acteurDe(invitation, "Associée (fictive)");
    const chezB = inviterPersonne(moi, { dossierId: b.id, personneId: invitation.personneId, role: "lecteur" });
    expect(listerLieuxVoisins(associee, a.id).map((v) => v.id)).toEqual([b.situe.id]);

    revoquerParticipation(moi, { participationId: chezB.id, motif: "fin de l'essai" });
    expect(listerLieuxVoisins(associee, a.id)).toEqual([]);
    expect(refus(b.id)).toHaveLength(0);
  });
});
