import { describe, expect, it } from "vitest";
import { classerPourAccueil, construireTimeline, creeraitUnCycle, prerequisBloquants, type ActionPlanifiee, type Dependance } from "@/domain/planning";

const action = (id: string, extra: Partial<ActionPlanifiee> = {}): ActionPlanifiee => ({
  id,
  description: id,
  statut: "a_faire",
  echeance: null,
  responsable: null,
  estJalon: false,
  scenarioId: null,
  ...extra,
});

const AUJOURDHUI = "2026-10-09";

describe("dépendances", () => {
  const actions = [action("devis", { statut: "a_faire" }), action("commande"), action("pose"), action("fait", { statut: "fait" })];
  const deps: Dependance[] = [
    { actionId: "commande", dependDeId: "devis" },
    { actionId: "pose", dependDeId: "commande" },
    { actionId: "pose", dependDeId: "fait" },
  ];

  it("liste les prérequis non faits", () => {
    expect(prerequisBloquants("commande", actions, deps)).toEqual(["devis"]);
    expect(prerequisBloquants("pose", actions, deps)).toEqual(["commande"]);
    expect(prerequisBloquants("devis", actions, deps)).toEqual([]);
  });

  it("détecte un cycle, direct ou indirect", () => {
    expect(creeraitUnCycle(deps, "devis", "pose")).toBe(true); // pose → commande → devis → pose
    expect(creeraitUnCycle(deps, "devis", "devis")).toBe(true);
    expect(creeraitUnCycle(deps, "devis", "fait")).toBe(false);
  });
});

describe("classerPourAccueil", () => {
  it("une action n'apparaît que dans une colonne, « à débloquer » d'abord", () => {
    const actions = [
      action("retard-bloquee", { echeance: "2026-10-01" }),
      action("retard", { echeance: "2026-10-01" }),
      action("du-jour", { echeance: AUJOURDHUI }),
      action("bloquee", { statut: "bloque" }),
      action("future", { echeance: "2027-01-01" }),
      action("sans-date"),
      action("faite", { statut: "fait", echeance: "2026-01-01" }),
      action("prerequis"),
    ];
    const deps: Dependance[] = [{ actionId: "retard-bloquee", dependDeId: "prerequis" }];
    const c = classerPourAccueil(actions, deps, AUJOURDHUI);
    expect(c.aDebloquer.map((a) => a.id)).toEqual(["retard-bloquee", "bloquee"]);
    expect(c.aujourdhui.map((a) => a.id)).toEqual(["retard", "du-jour"]);
    expect(c.aExplorer.map((a) => a.id)).toEqual(["future", "sans-date", "prerequis"]);
    const total = c.aujourdhui.length + c.aDebloquer.length + c.aExplorer.length;
    expect(total).toBe(7); // la faite n'apparaît nulle part
  });
});

describe("construireTimeline", () => {
  it("n'invente pas de date : les actions sans échéance restent à part", () => {
    const t = construireTimeline(
      [action("b", { echeance: "2026-12-01" }), action("a", { echeance: "2026-09-01" }), action("x"), action("j", { echeance: AUJOURDHUI, estJalon: true })],
      [],
      AUJOURDHUI,
    );
    expect(t.datees.map((e) => e.action.id)).toEqual(["a", "j", "b"]);
    expect(t.datees[0].position).toBe("passe");
    expect(t.datees[0].enRetard).toBe(true);
    expect(t.datees[1].position).toBe("aujourdhui");
    expect(t.sansDate.map((e) => e.action.id)).toEqual(["x"]);
  });
});
