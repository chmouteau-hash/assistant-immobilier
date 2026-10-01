"use client";

// Composant partagé entre l'accueil (toutes les tâches, tous dossiers) et la page d'un dossier
// (ses tâches seulement) — une tâche se présente et se change de statut de la même façon aux
// deux endroits.

import { useActionState } from "react";
import { actionChangerStatutTache } from "@/app/dossiers/actions";
import type { EtatFormulaire } from "@/app/dossiers/actions";
import type { Tache } from "@/lib/taches";
import type { Reference } from "@/lib/dossiers";

const ETAT_INITIAL: EtatFormulaire = { erreur: null };

export function TacheItem({
  tache,
  dossierNom,
  statuts,
}: {
  tache: Tache;
  dossierNom?: string;
  statuts: Reference[];
}) {
  const [etat, soumettre, enCours] = useActionState(actionChangerStatutTache, ETAT_INITIAL);

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded border border-neutral-200 px-3 py-2 text-sm">
      <div>
        <p>
          {tache.description}
          {dossierNom && <span className="ml-2 text-xs text-neutral-400">— {dossierNom}</span>}
        </p>
        <p className="text-xs text-neutral-400">
          {tache.echeance ? `Échéance : ${tache.echeance}` : "Pas d'échéance"}
          {tache.responsable && ` · ${tache.responsable}`}
        </p>
        {etat.erreur && <p className="text-xs text-red-600">{etat.erreur}</p>}
      </div>
      <form action={soumettre} className="flex items-center gap-1">
        <input type="hidden" name="dossierId" value={tache.dossierId} />
        <input type="hidden" name="tacheId" value={tache.id} />
        <select
          name="statut"
          defaultValue={tache.statut}
          className="rounded border border-neutral-300 px-1.5 py-1 text-xs"
        >
          {statuts.map((s) => (
            <option key={s.code} value={s.code}>
              {s.libelle}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={enCours}
          className="rounded border border-neutral-900 px-2 py-1 text-xs font-medium hover:bg-neutral-900 hover:text-white disabled:opacity-50"
        >
          Mettre à jour
        </button>
      </form>
    </li>
  );
}
