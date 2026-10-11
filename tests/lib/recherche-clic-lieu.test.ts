// Chercher un endroit par un code postal, et situer un lieu en cliquant sur la carte (issue #48).
// Base en mémoire, données fictives ; le réseau est remplacé par un faux service : aucun appel réel.
//
// Ce que ces tests gardent : rien ne part sans le droit d'écrire les lieux ; une recherche n'écrit
// rien ; l'adresse trouvée par le service n'entre que si elle a été vue et demandée ; une adresse
// déjà saisie n'est jamais remplacée d'office.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reinitialiserBasePourTests } from "@/lib/db/client";
import { creerDossier, journalAudit } from "@/lib/dossiers";
import { creerLieu, obtenirLieu } from "@/lib/structure";
import { adresseLaPlusProche, chercherEndroits, situerLieuParClic, urlGeocodageInverse } from "@/lib/geocodage";
import { inviterPersonne } from "@/lib/personnes";
import type { Acteur } from "@/lib/acces";

const moi: Acteur = { personneId: "utilisateur-local", nom: "Utilisateur local" };
const POINT = { latitudeMicrodeg: 46_500_000, longitudeMicrodeg: 2_500_000 };
const ADRESSE_PROCHE = "12 Rue des Tilleuls 00100 Ville-Fictive";
const ADRESSE_SAISIE = "3 chemin du Lavoir (fictive)";

const commune = (label: string, postcode: string, id: string) => ({ geometry: { coordinates: [2.5, 46.5] }, properties: { type: "municipality", label, postcode, id } });
const rue = (label: string, postcode: string, id: string) => ({ geometry: { coordinates: [2.51, 46.51] }, properties: { type: "street", label, postcode, id } });
const adresseProche = (label: string, distance: number) => ({ geometry: { coordinates: [2.5, 46.5] }, properties: { type: "housenumber", label, distance } });

