// Position d'un lieu sur la carte : une provenance comme l'adresse, posée d'après l'adresse par le
// service d'adresses ou à la main, tracée, jamais transmise à l'assistant. Base en mémoire,
// données fictives ; le réseau est remplacé par un faux `fetch` : aucun appel réel ici.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reinitialiserBasePourTests } from "@/lib/db/client";
import { creerDossier, configurerIA, journalAudit, obtenirDossier } from "@/lib/dossiers";
import { creerLieu, listerLieux, modifierPositionLieu, obtenirLieu, retirerLieu } from "@/lib/structure";
import { situerLieuDepuisAdresse } from "@/lib/geocodage";
import { inviterPersonne } from "@/lib/personnes";
import { construireContexte } from "@/lib/ia";
import { serialiserContexte } from "@/domain/ia/types";
import { ErreurApplicative } from "@/lib/erreurs";
import type { Acteur } from "@/lib/acces";

const moi: Acteur = { personneId: "utilisateur-local", nom: "Utilisateur local" };
// Adresse d'exemple : une rue commerçante de Paris, connue de tous, sans lien avec un bien étudié.
// La réponse simulée du service en reprend la forme réelle (données publiques).
const ADRESSE = "1 rue de la Paix, 75002 Paris";
const PARIS = { latitudeMicrodeg: 48_868_546, longitudeMicrodeg: 2_330_310 };

const reponseBan = (features: unknown[]) =>
  new Response(JSON.stringify({ type: "FeatureCollection", features, query: ADRESSE }), { status: 200, headers: { "Content-Type": "application/json" } });
const correspondance = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [2.33031, 48.868546] },
  properties: { label: "1 Rue de la Paix 75002 Paris", score: 0.96 },
};

