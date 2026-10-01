"use client";

import { useActionState } from "react";
import { actionCreerDossier, type EtatFormulaire } from "./actions";

const ETAT_INITIAL: EtatFormulaire = { erreur: null };

export function FormulaireDossier() {
  const [etat, soumettre, enCours] = useActionState(actionCreerDossier, ETAT_INITIAL);

  return (
    <form action={soumettre} className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4">
      <h2 className="font-medium">Nouveau dossier</h2>
      <label className="flex flex-col gap-1 text-sm">
        Nom
        <input name="nom" required className="rounded border border-neutral-300 px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Objectif (facultatif)
        <input name="objectif" className="rounded border border-neutral-300 px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Stade de départ (facultatif)
        <input
          name="stade"
          placeholder="ex. recherche, travaux, construction"
          className="rounded border border-neutral-300 px-2 py-1"
        />
      </label>
      {etat.erreur && <p className="text-sm text-red-600">{etat.erreur}</p>}
      <button
        type="submit"
        disabled={enCours}
        className="self-start rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        Créer le dossier
      </button>
    </form>
  );
}
