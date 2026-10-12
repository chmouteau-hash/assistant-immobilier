"use client";

// Carte des lieux d'un dossier : un repère par lieu situé, sur le fond de carte de `domain/geo.ts`.
//
// Composant client parce que Leaflet dessine dans le navigateur (il a besoin de `window`) : la
// bibliothèque n'est chargée qu'ici, et seulement quand ce composant s'affiche — l'écran Lieux ne
// le monte que si au moins un lieu est situé, ou si l'utilisateur demande à en situer un sur la
// carte. Le repère est un simple rond en CSS : rien d'autre que les tuiles du fond de carte ne
// part chercher un fichier hors du PC.
//
// Deux sortes de repères (issue #50). Les lieux du dossier ouvert, foncés. Et, d'une autre couleur,
// les lieux situés des autres dossiers que l'acteur peut lire : la page les lui a déjà filtrés
// (`listerLieuxVoisins`), ce composant ne décide de rien. La carte s'ouvre sur le dossier et sur
// les biens du même secteur ; les plus lointains sont là aussi, et une phrase les compte. Un clic
// sur un repère mène à la fiche du lieu : dans la page pour un lieu du dossier, dans son dossier
// pour un autre.
//
// Deux gestes, pour qui peut écrire les lieux. Aucun n'enregistre tout seul : un formulaire montre
// la nouvelle position, pose les deux questions de provenance, et c'est une Server Action reçue
// en propriété qui écrit (les droits restent dans `lib`).
// - Déplacer un repère du dossier, au doigt ou à la souris. Ceux des autres dossiers ne bougent pas.
// - Choisir l'endroit d'un lieu en cliquant sur la carte (issue #48). Ce mode s'ouvre depuis la
//   fiche du lieu, pour un lieu à la fois : sans lui, un clic sur la carte ne pose rien. Le point
//   cliqué part alors vers le service d'adresses, qui renvoie l'adresse connue la plus proche.
//   L'écran la montre avec sa distance ; elle ne s'enregistre que si la case est cochée, et une
//   adresse déjà saisie n'est jamais remplacée d'office (décision du 2026-10-11). Sa voie, son code
//   postal et sa ville vont chacun dans leur champ (issue #52).

import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Map as CarteLeaflet, Marker } from "leaflet";
import { FormulaireAction } from "./FormulaireAction";
import { Champ, QuestionConfiance, QuestionSource, ancreFicheLieu, classeSaisie } from "./ui";
import {
  FOND_DE_CARTE,
  NOM_SERVICE_ADRESSES,
  RAYON_SECTEUR_KM,
  formaterCoordonnee,
  formaterDistance,
  formaterPosition,
  versDegres,
  versMicrodegres,
  type AdresseProche,
  type Position,
} from "@/domain/geo";
import { REPONSE_HABITUELLE } from "@/domain/provenance";
import type { Reference } from "@/lib/references";
import type { EtatAdresseProche, EtatFormulaire } from "@/app/dossiers/actions";

export type LieuSurCarte = { id: string; nom: string; position: Position | null };

/** Un lieu situé d'un autre dossier : montré d'une autre couleur, et lié à sa fiche. */
export type VoisinSurCarte = { id: string; nom: string; dossierNom: string; lien: string; position: Position };

/**
 * Le lieu que l'utilisateur a demandé à situer en cliquant sur la carte. `adresse` : son adresse
 * actuelle sur une ligne (voie, code postal, ville), ou null s'il n'en a aucune partie.
 */
export type LieuAPlacer = { id: string; nom: string; adresse: string | null };

type Repere = { id: string; nom: string; position: Position };
type Deplacement = Repere;
/** Un point cliqué en attente de confirmation, et ce que le service en dit. */
type Clic = { position: Position; recherche: boolean; adresse: AdresseProche | null; erreur: string | null };
type ActionFormulaire = (etat: EtatFormulaire, donnees: FormData) => Promise<EtatFormulaire>;