describe("position d'un lieu", () => {
  beforeEach(() => reinitialiserBasePourTests());
  afterEach(() => vi.unstubAllGlobals());

  function lieuAvecAdresse() {
    const d = creerDossier(moi, { nom: "Dossier d'essai (fictif)" });
    const lieu = creerLieu(moi, { dossierId: d.id, nom: "Bien candidat (fictif)", typeLieu: "bien_candidat", adresse: ADRESSE, adresseSource: "saisie" });
    return { d, lieu };
  }

  it("se pose, se déplace et s'efface, avec sa provenance, et c'est tracé", () => {
    const { d, lieu } = lieuAvecAdresse();
    expect(lieu.position).toEqual({ valeur: null, source: null, confiance: "a_renseigner", note: null });

    const posee = modifierPositionLieu(moi, { lieuId: lieu.id, ...PARIS, positionSource: "saisie", motif: "repère posé à la main" });
    expect(posee.position).toEqual({ valeur: PARIS, source: "saisie", confiance: "connu", note: null });
    expect(listerLieux(moi, d.id)[0].position.valeur).toEqual(PARIS);

    const deplacee = modifierPositionLieu(moi, { lieuId: lieu.id, latitudeMicrodeg: 48_870_000, longitudeMicrodeg: 2_331_000, positionSource: "estimation" });
    expect(deplacee.position).toMatchObject({ valeur: { latitudeMicrodeg: 48_870_000, longitudeMicrodeg: 2_331_000 }, source: "estimation", confiance: "estime" });

    const effacee = modifierPositionLieu(moi, { lieuId: lieu.id, latitudeMicrodeg: null, longitudeMicrodeg: null });
    expect(effacee.position).toEqual({ valeur: null, source: null, confiance: "a_renseigner", note: null });

    const modifications = journalAudit(moi, d.id).filter((e) => e.nomEntite === "lieu" && e.action === "modification");
    expect(modifications).toHaveLength(3);
    // Trois événements dans la même milliseconde : on les retrouve par leur contenu, pas par leur rang.
    const premiere = modifications.find((e) => e.motif === "repère posé à la main");
    // La note ne change pas ici (aucune avant, aucune après) : elle ne laisse pas de ligne vide.
    expect(modifications.flatMap((e) => e.changements ?? []).some((c) => c.champ === "position_note")).toBe(false);
    expect(premiere?.changements).toEqual(
      expect.arrayContaining([
        { champ: "latitude_microdeg", avant: null, apres: PARIS.latitudeMicrodeg },
        { champ: "longitude_microdeg", avant: null, apres: PARIS.longitudeMicrodeg },
        { champ: "position_source", avant: null, apres: "saisie" },
        { champ: "position_confiance", avant: "a_renseigner", apres: "connu" },
      ]),
    );
    expect(modifications.flatMap((e) => e.changements ?? [])).toEqual(
      expect.arrayContaining([
        { champ: "latitude_microdeg", avant: PARIS.latitudeMicrodeg, apres: 48_870_000 },
        { champ: "latitude_microdeg", avant: 48_870_000, apres: null },
        { champ: "position_confiance", avant: "estime", apres: "a_renseigner" },
      ]),
    );
  });

  it("refuse une coordonnée seule, une valeur hors bornes et une position sans provenance", () => {
    const { lieu } = lieuAvecAdresse();
    expect(() => modifierPositionLieu(moi, { lieuId: lieu.id, latitudeMicrodeg: PARIS.latitudeMicrodeg, longitudeMicrodeg: null, positionSource: "saisie" })).toThrow(/aucune des deux/);
    expect(() => modifierPositionLieu(moi, { lieuId: lieu.id, latitudeMicrodeg: 91_000_000, longitudeMicrodeg: 0, positionSource: "saisie" })).toThrow(/latitude/);
    expect(() => modifierPositionLieu(moi, { lieuId: lieu.id, latitudeMicrodeg: 0, longitudeMicrodeg: 181_000_000, positionSource: "saisie" })).toThrow(/longitude/);
    expect(() => modifierPositionLieu(moi, { lieuId: lieu.id, ...PARIS })).toThrow(/d'où vient/);
    expect(() => modifierPositionLieu(moi, { lieuId: lieu.id, ...PARIS, positionSource: "saisie", positionConfiance: "a_renseigner" })).toThrow(ErreurApplicative);
    expect(obtenirLieu(moi, lieu.id).position.valeur).toBeNull();
  });

  it("un lecteur ne pose pas de repère, et un lieu inconnu répond par le même refus", () => {
    const { d, lieu } = lieuAvecAdresse();
    const invite = inviterPersonne(moi, { dossierId: d.id, nom: "Ami (fictif)", role: "lecteur" });
    const ami: Acteur = { personneId: invite.personneId, nom: "Ami (fictif)" };
    expect(obtenirLieu(ami, lieu.id).position.valeur).toBeNull();
    expect(() => modifierPositionLieu(ami, { lieuId: lieu.id, ...PARIS, positionSource: "saisie" })).toThrow(/Accès refusé/);
    expect(() => modifierPositionLieu(moi, { lieuId: "inconnu", ...PARIS, positionSource: "saisie" })).toThrow(/Accès refusé/);
  });

  it("se situe d'après l'adresse : seule l'adresse part, la position revient « source externe · à confirmer »", async () => {
    const { d, lieu } = lieuAvecAdresse();
    const faux = vi.fn(async () => reponseBan([correspondance]));
    vi.stubGlobal("fetch", faux);

    const situe = await situerLieuDepuisAdresse(moi, { lieuId: lieu.id });
    expect(situe.position).toEqual({ valeur: PARIS, source: "source_externe", confiance: "a_confirmer", note: "1 Rue de la Paix 75002 Paris" });

    expect(faux).toHaveBeenCalledTimes(1);
    const url = new URL(String((faux.mock.calls[0] as unknown[])[0]));
    expect(url.host).toBe("data.geopf.fr");
    expect(url.searchParams.get("q")).toBe(ADRESSE);
    expect(url.searchParams.get("limit")).toBe("1");
    expect(url.toString()).not.toContain(encodeURIComponent("fictif"));
    expect(url.toString()).not.toContain(d.id);

    const evenement = journalAudit(moi, d.id).find((e) => e.nomEntite === "lieu" && e.action === "modification");
    expect(evenement?.motif).toMatch(/Base Adresse Nationale/);
    expect(evenement?.motif).toMatch(/score 96 %/);
    expect(evenement?.changements).toEqual(expect.arrayContaining([{ champ: "position_note", avant: null, apres: "1 Rue de la Paix 75002 Paris" }]));

    // Recalé à la main : la position n'est plus celle du service, sa note s'efface, et c'est tracé.
    const recale = modifierPositionLieu(moi, { lieuId: lieu.id, latitudeMicrodeg: 48_868_000, longitudeMicrodeg: 2_330_000, positionSource: "saisie" });
    expect(recale.position).toEqual({ valeur: { latitudeMicrodeg: 48_868_000, longitudeMicrodeg: 2_330_000 }, source: "saisie", confiance: "connu", note: null });
    expect(journalAudit(moi, d.id).flatMap((e) => e.changements ?? [])).toEqual(
      expect.arrayContaining([{ champ: "position_note", avant: "1 Rue de la Paix 75002 Paris", apres: null }]),
    );
  });

  it("sans adresse, rien ne part ; sans correspondance ou sans réseau, rien n'est écrit", async () => {
    const d = creerDossier(moi, { nom: "Dossier d'essai (fictif)" });
    const sansAdresse = creerLieu(moi, { dossierId: d.id, nom: "Terrain (fictif)", typeLieu: "terrain" });
    const faux = vi.fn(async () => reponseBan([]));
    vi.stubGlobal("fetch", faux);
    await expect(situerLieuDepuisAdresse(moi, { lieuId: sansAdresse.id })).rejects.toThrow(/pas d'adresse/);
    expect(faux).not.toHaveBeenCalled();

    const { lieu } = lieuAvecAdresse();
    await expect(situerLieuDepuisAdresse(moi, { lieuId: lieu.id })).rejects.toThrow(/non reconnue/);
    expect(obtenirLieu(moi, lieu.id).position.valeur).toBeNull();

    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("réseau coupé"))));
    await expect(situerLieuDepuisAdresse(moi, { lieuId: lieu.id })).rejects.toMatchObject({ code: "SERVICE_INDISPONIBLE" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("indisponible", { status: 503 })));
    await expect(situerLieuDepuisAdresse(moi, { lieuId: lieu.id })).rejects.toMatchObject({ code: "SERVICE_INDISPONIBLE" });
    expect(obtenirLieu(moi, lieu.id).position.valeur).toBeNull();
    expect(journalAudit(moi, lieu.dossierId).filter((e) => e.nomEntite === "lieu" && e.action === "modification")).toHaveLength(0);
  });

  it("un lecteur ne fait pas partir l'adresse", async () => {
    const { d, lieu } = lieuAvecAdresse();
    const invite = inviterPersonne(moi, { dossierId: d.id, nom: "Ami (fictif)", role: "lecteur" });
    const faux = vi.fn(async () => reponseBan([correspondance]));
    vi.stubGlobal("fetch", faux);
    await expect(situerLieuDepuisAdresse({ personneId: invite.personneId, nom: "Ami (fictif)" }, { lieuId: lieu.id })).rejects.toThrow(/Accès refusé/);
    expect(faux).not.toHaveBeenCalled();
  });

  it("la position ne part jamais vers l'assistant, même avec la section Lieux cochée", () => {
    const { d, lieu } = lieuAvecAdresse();
    modifierPositionLieu(moi, { lieuId: lieu.id, ...PARIS, positionSource: "saisie" });
    configurerIA(moi, d.id, { activee: true, perimetre: ["identite", "lieux"], fournisseur: "regles_locales" });
    const texte = serialiserContexte(construireContexte(moi, obtenirDossier(moi, d.id)));
    expect(texte).toContain("Bien candidat (fictif)");
    for (const interdit of ["48868546", "48,868546", "48.868546", "2330310", "2,33031", "2.33031", ADRESSE, "latitude", "longitude", "position"]) {
      expect(texte).not.toContain(interdit);
    }
  });

  it("un lieu retiré laisse sa position au journal", () => {
    const { d, lieu } = lieuAvecAdresse();
    modifierPositionLieu(moi, { lieuId: lieu.id, ...PARIS, positionSource: "saisie" });
    retirerLieu(moi, { lieuId: lieu.id });
    const suppression = journalAudit(moi, d.id).find((e) => e.nomEntite === "lieu" && e.action === "suppression");
    expect(suppression?.changements).toEqual(
      expect.arrayContaining([
        { champ: "latitude_microdeg", avant: PARIS.latitudeMicrodeg, apres: null },
        { champ: "longitude_microdeg", avant: PARIS.longitudeMicrodeg, apres: null },
        { champ: "position_source", avant: "saisie", apres: null },
        { champ: "position_confiance", avant: "connu", apres: null },
      ]),
    );
  });
});
