// Le code postal et la ville d'un lieu (issue #52). Base en mémoire, données fictives ; le réseau
// est remplacé par un faux service : aucun appel réel.
//
// Ce que ces tests gardent : un lieu peut connaître sa commune sans connaître son adresse, avec sa
// propre provenance ; modifier l'une ne touche pas à l'autre ; ce qui part vers le service
// d'adresses n'est que ce qui est renseigné de l'adresse ; plusieurs communes possibles, aucune
// n'est choisie d'office ; ce que le service rend va dans le bon champ, seulement si c'est demandé ;
// le code postal et la ville ne partent jamais vers l'assistant.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { obtenirBase, reinitialiserBasePourTests } from "@/lib/db/client";
import { configurerIA, creerDossier, journalAudit, obtenirDossier } from "@/lib/dossiers";
import { creerLieu, listerLieux, modifierAdresseLieu, obtenirLieu, retirerLieu } from "@/lib/structure";
import { situerLieuDepuisAdresse, situerLieuParClic, situerLieuSurEndroit } from "@/lib/geocodage";
import { inviterPersonne } from "@/lib/personnes";
import { construireContexte } from "@/lib/ia";
import { construireExport } from "@/lib/export";
import { serialiserContexte } from "@/domain/ia/types";
import type { Acteur } from "@/lib/acces";

const moi: Acteur = { personneId: "utilisateur-local", nom: "Utilisateur local" };
const NOM_LIEU = "Bien candidat (fictif)";
const VOIE = "3 chemin du Lavoir";
const CODE = "00100";
const VILLE = "Ville-Fictive";
const POINT = { latitudeMicrodeg: 46_500_000, longitudeMicrodeg: 2_500_000 };
const A_RENSEIGNER = { valeur: null, source: null, confiance: "a_renseigner" };

const commune = (nom: string, postcode: string) => ({ geometry: { coordinates: [2.5, 46.5] }, properties: { type: "municipality", label: nom, name: nom, postcode, city: nom, id: `${postcode}-${nom}` } });
const numero = (voie: string, postcode: string, ville: string, plus: Record<string, unknown> = {}) => ({
  geometry: { coordinates: [2.512, 46.512] },
  properties: { type: "housenumber", label: `${voie} ${postcode} ${ville}`, name: voie, postcode, city: ville, score: 0.93, ...plus },
});

