"use client";

// Chercher un endroit par un code postal, une commune ou une adresse, puis y situer un lieu
// (issue #48). En recherche d'un bien, on connaît souvent la commune avant l'adresse.
//
// Deux temps, parce que le service d'adresses répond rarement par un seul endroit : un code postal
// couvre plusieurs communes, un nom de commune est aussi un nom de rue ailleurs. Le premier
// formulaire envoie le texte et reçoit une liste, sans rien écrire. Chaque proposition est ensuite
// un formulaire à part entière : c'est en en choisissant une que la position s'enregistre, « source
// externe · à confirmer », avec le nom de l'endroit en note.
//
// Composant client pour garder la liste à l'écran entre les deux temps. Les droits restent dans
// `lib` : les deux Server Actions reçues en propriétés les contrôlent avant d'agir.

import { useActionState, useState } from "react";
import { FormulaireAction } from "./FormulaireAction";
import { Champ, classeSaisie } from "./ui";
import { NB_ENDROITS_MAX, NOM_SERVICE_ADRESSES, estCodePostal, formaterCoordonnee, noteEndroit } from "@/domain/geo";
import type { EtatFormulaire, EtatRecherche } from "@/app/dossiers/actions";

const ETAT_INITIAL: EtatRecherche = { erreur: null, texte: "", resultats: null };

export function RechercheEndroit({
  dossierId,
  lieuId,
  actionChercher,
  actionSituer,
}: {
  dossierId: string;
  lieuId: string;
  actionChercher: (etat: EtatRecherche, donnees: FormData) => Promise<EtatRecherche>;
  actionSituer: (etat: EtatFormulaire, donnees: FormData) => Promise<EtatFormulaire>;
}) {
  const [etat, chercher, enCours] = useActionState(actionChercher, ETAT_INITIAL);
  // Champ contrôlé : React vide un formulaire après chaque action, et le texte cherché doit rester
  // lisible au-dessus de la liste.
  const [saisie, setSaisie] = useState("");
  const resultats = etat.resultats;

  return (
    <div className="mt-2 flex flex-col gap-2">
      <form action={chercher} className="flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="dossierId" value={dossierId} />
        <Champ label="Chercher un code postal, une commune ou une adresse" large>
          <input name="recherche" value={saisie} onChange={(e) => setSaisie(e.target.value)} className={classeSaisie} placeholder="ex. 75002, ou Rennes" />
        </Champ>
        <button type="submit" disabled={enCours} className="min-h-10 rounded border border-neutral-900 px-3 py-2 font-medium hover:bg-neutral-900 hover:text-white disabled:opacity-50">
          {enCours ? "…" : "Chercher"}
        </button>
        <p className="w-full text-xs text-neutral-600">
          Le texte saisi, et rien d&apos;autre, est envoyé à la {NOM_SERVICE_ADRESSES}. Rien n&apos;est enregistré tant que vous n&apos;avez pas choisi un endroit.
        </p>
      </form>
      {etat.erreur && (
        <p role="alert" className="text-sm text-red-600">
          {etat.erreur}
        </p>
      )}
      {resultats && resultats.length === 0 && <p className="text-sm text-neutral-600">Aucun endroit trouvé pour « {etat.texte} ». Vérifiez le texte, ou choisissez l&apos;endroit sur la carte.</p>}
      {resultats && resultats.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-neutral-600">
            {resultats.length === 1 ? "1 endroit trouvé" : `${resultats.length} endroits trouvés`} pour « {etat.texte} ». Choisissez le bon : sa position sera notée « source externe · à confirmer ». Pour une
            commune, le repère se pose sur le point que le service lui attribue, à affiner ensuite sur la carte.
            {!estCodePostal(etat.texte) && resultats.length >= NB_ENDROITS_MAX && " La liste est limitée : précisez le texte si l'endroit n'y est pas."}
          </p>
          <ul className="flex max-h-72 flex-col overflow-y-auto rounded border border-neutral-200 bg-white">
            {resultats.map((endroit) => (
              <li key={endroit.id} className="border-b border-neutral-100 px-2 py-1 last:border-b-0">
                <FormulaireAction action={actionSituer} bouton="Situer ici" compact className="items-center justify-between">
                  <input type="hidden" name="dossierId" value={dossierId} />
                  <input type="hidden" name="lieuId" value={lieuId} />
                  <input type="hidden" name="latitude" value={formaterCoordonnee(endroit.position.latitudeMicrodeg)} />
                  <input type="hidden" name="longitude" value={formaterCoordonnee(endroit.position.longitudeMicrodeg)} />
                  <input type="hidden" name="positionSource" value="source_externe" />
                  <input type="hidden" name="positionConfiance" value="a_confirmer" />
                  <input type="hidden" name="note" value={noteEndroit(endroit)} />
                  <input type="hidden" name="motif" value={`Choisi parmi les propositions de la ${NOM_SERVICE_ADRESSES} pour « ${etat.texte} »`} />
                  <span className="min-w-0 flex-1">
                    {endroit.libelle} <span className="text-neutral-500">· {endroit.nature}</span>
                  </span>
                </FormulaireAction>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