/** Remplace le réseau : répond selon le chemin demandé, et garde la liste des appels. */
function fauxService(reponses: { recherche?: (url: URL) => unknown[]; inverse?: (url: URL) => unknown[] | "panne" }): URL[] {
  const appels: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (entree: string | URL) => {
      const url = new URL(String(entree));
      appels.push(url);
      const features = url.pathname.endsWith("/reverse") ? (reponses.inverse?.(url) ?? []) : (reponses.recherche?.(url) ?? []);
      if (features === "panne") return new Response("indisponible", { status: 503 });
      return new Response(JSON.stringify({ type: "FeatureCollection", features }), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
  return appels;
}

describe("chercher un endroit, situer un lieu en cliquant", () => {
  beforeEach(() => reinitialiserBasePourTests());
  afterEach(() => vi.unstubAllGlobals());

  function dossierEtLieu(adresse?: string) {
    const d = creerDossier(moi, { nom: "Dossier d'essai (fictif)" });
    const lieu = creerLieu(moi, { dossierId: d.id, nom: "Bien candidat (fictif)", typeLieu: "bien_candidat", ...(adresse ? { adresse, adresseSource: "saisie" } : {}) });
    return { d, lieu };
  }
  const lecteurDe = (dossierId: string): Acteur => {
    const invite = inviterPersonne(moi, { dossierId, nom: "Ami (fictif)", role: "lecteur" });
    return { personneId: invite.personneId, nom: "Ami (fictif)" };
  };
  const ecritures = (dossierId: string) => journalAudit(moi, dossierId).filter((e) => e.nomEntite === "lieu" && e.action === "modification");

  it("un code postal seul demande toutes ses communes, rangées par nom, et n'écrit rien", async () => {
    const { d, lieu } = dossierEtLieu();
    const appels = fauxService({
      recherche: () => [commune("Ville-Fictive", "00100", "3"), commune("Bourg-Fictif", "00100", "1"), commune("Voisine-Fictive", "00190", "9")],
    });

    const endroits = await chercherEndroits(moi, { dossierId: d.id, texte: " 00100 " });
    expect(endroits.map((e) => e.libelle)).toEqual(["00100 Bourg-Fictif", "00100 Ville-Fictive"]);

    expect(appels).toHaveLength(1);
    expect(appels[0].host).toBe("data.geopf.fr");
    expect(appels[0].pathname).toBe("/geocodage/search");
    expect(Object.fromEntries(appels[0].searchParams)).toEqual({ q: "00100", type: "municipality", limit: "50" });
    expect(appels[0].toString()).not.toContain(d.id);
    expect(appels[0].toString()).not.toContain("fictif");
    expect(obtenirLieu(moi, lieu.id).position.valeur).toBeNull();
    expect(ecritures(d.id)).toHaveLength(0);
  });

  it("un nom sans chiffre est cherché aussi parmi les communes, qui passent devant les rues du même nom", async () => {
    const { d } = dossierEtLieu();
    const appels = fauxService({
      recherche: (url) =>
        url.searchParams.get("type") === "municipality"
          ? [commune("Ville-Fictive", "00100", "3")]
          : [rue("Ville-Fictive 00900 Autre-Bourg", "00900", "8"), commune("Ville-Fictive", "00100", "3")],
    });

    const endroits = await chercherEndroits(moi, { dossierId: d.id, texte: "Ville-Fictive" });
    expect(endroits.map((e) => `${e.nature} ${e.libelle}`)).toEqual(["commune 00100 Ville-Fictive", "rue Ville-Fictive 00900 Autre-Bourg"]);
    expect(appels.map((u) => u.searchParams.get("type")).sort()).toEqual([null, "municipality"].sort());
    expect(appels.every((u) => u.searchParams.get("q") === "Ville-Fictive")).toBe(true);
  });

  it("une adresse avec un numéro part en une seule demande, dans l'ordre du service", async () => {
    const { d } = dossierEtLieu();
    const appels = fauxService({ recherche: () => [rue("Rue des Tilleuls 00100 Ville-Fictive", "00100", "42")] });
    const endroits = await chercherEndroits(moi, { dossierId: d.id, texte: "12 rue des Tilleuls" });
    expect(endroits).toHaveLength(1);
    expect(appels).toHaveLength(1);
    expect(appels[0].searchParams.has("type")).toBe(false);
  });

  it("rien ne part pour un texte trop court, mal commencé, ou sans le droit d'écrire les lieux", async () => {
    const { d } = dossierEtLieu();
    const appels = fauxService({ recherche: () => [commune("Ville-Fictive", "00100", "3")] });
    await expect(chercherEndroits(moi, { dossierId: d.id, texte: "ab" })).rejects.toThrow(/trois caractères/);
    await expect(chercherEndroits(moi, { dossierId: d.id, texte: "   " })).rejects.toThrow(/trois caractères/);
    await expect(chercherEndroits(moi, { dossierId: d.id, texte: "?? ville" })).rejects.toThrow(/lettre ou un chiffre/);
    await expect(chercherEndroits(lecteurDe(d.id), { dossierId: d.id, texte: "00100" })).rejects.toThrow(/Accès refusé/);
    await expect(chercherEndroits(moi, { dossierId: "inconnu", texte: "00100" })).rejects.toThrow(/Accès refusé/);
    expect(appels).toHaveLength(0);
  });

  it("un service qui ne répond pas le dit, sans liste inventée", async () => {
    const { d } = dossierEtLieu();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("réseau coupé"))));
    await expect(chercherEndroits(moi, { dossierId: d.id, texte: "00100" })).rejects.toMatchObject({ code: "SERVICE_INDISPONIBLE" });
  });

  it("l'adresse la plus proche d'un point : seul le point part, et rien n'est écrit", async () => {
    const { d, lieu } = dossierEtLieu();
    const appels = fauxService({ inverse: () => [adresseProche(ADRESSE_PROCHE, 34.6)] });

    expect(await adresseLaPlusProche(moi, { lieuId: lieu.id, ...POINT })).toEqual({ libelle: ADRESSE_PROCHE, distanceMetres: 35 });
    expect(appels).toHaveLength(1);
    expect(appels[0].pathname).toBe("/geocodage/reverse");
    expect(Object.fromEntries(appels[0].searchParams)).toEqual({ lon: "2.5", lat: "46.5", limit: "1" });
    expect(appels[0].toString()).not.toContain(d.id);
    expect(appels[0].toString()).not.toContain(lieu.id);
    expect(obtenirLieu(moi, lieu.id).adresse.valeur).toBeNull();
    expect(ecritures(d.id)).toHaveLength(0);

    fauxService({ inverse: () => [] });
    expect(await adresseLaPlusProche(moi, { lieuId: lieu.id, ...POINT })).toBeNull();
  });

  it("un lecteur ne fait partir aucun point, et un point hors bornes non plus", async () => {
    const { d, lieu } = dossierEtLieu();
    const appels = fauxService({ inverse: () => [adresseProche(ADRESSE_PROCHE, 10)] });
    await expect(adresseLaPlusProche(lecteurDe(d.id), { lieuId: lieu.id, ...POINT })).rejects.toThrow(/Accès refusé/);
    await expect(adresseLaPlusProche(moi, { lieuId: "inconnu", ...POINT })).rejects.toThrow(/Accès refusé/);
    await expect(adresseLaPlusProche(moi, { lieuId: lieu.id, latitudeMicrodeg: 91_000_000, longitudeMicrodeg: 0 })).rejects.toThrow(/latitude/);
    await expect(situerLieuParClic(lecteurDe(d.id), { lieuId: lieu.id, ...POINT, positionSource: "saisie", adresseVue: ADRESSE_PROCHE })).rejects.toThrow(/Accès refusé/);
    expect(appels).toHaveLength(0);
  });

  it("le point choisi s'enregistre seul si l'adresse n'est pas demandée : rien ne part", async () => {
    const { d, lieu } = dossierEtLieu();
    const appels = fauxService({ inverse: () => [adresseProche(ADRESSE_PROCHE, 35)] });

    const situe = await situerLieuParClic(moi, { lieuId: lieu.id, ...POINT, positionSource: "saisie", motif: "point choisi sur la carte (essai)" });
    expect(situe.position).toEqual({ valeur: POINT, source: "saisie", confiance: "connu", note: null });
    expect(situe.adresse).toEqual({ valeur: null, source: null, confiance: "a_renseigner" });
    expect(appels).toHaveLength(0);
    expect(ecritures(d.id)).toHaveLength(1);
    expect(ecritures(d.id)[0].motif).toBe("point choisi sur la carte (essai)");
  });

  it("l'adresse vue et demandée s'enregistre avec le point, « source externe · à confirmer », et c'est tracé", async () => {
    const { d, lieu } = dossierEtLieu();
    const appels = fauxService({ inverse: () => [adresseProche(ADRESSE_PROCHE, 35)] });

    const situe = await situerLieuParClic(moi, { lieuId: lieu.id, ...POINT, positionSource: "saisie", positionConfiance: "a_confirmer", adresseVue: ADRESSE_PROCHE });
    expect(situe.position).toMatchObject({ valeur: POINT, source: "saisie", confiance: "a_confirmer" });
    expect(situe.adresse).toEqual({ valeur: ADRESSE_PROCHE, source: "source_externe", confiance: "a_confirmer" });
    expect(appels).toHaveLength(1);
    expect(appels[0].pathname).toBe("/geocodage/reverse");

    const traces = ecritures(d.id);
    expect(traces).toHaveLength(2);
    const adresse = traces.find((e) => e.changements?.some((c) => c.champ === "adresse"));
    expect(adresse?.motif).toMatch(/Adresse connue la plus proche du point choisi sur la carte, à 35 m, d'après la Base Adresse Nationale/);
    expect(adresse?.changements).toEqual(
      expect.arrayContaining([
        { champ: "adresse", avant: null, apres: ADRESSE_PROCHE },
        { champ: "adresse_source", avant: null, apres: "source_externe" },
        { champ: "adresse_confiance", avant: "a_renseigner", apres: "a_confirmer" },
      ]),
    );
  });

  it("une adresse déjà saisie n'est jamais remplacée d'office : seulement si elle est demandée", async () => {
    const { d, lieu } = dossierEtLieu(ADRESSE_SAISIE);
    fauxService({ inverse: () => [adresseProche(ADRESSE_PROCHE, 120)] });

    const sansDemande = await situerLieuParClic(moi, { lieuId: lieu.id, ...POINT, positionSource: "saisie" });
    expect(sansDemande.adresse).toEqual({ valeur: ADRESSE_SAISIE, source: "saisie", confiance: "connu" });

    const avecDemande = await situerLieuParClic(moi, { lieuId: lieu.id, ...POINT, positionSource: "saisie", adresseVue: ADRESSE_PROCHE });
    expect(avecDemande.adresse).toEqual({ valeur: ADRESSE_PROCHE, source: "source_externe", confiance: "a_confirmer" });
    // L'ancienne adresse reste lisible au journal.
    expect(ecritures(d.id).flatMap((e) => e.changements ?? [])).toEqual(expect.arrayContaining([{ champ: "adresse", avant: ADRESSE_SAISIE, apres: ADRESSE_PROCHE }]));
  });

  it("si le service ne renvoie plus l'adresse affichée, ou ne répond plus, rien n'est écrit", async () => {
    const { d, lieu } = dossierEtLieu();

    fauxService({ inverse: () => [adresseProche("14 Rue des Tilleuls 00100 Ville-Fictive", 20)] });
    await expect(situerLieuParClic(moi, { lieuId: lieu.id, ...POINT, positionSource: "saisie", adresseVue: ADRESSE_PROCHE })).rejects.toThrow(/n'est plus celle qui était affichée/);

    fauxService({ inverse: () => [] });
    await expect(situerLieuParClic(moi, { lieuId: lieu.id, ...POINT, positionSource: "saisie", adresseVue: ADRESSE_PROCHE })).rejects.toThrow(/n'est plus celle qui était affichée/);

    fauxService({ inverse: () => "panne" });
    await expect(situerLieuParClic(moi, { lieuId: lieu.id, ...POINT, positionSource: "saisie", adresseVue: ADRESSE_PROCHE })).rejects.toMatchObject({ code: "SERVICE_INDISPONIBLE" });

    const apres = obtenirLieu(moi, lieu.id);
    expect(apres.position.valeur).toBeNull();
    expect(apres.adresse.valeur).toBeNull();
    expect(ecritures(d.id)).toHaveLength(0);
  });

  it("une provenance refusée annule tout : ni le point, ni l'adresse", async () => {
    const { d, lieu } = dossierEtLieu();
    fauxService({ inverse: () => [adresseProche(ADRESSE_PROCHE, 35)] });
    // Aucune réponse à « D'où vient cette information ? » : la position est refusée après la
    // demande au service, dans la transaction qui aurait aussi écrit l'adresse.
    await expect(situerLieuParClic(moi, { lieuId: lieu.id, ...POINT, adresseVue: ADRESSE_PROCHE })).rejects.toThrow(/d'où vient/);
    await expect(situerLieuParClic(moi, { lieuId: lieu.id, ...POINT, positionSource: "estimation", positionConfiance: "connu", adresseVue: ADRESSE_PROCHE })).rejects.toThrow(/estimation/);
    const apres = obtenirLieu(moi, lieu.id);
    expect(apres.position.valeur).toBeNull();
    expect(apres.adresse.valeur).toBeNull();
    expect(ecritures(d.id)).toHaveLength(0);
  });

  it("l'adresse de la recherche inverse se déduit de celle de la recherche", () => {
    expect(urlGeocodageInverse()).toBe("https://data.geopf.fr/geocodage/reverse");
    vi.stubEnv("ASSISTANT_GEOCODAGE_URL", "https://exemple.invalid/adresses/search/");
    expect(urlGeocodageInverse()).toBe("https://exemple.invalid/adresses/reverse");
    vi.unstubAllEnvs();
  });
});
