// Droits appliqués côté serveur, sur une base SQLite en mémoire : ce que `src/lib/*` refuse
// vraiment, pas seulement ce que `peut()` répond.

import { beforeEach, describe, expect, it } from "vitest";
import { reinitialiserBasePourTests } from "@/lib/db/client";
import { creerDossier, listerDossiers, obtenirDossier, configurerIA, journalAudit, creerScenario } from "@/lib/dossiers";
import { inviterPersonne, revoquerParticipation, listerParticipations, modifierParticipation } from "@/lib/personnes";
import { creerLieu, listerLieux } from "@/lib/structure";
import { creerPoste, listerPostes } from "@/lib/budget";
import { ErreurApplicative } from "@/lib/erreurs";
import type { Acteur } from "@/lib/acces";

const christophe: Acteur = { personneId: "utilisateur-local", nom: "Utilisateur local" };

function attendInterdit(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ErreurApplicative);
    expect((e as ErreurApplicative).code).toBe("INTERDIT");
    return;
  }
  throw new Error("Aucune erreur levée, INTERDIT attendu");
}

describe("droits d'accès entre rôles", () => {
  beforeEach(() => {
    reinitialiserBasePourTests();
  });

  it("le créateur est propriétaire ; une autre personne ne voit pas le dossier", () => {
    const d = creerDossier(christophe, { nom: "Pilote" });
    expect(listerDossiers(christophe).map((x) => x.id)).toEqual([d.id]);

    const autre = inviterPersonne(christophe, { dossierId: d.id, nom: "Lydia", role: "lecteur" });
    const lydia: Acteur = { personneId: autre.personneId, nom: "Lydia" };
    const d2 = creerDossier(lydia, { nom: "Dossier de Lydia" });

    // Isolation : chacun ne voit que ses dossiers.
    expect(listerDossiers(christophe).map((x) => x.id)).toEqual([d.id]);
    expect(listerDossiers(lydia).map((x) => x.id).sort()).toEqual([d.id, d2.id].sort());
    attendInterdit(() => obtenirDossier(christophe, d2.id));
    attendInterdit(() => obtenirDossier({ personneId: "inconnu", nom: "?" }, d.id));
  });

  it("un dossier inexistant et un dossier interdit répondent de la même façon", () => {
    const d = creerDossier(christophe, { nom: "Pilote" });
    const inconnu: Acteur = { personneId: "inconnu", nom: "?" };
    attendInterdit(() => obtenirDossier(inconnu, d.id));
    attendInterdit(() => obtenirDossier(inconnu, "n-existe-pas"));
  });

  it("un lecteur lit mais n'écrit pas ; un contributeur écrit mais ne gère pas les droits", () => {
    const d = creerDossier(christophe, { nom: "Pilote" });
    const l = inviterPersonne(christophe, { dossierId: d.id, nom: "Ami", role: "lecteur" });
    const c = inviterPersonne(christophe, { dossierId: d.id, nom: "Compagne", role: "contributeur" });
    const ami: Acteur = { personneId: l.personneId, nom: "Ami" };
    const compagne: Acteur = { personneId: c.personneId, nom: "Compagne" };

    expect(listerLieux(ami, d.id)).toEqual([]);
    attendInterdit(() => creerLieu(ami, { dossierId: d.id, nom: "Bien", typeLieu: "bien_candidat" }));
    expect(creerLieu(compagne, { dossierId: d.id, nom: "Bien", typeLieu: "bien_candidat" }).nom).toBe("Bien");
    attendInterdit(() => inviterPersonne(compagne, { dossierId: d.id, nom: "X", role: "lecteur" }));
    attendInterdit(() => configurerIA(compagne, d.id, { activee: true, perimetre: ["budget"], fournisseur: "regles_locales" }));
    attendInterdit(() => journalAudit(ami, d.id));
  });

  it("un professionnel ne voit que son périmètre, et plus rien après révocation", () => {
    const d = creerDossier(christophe, { nom: "Pilote" });
    const s = creerScenario(christophe, { dossierId: d.id, nom: "Rénovation" });
    creerPoste(christophe, { scenarioId: s.id, nom: "Toiture" });

    expect(() => inviterPersonne(christophe, { dossierId: d.id, nom: "Notaire", role: "professionnel", finalite: "Acte" })).toThrow(/au moins une section/);
    const p = inviterPersonne(christophe, { dossierId: d.id, nom: "Notaire", type: "professionnel", profession: "notaire", role: "professionnel", perimetre: ["documents", "lieux"], finalite: "Acte de vente" });
    const notaire: Acteur = { personneId: p.personneId, nom: "Notaire" };

    expect(listerLieux(notaire, d.id)).toEqual([]); // section autorisée : lecture OK
    attendInterdit(() => listerPostes(notaire, d.id)); // budget hors périmètre
    attendInterdit(() => listerParticipations(notaire, d.id)); // personnes hors périmètre
    attendInterdit(() => creerLieu(notaire, { dossierId: d.id, nom: "Bien", typeLieu: "bien_candidat" })); // pas d'écriture sur lieux

    revoquerParticipation(christophe, { participationId: p.id, motif: "Mission terminée" });
    attendInterdit(() => listerLieux(notaire, d.id));
    expect(listerDossiers(notaire)).toEqual([]);

    // Le journal garde la trace de la révocation et des refus.
    const journal = journalAudit(christophe, d.id);
    expect(journal.some((e) => e.action === "revocation")).toBe(true);
    expect(journal.some((e) => e.action === "acces_refuse" && e.acteurId === notaire.personneId)).toBe(true);
  });

  it("le dernier propriétaire ne peut être ni révoqué ni rétrogradé", () => {
    const d = creerDossier(christophe, { nom: "Pilote" });
    const moi = listerParticipations(christophe, d.id).find((p) => p.personneId === christophe.personneId)!;
    expect(() => revoquerParticipation(christophe, { participationId: moi.id, motif: "test" })).toThrow(/dernier propriétaire/);
    expect(() => modifierParticipation(christophe, { participationId: moi.id, role: "lecteur", motif: "test" })).toThrow(/dernier propriétaire/);
  });
});
