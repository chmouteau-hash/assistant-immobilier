// Une action, telle qu'elle apparaît sur l'accueil et dans la page « Actions » d'un dossier.
// Composant serveur : les formulaires (statut, correction) sont des Server Actions classiques.

import { actionChangerStatutTache, actionModifierTache } from "@/app/dossiers/actions";
import type { TacheAvecDossier, Tache } from "@/lib/taches";
import type { Reference } from "@/lib/references";
import { FormulaireAction } from "./FormulaireAction";
import { Champ, Pastille, Select, classeSaisie, formaterDate } from "./ui";

export function TacheItem({
  tache,
  dossierNom,
  statuts,
  peutModifier = true,
  corrigeable = false,
  scenarios,
}: {
  tache: Tache | TacheAvecDossier;
  dossierNom?: string;
  statuts: Reference[];
  peutModifier?: boolean;
  /** Propose « Modifier » (description, échéance, responsable, jalon) : écran Actions du dossier seulement. */
  corrigeable?: boolean;
  /** Scénarios du dossier, si l'acteur peut les lire : le rattachement devient alors modifiable. */
  scenarios?: { id: string; nom: string }[];
}) {
  const bloquants = "prerequisBloquants" in tache ? tache.prerequisBloquants : [];
  return (
    <li className="flex flex-col gap-2 rounded border border-neutral-200 bg-white px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <p>
            {tache.estJalon && <Pastille>jalon</Pastille>} {tache.description}
            {dossierNom && <span className="ml-2 text-xs text-neutral-400">— {dossierNom}</span>}
          </p>
          <p className="text-xs text-neutral-400">
            {tache.echeance ? `Échéance : ${formaterDate(tache.echeance)}` : "Échéance inconnue"}
            {tache.responsable ? ` · ${tache.responsable}` : " · responsable à désigner"}
            {bloquants.length > 0 && <span className="ml-2 text-amber-700">attend {bloquants.length} prérequis</span>}
          </p>
        </div>
        {peutModifier ? (
          <FormulaireAction action={actionChangerStatutTache} bouton="OK" compact>
            <input type="hidden" name="dossierId" value={tache.dossierId} />
            <input type="hidden" name="tacheId" value={tache.id} />
            <Select name="statut" options={statuts} defaultValue={tache.statut} />
          </FormulaireAction>
        ) : (
          <Pastille>{statuts.find((s) => s.code === tache.statut)?.libelle ?? tache.statut}</Pastille>
        )}
      </div>
      {peutModifier && corrigeable && (
        <details className="text-xs">
          <summary className="cursor-pointer text-neutral-500">Modifier</summary>
          <FormulaireAction action={actionModifierTache} bouton="Enregistrer" compact className="mt-1">
            <input type="hidden" name="dossierId" value={tache.dossierId} />
            <input type="hidden" name="tacheId" value={tache.id} />
            <Champ label="Description" large>
              <input name="description" defaultValue={tache.description} required className={classeSaisie} />
            </Champ>
            <Champ label="Échéance (vide = inconnue)">
              <input name="echeance" type="date" defaultValue={tache.echeance ?? ""} className={classeSaisie} />
            </Champ>
            <Champ label="Responsable">
              <input name="responsable" defaultValue={tache.responsable ?? ""} className={`${classeSaisie} w-28`} />
            </Champ>
            {scenarios && (
              <Champ label="Scénario">
                <select key={tache.scenarioId ?? ""} name="scenarioId" defaultValue={tache.scenarioId ?? ""} className={classeSaisie}>
                  <option value="">— aucun —</option>
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nom}
                    </option>
                  ))}
                </select>
              </Champ>
            )}
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="estJalon" defaultChecked={tache.estJalon} /> jalon
            </label>
          </FormulaireAction>
        </details>
      )}
    </li>
  );
}