type Proprietes = {
  dossierId: string;
  lieux: LieuSurCarte[];
  /** Les lieux situés des autres dossiers que l'acteur peut lire. */
  voisins: VoisinSurCarte[];
  peutEcrire: boolean;
  /** Enregistre un repère déplacé. */
  action: ActionFormulaire;
  sources: Reference[];
  confiances: Reference[];
  /** Mode « choisir l'endroit » : le lieu à situer, ou null. */
  aPlacer: LieuAPlacer | null;
  /** Demande l'adresse connue la plus proche du point cliqué. N'écrit rien. */
  actionAdresseProche: (donnees: FormData) => Promise<EtatAdresseProche>;
  /** Enregistre le point cliqué, et l'adresse si elle est demandée. */
  actionSituerParClic: ActionFormulaire;
  /** L'écran Lieux sans le mode « choisir l'endroit » : pour Annuler, et après l'enregistrement. */
  chemin: string;
};

const ENTOURE = ["ring-2", "ring-neutral-900"];

/** Amène la fiche d'un lieu sous les yeux et l'entoure un instant, pour qu'on la repère dans la liste. */
function montrerFiche(lieuId: string) {
  const fiche = document.getElementById(ancreFicheLieu(lieuId));
  if (!fiche) return;
  fiche.scrollIntoView({ behavior: "smooth", block: "start" });
  fiche.classList.add(...ENTOURE);
  window.setTimeout(() => fiche.classList.remove(...ENTOURE), 2500);
}

// La dernière arrivée déjà signalée : la carte se recrée à chaque changement de repère, et ne doit
// pas ramener à la fiche à chaque fois.
let arriveeSignalee: string | null = null;

/**
 * Un repère s'atteint au clavier (Leaflet lui donne un rang de tabulation et le rôle de bouton),
 * mais Leaflet ne relie la touche Entrée qu'à ses bulles : sans ceci, un repère atteint au clavier
 * ne mènerait nulle part. Entrée et Espace font donc ce que fait le clic.
 *
 * L'élément du repère n'existe pas encore quand on le pose sur une carte sans vue : Leaflet ne le
 * crée qu'une fois la vue fixée, et le signale par l'événement `add`. On s'y branche à ce moment.
 */
function activerAuClavier(marqueur: Marker, geste: () => void) {
  const brancher = () =>
    marqueur.getElement()?.addEventListener("keydown", (evenement) => {
      if (evenement.key !== "Enter" && evenement.key !== " ") return;
      evenement.preventDefault();
      geste();
    });
  if (marqueur.getElement()) brancher();
  else marqueur.once("add", brancher);
}

/** « Nom du lieu · nom du dossier », sans répéter un nom identique. */
function etiquetteVoisin(voisin: { nom: string; dossierNom: string }): string {
  return voisin.dossierNom !== "" && voisin.dossierNom !== voisin.nom ? `${voisin.nom} · ${voisin.dossierNom}` : voisin.nom;
}

// La `key` recrée la carte quand un repère change (lieu situé, déplacé, renommé, retiré, ici ou
// dans un autre dossier) ou quand le mode « choisir l'endroit » s'ouvre ou se ferme : elle se
// redessine sur les positions enregistrées, et un geste en attente de confirmation s'efface. Tant
// que rien ne change, elle reste en place : on peut zoomer sans qu'un rendu la remette à zéro.
export function CarteLieux(props: Proprietes) {
  const reperes: Repere[] = props.lieux.flatMap((l) => (l.position ? [{ id: l.id, nom: l.nom, position: l.position }] : []));
  const donnees = JSON.stringify({ reperes, voisins: props.voisins, aPlacerId: props.peutEcrire ? (props.aPlacer?.id ?? null) : null });
  return <Carte key={donnees} {...props} donnees={donnees} />;
}

