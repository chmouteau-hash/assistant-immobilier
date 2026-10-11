"use client";

// Carte des lieux d'un dossier : un repère par lieu situé, sur le fond de carte de `domain/geo.ts`.
//
// Composant client parce que Leaflet dessine dans le navigateur (il a besoin de `window`) : la
// bibliothèque n'est chargée qu'ici, et seulement quand ce composant s'affiche — l'écran Lieux ne
// le monte que si au moins un lieu est situé. Le repère est un simple rond en CSS : rien d'autre
// que les tuiles du fond de carte ne part chercher un fichier hors du PC.
//
// Qui peut écrire les lieux peut déplacer un repère au doigt ou à la souris ; la nouvelle position
// ne s'enregistre pas toute seule : un formulaire la montre, pose les deux questions de provenance,
// et c'est la Server Action reçue en propriété qui écrit (les droits restent dans `lib`).

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Map as CarteLeaflet, Marker } from "leaflet";
import { FormulaireAction } from "./FormulaireAction";
import { Champ, QuestionConfiance, QuestionSource, classeSaisie } from "./ui";
import { FOND_DE_CARTE, formaterCoordonnee, formaterPosition, versDegres, versMicrodegres, type Position } from "@/domain/geo";
import { REPONSE_HABITUELLE } from "@/domain/provenance";
import type { Reference } from "@/lib/references";
import type { EtatFormulaire } from "@/app/dossiers/actions";

export type LieuSurCarte = { id: string; nom: string; position: Position | null };

type Repere = { id: string; nom: string; position: Position };
type Deplacement = Repere;

type Proprietes = {
  dossierId: string;
  lieux: LieuSurCarte[];
  peutEcrire: boolean;
  action: (etat: EtatFormulaire, donnees: FormData) => Promise<EtatFormulaire>;
  sources: Reference[];
  confiances: Reference[];
};

// La `key` recrée la carte quand un repère change (lieu situé, déplacé, renommé, retiré) : elle se
// redessine sur les positions enregistrées, et un déplacement en attente de confirmation s'efface.
// Tant que rien ne change, elle reste en place : on peut zoomer sans qu'un rendu la remette à zéro.
export function CarteLieux(props: Proprietes) {
  const reperes: Repere[] = props.lieux.flatMap((l) => (l.position ? [{ id: l.id, nom: l.nom, position: l.position }] : []));
  const donnees = JSON.stringify(reperes);
  return <Carte key={donnees} {...props} donnees={donnees} />;
}

function Carte({ dossierId, peutEcrire, action, sources, confiances, donnees }: Proprietes & { donnees: string }) {
  const conteneur = useRef<HTMLDivElement | null>(null);
  const marqueurs = useRef<Map<string, Marker>>(new Map());
  const [fondIndisponible, setFondIndisponible] = useState(false);
  const [deplacement, setDeplacement] = useState<Deplacement | null>(null);

  useEffect(() => {
    const element = conteneur.current;
    if (!element) return;
    const reperes = JSON.parse(donnees) as Repere[];
    const poses = marqueurs.current;
    let carte: CarteLeaflet | null = null;
    let annule = false;

    (async () => {
      const L = await import("leaflet");
      if (annule) return;
      carte = L.map(element, { scrollWheelZoom: false });
      // La molette fait défiler la page tant qu'on n'a pas cliqué dans la carte : sinon on reste
      // coincé dessus en parcourant l'écran.
      carte.on("click", () => carte?.scrollWheelZoom.enable());
      carte.on("mouseout", () => carte?.scrollWheelZoom.disable());
      L.tileLayer(FOND_DE_CARTE.url, { attribution: FOND_DE_CARTE.attribution, maxZoom: FOND_DE_CARTE.zoomMax })
        .on("tileerror", () => setFondIndisponible(true))
        .addTo(carte);

      const icone = L.divIcon({
        className: "",
        html: '<span class="block h-[18px] w-[18px] rounded-full border-2 border-white bg-neutral-900 shadow-md"></span>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      const points: Array<[number, number]> = [];
      for (const repere of reperes) {
        const point: [number, number] = [versDegres(repere.position.latitudeMicrodeg), versDegres(repere.position.longitudeMicrodeg)];
        points.push(point);
        const marqueur = L.marker(point, { icon: icone, draggable: peutEcrire, title: repere.nom, keyboard: false }).addTo(carte);
        marqueur.bindTooltip(repere.nom, { permanent: true, direction: "top", offset: [0, -10] });
        if (peutEcrire) {
          marqueur.on("dragend", () => {
            const { lat, lng } = marqueur.getLatLng();
            setDeplacement({ id: repere.id, nom: repere.nom, position: { latitudeMicrodeg: versMicrodegres(lat), longitudeMicrodeg: versMicrodegres(lng) } });
          });
        }
        poses.set(repere.id, marqueur);
      }
      if (points.length === 1) carte.setView(points[0], 15);
      else if (points.length > 1) carte.fitBounds(L.latLngBounds(points).pad(0.2), { maxZoom: 16 });
      else carte.setView([46.6, 2.4], 5);
    })();

    return () => {
      annule = true;
      carte?.remove();
      poses.clear();
    };
  }, [donnees, peutEcrire]);

  // Annuler remet le repère là où il est enregistré.
  const annuler = () => {
    if (!deplacement) return;
    const enregistre = (JSON.parse(donnees) as Repere[]).find((r) => r.id === deplacement.id);
    if (enregistre) marqueurs.current.get(deplacement.id)?.setLatLng([versDegres(enregistre.position.latitudeMicrodeg), versDegres(enregistre.position.longitudeMicrodeg)]);
    setDeplacement(null);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* `relative z-0` : les calques de Leaflet ont leur propre z-index ; sans cette borne, ils
          passeraient par-dessus la barre d'onglets collée en haut. */}
      <div ref={conteneur} role="region" aria-label="Carte des lieux" className="relative z-0 h-80 w-full rounded border border-neutral-200 bg-neutral-100" />
      {fondIndisponible && <p className="text-xs text-amber-800">Le fond de carte ne se charge pas (pas de réseau ?). Les repères restent affichés.</p>}
      <p className="text-xs text-neutral-500">
        Fond de carte : {FOND_DE_CARTE.nom}, chargé depuis {FOND_DE_CARTE.hote} quand cet écran s&apos;affiche.
        {peutEcrire && " Un repère se déplace à la souris ou au doigt ; la nouvelle position se confirme ensuite."}
      </p>
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
    </div>
  );
}
