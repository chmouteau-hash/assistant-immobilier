"use client";

import { useActionState } from "react";
import { actionCreerTache, type EtatFormulaire } from "../actions";
import type { Scenario } from "@/lib/dossiers";

const ETAT_INITIAL: EtatFormulaire = { erreur: null };

export function FormulaireTache({ dossierId, scenarios }: { dossierId: string; scenarios: Scenario[] }) {
  const [etat, soumettre, enCours] = useActionState(actionCreerTache, ETAT_INITIAL);

  return (
    <form action={soumettre} className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-neutral-300 p-4 text-sm">
      <input type="hidden" name="dossierId" value={dossierId} />
      <label className="flex flex-1 flex-col gap-1">
        Description
        <input
          name="description"
          required
          placeholder="ex. Appeler le couvreur pour un devis"
          className="rounded border border-neutral-300 px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1">
        Échéance (facultatif)
        <input name="echeance" type="date" className="rounded border border-neutral-300 px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1">
        Responsable (facultatif)
        <input name="responsable" className="w-28 rounded border border-neutral-300 px-2 py-1" />
      </label>
      {scenarios.length > 0 && (
        <label className="flex flex-col gap-1">
          Scénario (facultatif)
          <select name="scenarioId" className="rounded border border-neutral-300 px-2 py-1">
            <option value="">— aucun —</option>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </select>
        </label>
      )}
      {etat.erreur && <p className="w-full text-red-600">{etat.erreur}</p>}
      <button
        type="submit"
        disabled={enCours}
        className="rounded border border-neutral-900 px-3 py-1.5 font-medium hover:bg-neutral-900 hover:text-white disabled:opacity-50"
      >
        Ajouter la tâche
      </button>
    </form>
  );
}
