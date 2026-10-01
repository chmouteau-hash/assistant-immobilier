"use client";

import { useActionState } from "react";
import { actionChangerStatut, actionAjouterLigneBudget, type EtatFormulaire } from "../actions";
import { formaterMontant } from "@/lib/montant";
import type { LigneBudget, Reference, Scenario } from "@/lib/dossiers";
import type { EvenementAudit } from "@/lib/db/audit";

const ETAT_INITIAL: EtatFormulaire = { erreur: null };

type Props = {
  dossierId: string;
  scenario: Scenario;
  lignesBudget: LigneBudget[];
  totalCentimes: number;
  historique: EvenementAudit[];
  statuts: Reference[];
  sources: Reference[];
  typesMontant: Reference[];
};

export function ScenarioCard({
  dossierId,
  scenario,
  lignesBudget,
  totalCentimes,
  historique,
  statuts,
  sources,
  typesMontant,
}: Props) {
  const [etatStatut, soumettreStatut, statutEnCours] = useActionState(actionChangerStatut, ETAT_INITIAL);
  const [etatBudget, soumettreBudget, budgetEnCours] = useActionState(
    actionAjouterLigneBudget,
    ETAT_INITIAL,
  );
  const libelleStatut = statuts.find((s) => s.code === scenario.statut)?.libelle ?? scenario.statut;
  const libelleSource = sources.find((s) => s.code === scenario.source)?.libelle ?? scenario.source;

  return (
    <article className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">{scenario.nom}</h3>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium">{libelleStatut}</span>
      </header>
      {scenario.description && <p className="text-sm text-neutral-600">{scenario.description}</p>}
      <p className="text-xs text-neutral-400">Provenance : {libelleSource}</p>

      <div className="rounded bg-neutral-50 p-3">
        <p className="text-sm font-medium">Total budget : {formaterMontant(totalCentimes)}</p>
        {lignesBudget.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {lignesBudget.map((ligne) => (
              <li key={ligne.id} className="flex justify-between text-neutral-600">
                <span>
                  {ligne.poste} <span className="text-xs text-neutral-400">({ligne.typeMontant})</span>
                </span>
                <span>{formaterMontant(ligne.montantCentimes)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form action={soumettreBudget} className="flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="dossierId" value={dossierId} />
        <input type="hidden" name="scenarioId" value={scenario.id} />
        <label className="flex flex-col gap-1">
          Poste
          <input name="poste" required className="w-28 rounded border border-neutral-300 px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          Montant (€)
          <input
            name="montant"
            required
            placeholder="1250,50"
            className="w-24 rounded border border-neutral-300 px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          Type
          <select name="typeMontant" className="rounded border border-neutral-300 px-2 py-1">
            {typesMontant.map((t) => (
              <option key={t.code} value={t.code}>
                {t.libelle}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Source
          <select name="source" className="rounded border border-neutral-300 px-2 py-1">
            {sources.map((s) => (
              <option key={s.code} value={s.code}>
                {s.libelle}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={budgetEnCours}
          className="rounded border border-neutral-900 px-2 py-1 font-medium hover:bg-neutral-900 hover:text-white disabled:opacity-50"
        >
          Ajouter
        </button>
      </form>
      {etatBudget.erreur && <p className="text-sm text-red-600">{etatBudget.erreur}</p>}

      <form action={soumettreStatut} className="flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="dossierId" value={dossierId} />
        <input type="hidden" name="scenarioId" value={scenario.id} />
        <label className="flex flex-col gap-1">
          Nouveau statut
          <select name="statut" defaultValue={scenario.statut} className="rounded border border-neutral-300 px-2 py-1">
            {statuts.map((s) => (
              <option key={s.code} value={s.code}>
                {s.libelle}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1">
          Motif (obligatoire)
          <input
            name="motif"
            required
            placeholder="ex. surcoût toiture > 40 k€"
            className="rounded border border-neutral-300 px-2 py-1"
          />
        </label>
        <button
          type="submit"
          disabled={statutEnCours}
          className="rounded border border-neutral-900 px-2 py-1 font-medium hover:bg-neutral-900 hover:text-white disabled:opacity-50"
        >
          Changer
        </button>
      </form>
      {etatStatut.erreur && <p className="text-sm text-red-600">{etatStatut.erreur}</p>}

      {historique.length > 0 && (
        <details className="text-xs text-neutral-500">
          <summary className="cursor-pointer">Historique ({historique.length})</summary>
          <ul className="mt-1 flex flex-col gap-1">
            {historique.map((evt) => (
              <li key={evt.id}>
                {new Date(evt.dtEvenement).toLocaleString("fr-FR")} — {evt.action}
                {evt.motif && ` : « ${evt.motif} »`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
