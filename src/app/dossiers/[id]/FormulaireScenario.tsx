"use client";

import { useActionState } from "react";
import { actionCreerScenario, type EtatFormulaire } from "../actions";

const ETAT_INITIAL: EtatFormulaire = { erreur: null };

export function FormulaireScenario({ dossierId }: { dossierId: string }) {
  const [etat, soumettre, enCours] = useActionState(actionCreerScenario, ETAT_INITIAL);

  return (
    <form action={soumettre} className="flex flex-col gap-3 rounded-lg border border-dashed border-neutral-300 p-4">
      <h3 className="font-medium">Nouveau scénario à comparer</h3>
      <input type="hidden" name="dossierId" value={dossierId} />
      <label className="flex flex-col gap-1 text-sm">
        Nom
        <input
          name="nom"
          required
          placeholder="ex. Rénovation, Reconstruction"
          className="rounded border border-neutral-300 px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Description (facultatif)
        <textarea name="description" className="rounded border border-neutral-300 px-2 py-1" />
      </label>
      {etat.erreur && <p className="text-sm text-red-600">{etat.erreur}</p>}
      <button
        type="submit"
        disabled={enCours}
        className="self-start rounded-md border border-neutral-900 px-3 py-1.5 text-sm font-medium hover:bg-neutral-900 hover:text-white disabled:opacity-50"
      >
        Ajouter le scénario
      </button>
    </form>
  );
}