/** Remplace le réseau : répond selon le chemin demandé, et garde la liste des appels. */
function fauxService(reponses: { recherche?: (url: URL) => unknown[]; inverse?: (url: URL) => unknown[] }): URL[] {
  const appels: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (entree: string | URL) => {
      const url = new URL(String(entree));
      appels.push(url);
      const features = url.pathname.endsWith("/reverse") ? (reponses.inverse?.(url) ?? []) : (reponses.recherche?.(url) ?? []);
      return new Response(JSON.stringify({ type: "FeatureCollection", features }), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
  return appels;
}

describe("code postal et ville d'un lieu", () => {
  beforeEach(() => reinitialiserBasePourTests());
  afterEach(() => vi.unstubAllGlobals());

  function dossierEtLieu(adresse: { adresse?: string; codePostal?: string; ville?: string } = {}) {
    const d = creerDossier(moi, { nom: "Dossier d'essai (fictif)" });
    const aUneAdresse = Object.values(adresse).some((v) => v);
    const lieu = creerLieu(moi, { dossierId: d.id, nom: NOM_LIEU, typeLieu: "bien_candidat", ...adresse, ...(aUneAdresse ? { adresseSource: "saisie" } : {}) });
    return { d, lieu };
  }
  const lecteurDe = (dossierId: string): Acteur => {
    const invite = inviterPersonne(moi, { dossierId, nom: "Ami (fictif)", role: "lecteur" });
    return { personneId: invite.personneId, nom: "Ami (fictif)" };
  };
  const ecritures = (dossierId: string) => journalAudit(moi, dossierId).filter((e) => e.nomEntite === "lieu" && e.action === "modification");
  const champsEcrits = (dossierId: string) => ecritures(dossierId).map((e) => (e.changements ?? []).map((c) => c.champ));

  // --- Saisie ---------------------------------------------------------------------------------------

  it("un lieu peut connaître sa commune sans connaître son adresse, avec sa propre provenance", () => {
    const { lieu } = dossierEtLieu({ codePostal: CODE, ville: VILLE });
    expect(lieu.adresse).toEqual(A_RENSEIGNER);
    expect(lieu.commune).toMatchObject({ valeur: { codePostal: CODE, ville: VILLE }, source: "saisie", confiance: "connu" });

    const seule = creerLieu(moi, { dossierId: lieu.dossierId, nom: "Terrain (fictif)", typeLieu: "bien_candidat", ville: VILLE, adresseSource: "estimation" });
    expect(seule.commune).toMatchObject({ valeur: { codePostal: null, ville: VILLE }, source: "estimation", confiance: "estime" });
  });

  it("la voie, le code postal et la ville reçoivent la même réponse de provenance", () => {
    const d = creerDossier(moi, { nom: "Dossier d'essai (fictif)" });
    const lieu = creerLieu(moi, { dossierId: d.id, nom: NOM_LIEU, typeLieu: "bien_candidat", adresse: VOIE, codePostal: CODE, ville: VILLE, adresseSource: "import", adresseConfiance: "a_confirmer" });
    expect(lieu.adresse).toMatchObject({ valeur: VOIE, source: "import", confiance: "a_confirmer" });
    expect(lieu.commune).toMatchObject({ valeur: { codePostal: CODE, ville: VILLE }, source: "import", confiance: "a_confirmer" });
  });

  it("sans adresse, ni code postal, ni ville, tout reste à renseigner", () => {
    const { lieu } = dossierEtLieu();
    expect(lieu.adresse).toEqual(A_RENSEIGNER);
    expect(lieu.commune).toEqual(A_RENSEIGNER);
  });

  it("une commune saisie sans dire d'où elle vient est refusée, et rien n'est créé", () => {
    const d = creerDossier(moi, { nom: "Dossier d'essai (fictif)" });
    expect(() => creerLieu(moi, { dossierId: d.id, nom: NOM_LIEU, typeLieu: "bien_candidat", ville: VILLE })).toThrow(/d'où vient cette information/);
    expect(listerLieux(moi, d.id)).toHaveLength(0);
  });

  it("un code postal mal formé est refusé, à la création comme à la correction, et rien n'est écrit", () => {
    const { d, lieu } = dossierEtLieu({ codePostal: CODE, ville: VILLE });
    expect(() => creerLieu(moi, { dossierId: d.id, nom: "Autre (fictif)", typeLieu: "bien_candidat", codePostal: "0010", adresseSource: "saisie" })).toThrow(/cinq chiffres/);
    expect(() => modifierAdresseLieu(moi, { lieuId: lieu.id, commune: { codePostal: "0010A", ville: VILLE }, adresseSource: "saisie" })).toThrow(/cinq chiffres/);
    expect(listerLieux(moi, d.id)).toHaveLength(1);
    expect(obtenirLieu(moi, lieu.id).commune.valeur).toEqual({ codePostal: CODE, ville: VILLE });
    expect(ecritures(d.id)).toHaveLength(0);
  });

  it("modifier la commune ne touche pas à la voie, et inversement ; le journal ne cite que ce qui a été écrit", () => {
    const { d, lieu } = dossierEtLieu({ adresse: VOIE });

    const avecCommune = modifierAdresseLieu(moi, { lieuId: lieu.id, commune: { codePostal: CODE, ville: VILLE }, adresseSource: "estimation", motif: "commune de l'annonce (essai)" });
    expect(avecCommune.adresse).toMatchObject({ valeur: VOIE, source: "saisie", confiance: "connu" });
    expect(avecCommune.commune).toMatchObject({ valeur: { codePostal: CODE, ville: VILLE }, source: "estimation", confiance: "estime" });

    const autreVoie = modifierAdresseLieu(moi, { lieuId: lieu.id, adresse: "5 chemin du Lavoir", adresseSource: "saisie" });
    expect(autreVoie.adresse.valeur).toBe("5 chemin du Lavoir");
    expect(autreVoie.commune).toMatchObject({ valeur: { codePostal: CODE, ville: VILLE }, source: "estimation", confiance: "estime" });

    const traces = ecritures(d.id);
    expect(traces).toHaveLength(2);
    const pourLaCommune = traces.find((e) => e.changements?.some((c) => c.champ === "ville"));
    expect(pourLaCommune?.motif).toBe("commune de l'annonce (essai)");
    expect(pourLaCommune?.changements).toEqual([
      { champ: "code_postal", avant: null, apres: CODE },
      { champ: "ville", avant: null, apres: VILLE },
      { champ: "commune_source", avant: null, apres: "estimation" },
      { champ: "commune_confiance", avant: "a_renseigner", apres: "estime" },
    ]);
    const pourLaVoie = traces.find((e) => e.changements?.some((c) => c.champ === "adresse"));
    expect(pourLaVoie?.changements?.map((c) => c.champ)).toEqual(["adresse", "adresse_source", "adresse_confiance"]);
  });

  it("une commune vidée redevient à renseigner, sans source", () => {
    const { lieu } = dossierEtLieu({ adresse: VOIE, codePostal: CODE, ville: VILLE });
    const videe = modifierAdresseLieu(moi, { lieuId: lieu.id, commune: { codePostal: "", ville: " " } });
    expect(videe.commune).toEqual(A_RENSEIGNER);
    expect(videe.adresse.valeur).toBe(VOIE);
  });

  it("un lecteur ne modifie ni la voie ni la commune", () => {
    const { d, lieu } = dossierEtLieu({ codePostal: CODE, ville: VILLE });
    expect(() => modifierAdresseLieu(lecteurDe(d.id), { lieuId: lieu.id, commune: { codePostal: "00200", ville: "Bourg-Fictif" }, adresseSource: "saisie" })).toThrow(/Accès refusé/);
    expect(obtenirLieu(moi, lieu.id).commune.valeur).toEqual({ codePostal: CODE, ville: VILLE });
    expect(ecritures(d.id)).toHaveLength(0);
  });

  it("la base redit la règle : cinq chiffres, et pas de commune sans provenance ni de provenance sans commune", () => {
    const { lieu } = dossierEtLieu();
    const db = obtenirBase();
    expect(() => db.prepare(`UPDATE lieu SET code_postal = '0010A', commune_source = 'saisie', commune_confiance = 'connu' WHERE id = ?`).run(lieu.id)).toThrow(/CHECK/);
    expect(() => db.prepare(`UPDATE lieu SET code_postal = '0010', commune_source = 'saisie', commune_confiance = 'connu' WHERE id = ?`).run(lieu.id)).toThrow(/CHECK/);
    expect(() => db.prepare(`UPDATE lieu SET ville = ? WHERE id = ?`).run(VILLE, lieu.id)).toThrow(/CHECK/);
    expect(() => db.prepare(`UPDATE lieu SET commune_source = 'saisie', commune_confiance = 'connu' WHERE id = ?`).run(lieu.id)).toThrow(/CHECK/);
    db.prepare(`UPDATE lieu SET code_postal = '01000', commune_source = 'saisie', commune_confiance = 'connu' WHERE id = ?`).run(lieu.id);
    expect(obtenirLieu(moi, lieu.id).commune.valeur).toEqual({ codePostal: "01000", ville: null });
  });

  // --- Situer d'après l'adresse ----------------------------------------------------------------------

  it("situer d'après l'adresse : la voie et la ville partent en texte, le code postal en filtre, et rien d'autre", async () => {
    const { d, lieu } = dossierEtLieu({ adresse: VOIE, codePostal: CODE, ville: VILLE });
    const appels = fauxService({ recherche: () => [numero("3 Chemin du Lavoir", CODE, VILLE)] });

    const situe = await situerLieuDepuisAdresse(moi, { lieuId: lieu.id });
    expect(situe.position).toEqual({ valeur: { latitudeMicrodeg: 46_512_000, longitudeMicrodeg: 2_512_000 }, source: "source_externe", confiance: "a_confirmer", note: `3 Chemin du Lavoir ${CODE} ${VILLE}` });
    // Situer ne réécrit pas l'adresse saisie.
    expect(situe.adresse).toMatchObject({ valeur: VOIE, source: "saisie" });

    expect(appels).toHaveLength(1);
    expect(appels[0].host).toBe("data.geopf.fr");
    expect(appels[0].pathname).toBe("/geocodage/search");
    expect(Object.fromEntries(appels[0].searchParams)).toEqual({ q: `${VOIE} ${VILLE}`, postcode: CODE, limit: "1" });
    expect(appels[0].toString()).not.toContain(d.id);
    expect(appels[0].toString()).not.toContain(lieu.id);
    expect(decodeURIComponent(appels[0].toString())).not.toContain("candidat");
    expect(ecritures(d.id)[0].motif).toMatch(/Situé d'après l'adresse par la Base Adresse Nationale .*\(score 93 %\)/);
  });

  it("sans voie, la commune se situe par son code postal et sa ville", async () => {
    const { d, lieu } = dossierEtLieu({ codePostal: CODE, ville: VILLE });
    const appels = fauxService({ recherche: () => [commune(VILLE, CODE), commune("Ville-Fictive-sur-Rien", CODE)] });

    const situe = await situerLieuDepuisAdresse(moi, { lieuId: lieu.id });
    expect(situe.position).toEqual({ valeur: POINT, source: "source_externe", confiance: "a_confirmer", note: `${CODE} ${VILLE} (commune)` });
    expect(Object.fromEntries(appels[0].searchParams)).toEqual({ q: `${CODE} ${VILLE}`, type: "municipality", postcode: CODE, limit: "10" });
    expect(ecritures(d.id)[0].motif).toMatch(/Situé d'après le code postal et la ville par la Base Adresse Nationale/);
  });

  it("un code postal seul ne situe que s'il ne couvre qu'une commune : sinon aucune n'est choisie", async () => {
    const { d, lieu } = dossierEtLieu({ codePostal: CODE });
    const appels = fauxService({ recherche: () => [commune(VILLE, CODE), commune("Bourg-Fictif", CODE), commune("Voisine-Fictive", "00190")] });
    await expect(situerLieuDepuisAdresse(moi, { lieuId: lieu.id })).rejects.toThrow(/Le code postal 00100 couvre 2 communes : renseignez la ville/);
    expect(Object.fromEntries(appels[0].searchParams)).toEqual({ q: CODE, type: "municipality", limit: "50" });
    expect(obtenirLieu(moi, lieu.id).position.valeur).toBeNull();
    expect(ecritures(d.id)).toHaveLength(0);

    // Une commune voisine, d'un autre code postal, ne compte pas.
    fauxService({ recherche: () => [commune("Voisine-Fictive", "00190"), commune(VILLE, CODE)] });
    const situe = await situerLieuDepuisAdresse(moi, { lieuId: lieu.id });
    expect(situe.position.note).toBe(`${CODE} ${VILLE} (commune)`);

    fauxService({ recherche: () => [commune("Voisine-Fictive", "00190")] });
    await expect(situerLieuDepuisAdresse(moi, { lieuId: lieu.id })).rejects.toThrow(/Commune non reconnue/);
  });

  it("une ville que plusieurs communes portent n'est pas située d'office", async () => {
    const { d, lieu } = dossierEtLieu({ ville: VILLE });
    const appels = fauxService({ recherche: () => [commune(VILLE, CODE), commune(VILLE, "00900")] });
    await expect(situerLieuDepuisAdresse(moi, { lieuId: lieu.id })).rejects.toThrow(/Plusieurs communes s'appellent « Ville-Fictive » : renseignez le code postal/);
    expect(Object.fromEntries(appels[0].searchParams)).toEqual({ q: VILLE, type: "municipality", limit: "10" });
    expect(obtenirLieu(moi, lieu.id).position.valeur).toBeNull();
    expect(ecritures(d.id)).toHaveLength(0);
  });

  it("rien de renseigné, ou pas le droit d'écrire : rien ne part", async () => {
    const { d, lieu } = dossierEtLieu();
    const appels = fauxService({ recherche: () => [commune(VILLE, CODE)] });
    await expect(situerLieuDepuisAdresse(moi, { lieuId: lieu.id })).rejects.toThrow(/ni adresse, ni code postal, ni ville/);

    const { d: autre, lieu: renseigne } = dossierEtLieu({ codePostal: CODE, ville: VILLE });
    await expect(situerLieuDepuisAdresse(lecteurDe(autre.id), { lieuId: renseigne.id })).rejects.toThrow(/Accès refusé/);
    expect(appels).toHaveLength(0);
    expect(ecritures(d.id)).toHaveLength(0);
  });

  // --- Ce que le service rend : chaque partie dans son champ, seulement si c'est demandé ---------------

  it("l'adresse adoptée après un clic sur la carte remplit la voie, le code postal et la ville", async () => {
    const { d, lieu } = dossierEtLieu();
    const proche = numero("12 Rue des Tilleuls", CODE, VILLE, { distance: 35 });
    fauxService({ inverse: () => [proche] });

    const situe = await situerLieuParClic(moi, { lieuId: lieu.id, ...POINT, positionSource: "saisie", adresseVue: `12 Rue des Tilleuls ${CODE} ${VILLE}` });
    expect(situe.adresse).toMatchObject({ valeur: "12 Rue des Tilleuls", source: "source_externe", confiance: "a_confirmer" });
    expect(situe.commune).toMatchObject({ valeur: { codePostal: CODE, ville: VILLE }, source: "source_externe", confiance: "a_confirmer" });
    expect(champsEcrits(d.id).flat()).toEqual(expect.arrayContaining(["adresse", "code_postal", "ville", "commune_source"]));
  });

  it("sans la demander, l'adresse saisie reste entière après un clic sur la carte", async () => {
    const { lieu } = dossierEtLieu({ adresse: VOIE, codePostal: CODE, ville: VILLE });
    const appels = fauxService({ inverse: () => [numero("12 Rue des Tilleuls", "00900", "Autre-Bourg", { distance: 35 })] });

    const situe = await situerLieuParClic(moi, { lieuId: lieu.id, ...POINT, positionSource: "saisie" });
    expect(situe.adresse).toMatchObject({ valeur: VOIE, source: "saisie" });
    expect(situe.commune).toMatchObject({ valeur: { codePostal: CODE, ville: VILLE }, source: "saisie" });
    expect(appels).toHaveLength(0);
  });

  it("après un clic, une partie que le service ne donne pas n'est pas touchée", async () => {
    const { lieu } = dossierEtLieu({ adresse: VOIE });
    // Le point le plus proche connu du service est une commune : elle n'a pas de voie.
    fauxService({ inverse: () => [commune(VILLE, CODE)] });

    const situe = await situerLieuParClic(moi, { lieuId: lieu.id, ...POINT, positionSource: "saisie", adresseVue: VILLE });
    expect(situe.adresse).toMatchObject({ valeur: VOIE, source: "saisie", confiance: "connu" });
    expect(situe.commune).toMatchObject({ valeur: { codePostal: CODE, ville: VILLE }, source: "source_externe", confiance: "a_confirmer" });
  });

  it("un endroit choisi dans la liste : la position seule, sauf si son adresse est demandée ; rien ne part", () => {
    const { d, lieu } = dossierEtLieu();
    const appels = fauxService({});

    const sansAdresse = situerLieuSurEndroit(moi, { lieuId: lieu.id, ...POINT, note: `${CODE} ${VILLE} (commune)`, texteCherche: CODE });
    expect(sansAdresse.position).toEqual({ valeur: POINT, source: "source_externe", confiance: "a_confirmer", note: `${CODE} ${VILLE} (commune)` });
    expect(sansAdresse.commune).toEqual(A_RENSEIGNER);
    expect(ecritures(d.id)).toHaveLength(1);
    expect(ecritures(d.id)[0].motif).toBe("Choisi parmi les propositions de la Base Adresse Nationale (Géoplateforme IGN) pour « 00100 »");

    const avecAdresse = situerLieuSurEndroit(moi, { lieuId: lieu.id, ...POINT, note: `${CODE} ${VILLE} (commune)`, texteCherche: CODE, adresse: { voie: "", codePostal: CODE, ville: VILLE } });
    expect(avecAdresse.commune).toMatchObject({ valeur: { codePostal: CODE, ville: VILLE }, source: "source_externe", confiance: "a_confirmer" });
    // Une commune n'a pas de voie : celle du lieu n'est pas touchée.
    expect(avecAdresse.adresse).toEqual(A_RENSEIGNER);
    expect(ecritures(d.id).map((e) => e.motif)).toContain("Adresse de l'endroit choisi parmi les propositions de la Base Adresse Nationale (Géoplateforme IGN) pour « 00100 »");
    expect(appels).toHaveLength(0);
  });

  it("une commune choisie dans la liste complète une voie saisie sans la remplacer", () => {
    const { lieu } = dossierEtLieu({ adresse: VOIE });
    const situe = situerLieuSurEndroit(moi, { lieuId: lieu.id, ...POINT, note: `${CODE} ${VILLE} (commune)`, texteCherche: VILLE, adresse: { voie: "", codePostal: CODE, ville: VILLE } });
    expect(situe.adresse).toMatchObject({ valeur: VOIE, source: "saisie", confiance: "connu" });
    expect(situe.commune).toMatchObject({ valeur: { codePostal: CODE, ville: VILLE }, source: "source_externe" });
  });

  it("une adresse choisie dans la liste, et demandée, remplit les trois champs", () => {
    const { lieu } = dossierEtLieu({ adresse: VOIE, codePostal: "00900", ville: "Autre-Bourg" });
    const situe = situerLieuSurEndroit(moi, { lieuId: lieu.id, ...POINT, note: "12 Rue des Tilleuls 00100 Ville-Fictive", texteCherche: "12 rue des Tilleuls", adresse: { voie: "12 Rue des Tilleuls", codePostal: CODE, ville: VILLE } });
    expect(situe.adresse).toMatchObject({ valeur: "12 Rue des Tilleuls", source: "source_externe", confiance: "a_confirmer" });
    expect(situe.commune).toMatchObject({ valeur: { codePostal: CODE, ville: VILLE }, source: "source_externe", confiance: "a_confirmer" });
  });

  it("une adresse mal formée annule aussi la position : tout s'écrit ensemble, ou rien", () => {
    const { d, lieu } = dossierEtLieu();
    expect(() => situerLieuSurEndroit(moi, { lieuId: lieu.id, ...POINT, note: "essai", texteCherche: "essai", adresse: { voie: "", codePostal: "0010", ville: VILLE } })).toThrow(/cinq chiffres/);
    expect(obtenirLieu(moi, lieu.id).position.valeur).toBeNull();
    expect(ecritures(d.id)).toHaveLength(0);
  });

  it("un lecteur ne situe pas un lieu sur un endroit de la liste", () => {
    const { d, lieu } = dossierEtLieu();
    expect(() => situerLieuSurEndroit(lecteurDe(d.id), { lieuId: lieu.id, ...POINT, note: "essai", texteCherche: "essai", adresse: { voie: "", codePostal: CODE, ville: VILLE } })).toThrow(/Accès refusé/);
    expect(obtenirLieu(moi, lieu.id).position.valeur).toBeNull();
    expect(obtenirLieu(moi, lieu.id).commune).toEqual(A_RENSEIGNER);
  });

  // --- Ce qui sort, ce qui reste --------------------------------------------------------------------

  it("le code postal et la ville ne partent jamais vers l'assistant", () => {
    const { d } = dossierEtLieu({ adresse: VOIE, codePostal: CODE, ville: VILLE });
    configurerIA(moi, d.id, { activee: true, perimetre: ["identite", "lieux", "scenarios", "budget", "idees", "taches", "documents"], fournisseur: "regles_locales" });
    const texte = serialiserContexte(construireContexte(moi, obtenirDossier(moi, d.id)));
    expect(texte).toContain(NOM_LIEU);
    expect(texte).not.toContain(VILLE);
    expect(texte).not.toContain(CODE);
    expect(texte).not.toContain(VOIE);
  });

  it("l'export du dossier les contient, et le retrait d'un lieu les garde au journal", () => {
    const { d, lieu } = dossierEtLieu({ codePostal: CODE, ville: VILLE });
    expect(construireExport(moi, d.id).lieux).toMatchObject([{ codePostal: CODE, ville: VILLE, communeSource: "saisie", communeConfiance: "connu" }]);

    retirerLieu(moi, { lieuId: lieu.id });
    const suppression = journalAudit(moi, d.id).find((e) => e.nomEntite === "lieu" && e.action === "suppression");
    expect(suppression?.changements).toEqual(
      expect.arrayContaining([
        { champ: "code_postal", avant: CODE, apres: null },
        { champ: "ville", avant: VILLE, apres: null },
        { champ: "commune_source", avant: "saisie", apres: null },
        { champ: "commune_confiance", avant: "connu", apres: null },
      ]),
    );
  });
});