function Carte({ dossierId, voisins, peutEcrire, action, sources, confiances, donnees, aPlacer, actionAdresseProche, actionSituerParClic, chemin }: Proprietes & { donnees: string }) {
  const router = useRouter();
  const conteneur = useRef<HTMLDivElement | null>(null);
  const marqueurs = useRef<Map<string, Marker>>(new Map());
  const marqueurClic = useRef<Marker | null>(null);
  const numeroClic = useRef(0);
  const [fondIndisponible, setFondIndisponible] = useState(false);
  const [deplacement, setDeplacement] = useState<Deplacement | null>(null);
  const [clic, setClic] = useState<Clic | null>(null);
  const [voisinsLoin, setVoisinsLoin] = useState(0);
  const enPlacement = peutEcrire && aPlacer !== null;

  // Ce que font un clic sur la carte (mode « choisir l'endroit ») et un clic sur le repère d'un
  // autre dossier. Gardés dans une référence, mise à jour après chaque rendu : l'effet qui crée la
  // carte ne dépend ainsi que des repères, et ne la recrée pas à chaque rendu. Le numéro écarte la
  // réponse d'un clic que l'utilisateur a déjà remplacé.
  const gestes = useRef<{ choisir: (position: Position) => void; ouvrir: (lien: string) => void }>({ choisir: () => {}, ouvrir: () => {} });
  useEffect(() => {
    gestes.current = {
      ouvrir: (lien) => router.push(lien),
      choisir: (position) => {
        if (!aPlacer) return;
        const numero = ++numeroClic.current;
        setClic({ position, recherche: true, adresse: null, erreur: null });
        const demande = new FormData();
        demande.set("lieuId", aPlacer.id);
        demande.set("latitude", formaterCoordonnee(position.latitudeMicrodeg));
        demande.set("longitude", formaterCoordonnee(position.longitudeMicrodeg));
        actionAdresseProche(demande)
          .then((reponse) => {
            if (numero === numeroClic.current) setClic({ position, recherche: false, adresse: reponse.adresse, erreur: reponse.erreur });
          })
          .catch(() => {
            if (numero === numeroClic.current) setClic({ position, recherche: false, adresse: null, erreur: "Le service d'adresses ne répond pas." });
          });
      },
    };
  });

  // Arrivée depuis la carte d'un autre dossier : l'adresse de la page désigne une fiche.
  useEffect(() => {
    const arrivee = window.location.pathname + window.location.hash;
    const prefixe = `#${ancreFicheLieu("")}`;
    if (!window.location.hash.startsWith(prefixe) || arriveeSignalee === arrivee) return;
    arriveeSignalee = arrivee;
    montrerFiche(decodeURIComponent(window.location.hash.slice(prefixe.length)));
  }, []);

  useEffect(() => {
    const element = conteneur.current;
    if (!element) return;
    const lu = JSON.parse(donnees) as { reperes: Repere[]; voisins: VoisinSurCarte[]; aPlacerId: string | null };
    const placement = lu.aPlacerId !== null;
    const poses = marqueurs.current;
    let carte: CarteLeaflet | null = null;
    let annule = false;

    (async () => {
      const L = await import("leaflet");
      if (annule) return;
      carte = L.map(element, { scrollWheelZoom: placement, doubleClickZoom: !placement });
      if (placement) {
        // Le curseur en croix dit que le clic pose un point. En style direct : la feuille de
        // Leaflet, hors couche, l'emporterait sur une classe utilitaire.
        element.style.cursor = "crosshair";
        const anneau = L.divIcon({
          className: "",
          html: '<span class="block h-[22px] w-[22px] rounded-full border-4 border-neutral-900 bg-white/70 shadow-md"></span>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        carte.on("click", (evenement) => {
          const { lat, lng } = evenement.latlng.wrap();
          if (marqueurClic.current) marqueurClic.current.setLatLng([lat, lng]);
          else if (carte) marqueurClic.current = L.marker([lat, lng], { icon: anneau, interactive: false, keyboard: false }).addTo(carte);
          gestes.current.choisir({ latitudeMicrodeg: versMicrodegres(lat), longitudeMicrodeg: versMicrodegres(lng) });
        });
      } else {
        // La molette fait défiler la page tant qu'on n'a pas cliqué dans la carte : sinon on reste
        // coincé dessus en parcourant l'écran.
        carte.on("click", () => carte?.scrollWheelZoom.enable());
        carte.on("mouseout", () => carte?.scrollWheelZoom.disable());
      }
      L.tileLayer(FOND_DE_CARTE.url, { attribution: FOND_DE_CARTE.attribution, maxZoom: FOND_DE_CARTE.zoomMax })
        .on("tileerror", () => setFondIndisponible(true))
        .addTo(carte);

      const rond = (taille: number, couleur: string) =>
        L.divIcon({
          className: "",
          html: `<span class="block rounded-full border-2 border-white shadow-md ${couleur}" style="width:${taille}px;height:${taille}px"></span>`,
          iconSize: [taille, taille],
          iconAnchor: [taille / 2, taille / 2],
        });
      const icone = rond(18, "bg-neutral-900");
      const iconeVoisin = rond(15, "bg-sky-600");

      // Les biens des autres dossiers, posés d'abord : ceux du dossier passent au-dessus.
      const pointsVoisins: Array<[number, number]> = [];
      for (const voisin of lu.voisins) {
        const point: [number, number] = [versDegres(voisin.position.latitudeMicrodeg), versDegres(voisin.position.longitudeMicrodeg)];
        pointsVoisins.push(point);
        const etiquette = etiquetteVoisin(voisin);
        const marqueur = L.marker(point, { icon: iconeVoisin, interactive: !placement, keyboard: !placement, title: `${etiquette} : ouvrir sa fiche` }).addTo(carte);
        marqueur.bindTooltip(etiquette, { permanent: true, direction: "top", offset: [0, -9], opacity: 0.85 });
        if (!placement) {
          const ouvrir = () => gestes.current.ouvrir(voisin.lien);
          marqueur.on("click", ouvrir);
          activerAuClavier(marqueur, ouvrir);
        }
      }

      const points: Array<[number, number]> = [];
      let pointAPlacer: [number, number] | null = null;
      for (const repere of lu.reperes) {
        const point: [number, number] = [versDegres(repere.position.latitudeMicrodeg), versDegres(repere.position.longitudeMicrodeg)];
        points.push(point);
        if (repere.id === lu.aPlacerId) pointAPlacer = point;
        // En mode « choisir l'endroit », un seul geste à la fois : les repères ne se déplacent pas
        // et laissent passer le clic, pour qu'on puisse choisir un point tout près d'eux.
        const deplacable = peutEcrire && !placement;
        const marqueur = L.marker(point, { icon: icone, draggable: deplacable, interactive: !placement, keyboard: !placement, title: repere.nom, zIndexOffset: 1000 }).addTo(carte);
        marqueur.bindTooltip(repere.nom, { permanent: true, direction: "top", offset: [0, -10] });
        // Un clic sans déplacement amène à la fiche du lieu, plus bas dans la page.
        if (!placement) {
          const montrer = () => montrerFiche(repere.id);
          marqueur.on("click", montrer);
          activerAuClavier(marqueur, montrer);
        }
        if (deplacable) {
          marqueur.on("dragend", () => {
            const { lat, lng } = marqueur.getLatLng();
            setDeplacement({ id: repere.id, nom: repere.nom, position: { latitudeMicrodeg: versMicrodegres(lat), longitudeMicrodeg: versMicrodegres(lng) } });
          });
        }
        poses.set(repere.id, marqueur);
      }

      // Le cadre : le dossier et son secteur. Un bien d'un autre dossier n'élargit le cadre que
      // s'il est à portée d'un lieu du dossier ; sinon un bien lointain ferait dézoomer d'office
      // jusqu'à perdre le quartier de vue.
      const rayon = RAYON_SECTEUR_KM * 1000;
      const proches = points.length === 0 ? pointsVoisins : pointsVoisins.filter((voisin) => points.some((point) => L.latLng(point).distanceTo(voisin) <= rayon));
      setVoisinsLoin(pointsVoisins.length - proches.length);
      const cadre = [...points, ...proches];
      if (pointAPlacer) carte.setView(pointAPlacer, 16);
      else if (cadre.length === 1) carte.setView(cadre[0], points.length === 1 && !placement ? 15 : 13);
      else if (cadre.length > 1) carte.fitBounds(L.latLngBounds(cadre).pad(0.2), { maxZoom: 16 });
      else carte.setView([46.6, 2.4], 6);
    })();

    return () => {
      annule = true;
      carte?.remove();
      poses.clear();
      marqueurClic.current = null;
      element.style.cursor = "";
    };
  }, [donnees, peutEcrire]);

  // Annuler remet le repère là où il est enregistré.
  const annuler = () => {
    if (!deplacement) return;
    const enregistre = (JSON.parse(donnees) as { reperes: Repere[] }).reperes.find((r) => r.id === deplacement.id);
    if (enregistre) marqueurs.current.get(deplacement.id)?.setLatLng([versDegres(enregistre.position.latitudeMicrodeg), versDegres(enregistre.position.longitudeMicrodeg)]);
    setDeplacement(null);
  };

  // Annuler un point cliqué : l'anneau disparaît, et une réponse encore en route est ignorée.
  const annulerClic = () => {
    numeroClic.current++;
    marqueurClic.current?.remove();
    marqueurClic.current = null;
    setClic(null);
  };

  return (
    <div className="flex flex-col gap-2">
      {enPlacement && aPlacer && (
        <p role="status" className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-neutral-800">
          Cliquez sur la carte à l&apos;endroit de « {aPlacer.nom} ». Le point cliqué est envoyé à la {NOM_SERVICE_ADRESSES}, qui renvoie l&apos;adresse connue la plus proche. Rien n&apos;est enregistré avant votre
          confirmation.{" "}
          <Link href={chemin} scroll={false} className="font-medium underline">
            Annuler
          </Link>
        </p>
      )}
      {/* `relative z-0` : les calques de Leaflet ont leur propre z-index ; sans cette borne, ils
          passeraient par-dessus la barre d'onglets collée en haut. */}
      <div ref={conteneur} role="region" aria-label="Carte des lieux" className={`relative z-0 w-full rounded border border-neutral-200 bg-neutral-100 ${enPlacement ? "h-[28rem]" : "h-80"}`} />
      {fondIndisponible && <p className="text-xs text-amber-800">Le fond de carte ne se charge pas (pas de réseau ?). Les repères restent affichés.</p>}
      <p className="text-xs text-neutral-500">
        Fond de carte : {FOND_DE_CARTE.nom}, chargé depuis {FOND_DE_CARTE.hote} quand cet écran s&apos;affiche.
        {!enPlacement && " Un clic sur un repère mène à sa fiche."}
        {peutEcrire && !enPlacement && " Un repère de ce dossier se déplace à la souris ou au doigt ; la nouvelle position se confirme ensuite."}
      </p>
      {voisins.length > 0 && (
        <div className="flex flex-col gap-1 text-xs text-neutral-600">
          <p>
            <span aria-hidden className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-neutral-900 align-middle" />
            ce dossier ;{" "}
            <span aria-hidden className="mr-1 ml-1 inline-block h-2.5 w-2.5 rounded-full bg-sky-600 align-middle" />
            vos autres dossiers : {voisins.length === 1 ? "1 bien" : `${voisins.length} biens`}
            {voisinsLoin > 0 && `, dont ${voisinsLoin} à plus de ${RAYON_SECTEUR_KM} km (dézoomez pour ${voisinsLoin === 1 ? "le" : "les"} voir)`}.
          </p>
          <details>
            <summary className="cursor-pointer text-neutral-500">Liste des biens de vos autres dossiers</summary>
            <ul className="mt-1 flex flex-col gap-1">
              {voisins.map((voisin) => (
                <li key={voisin.id}>
                  <Link href={voisin.lien} className="font-medium text-neutral-900 underline">
                    {voisin.nom}
                  </Link>{" "}
                  · dossier « {voisin.dossierNom} »
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
      {deplacement && (
        <FormulaireAction action={action} bouton="Enregistrer la position" compact className="rounded border border-neutral-200 bg-neutral-50 p-2">
          <input type="hidden" name="dossierId" value={dossierId} />
          <input type="hidden" name="lieuId" value={deplacement.id} />
          <input type="hidden" name="latitude" value={formaterCoordonnee(deplacement.position.latitudeMicrodeg)} />
          <input type="hidden" name="longitude" value={formaterCoordonnee(deplacement.position.longitudeMicrodeg)} />
          <p className="w-full text-xs text-neutral-600">
            Nouvelle position de « {deplacement.nom} » : {formaterPosition(deplacement.position)}
          </p>
          <QuestionSource name="positionSource" sources={sources} defaultValue="saisie" />
          <QuestionConfiance name="positionConfiance" confiances={confiances} vide={REPONSE_HABITUELLE} />
          <Champ label="Motif">
            <input name="motif" className={classeSaisie} />
          </Champ>
          <button type="button" onClick={annuler} className="min-h-10 text-xs text-neutral-500 underline">
            Annuler
          </button>
        </FormulaireAction>
      )}
      {enPlacement && aPlacer && clic && (
        <FormulaireAction
          action={actionSituerParClic}
          bouton="Enregistrer"
          compact
          className="rounded border border-neutral-200 bg-neutral-50 p-2"
          apresSucces={() => router.replace(chemin, { scroll: false })}
        >
          <input type="hidden" name="dossierId" value={dossierId} />
          <input type="hidden" name="lieuId" value={aPlacer.id} />
          <input type="hidden" name="latitude" value={formaterCoordonnee(clic.position.latitudeMicrodeg)} />
          <input type="hidden" name="longitude" value={formaterCoordonnee(clic.position.longitudeMicrodeg)} />
          <p className="w-full text-xs text-neutral-600">
            Position choisie pour « {aPlacer.nom} » : {formaterPosition(clic.position)}
          </p>
          {clic.recherche && <p className="w-full text-xs text-neutral-600">Recherche de l&apos;adresse connue la plus proche…</p>}
          {!clic.recherche && clic.adresse && (
            <div className="flex w-full flex-col gap-1 text-xs text-neutral-700">
              <p>
                Adresse connue la plus proche, d&apos;après la {NOM_SERVICE_ADRESSES} : <strong>{clic.adresse.libelle}</strong>
                {clic.adresse.distanceMetres !== null && `, à ${formaterDistance(clic.adresse.distanceMetres)}`}. Ce n&apos;est pas forcément celle du bien.
              </p>
              <label className="flex min-h-10 items-center gap-2">
                {/* La `key` recrée la case quand l'adresse proposée change : elle reprend alors son
                    état de départ, cochée seulement si le lieu n'a pas encore d'adresse. */}
                <input key={clic.adresse.libelle} type="checkbox" name="adopterAdresse" defaultChecked={aPlacer.adresse === null} />
                <span>
                  {aPlacer.adresse === null
                    ? "Enregistrer aussi cette adresse, notée « source externe · à confirmer »"
                    : `Remplacer l'adresse actuelle (« ${aPlacer.adresse} ») par celle-ci, notée « source externe · à confirmer »`}
                </span>
              </label>
              <input type="hidden" name="adresseVue" value={clic.adresse.libelle} />
            </div>
          )}
          {!clic.recherche && !clic.adresse && !clic.erreur && <p className="w-full text-xs text-neutral-600">Aucune adresse connue à proximité : seule la position sera enregistrée.</p>}
          {!clic.recherche && clic.erreur && <p className="w-full text-xs text-amber-800">{clic.erreur} La position peut s&apos;enregistrer sans l&apos;adresse.</p>}
          <QuestionSource name="positionSource" sources={sources} defaultValue="saisie" />
          <QuestionConfiance name="positionConfiance" confiances={confiances} vide={REPONSE_HABITUELLE} />
          <Champ label="Motif">
            <input name="motif" className={classeSaisie} />
          </Champ>
          <button type="button" onClick={annulerClic} className="min-h-10 text-xs text-neutral-500 underline">
            Annuler ce point
          </button>
        </FormulaireAction>
      )}
    </div>
  );
}
