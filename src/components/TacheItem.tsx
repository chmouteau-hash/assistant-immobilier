// Une action, telle qu'elle apparaît sur l'accueil et dans la page « Actions » d'un dossier.
// Composant serveur : le formulaire de changement de statut est une Server Action classique.

import { actionChangerStatutTache } from "@/app/dossiers/actions";
import type { TacheAvecDossier, Tache } from "@/lib/taches";
import type { Reference } from "@/lib/references";
import { FormulaireAction } from "./FormulaireAction";
import { Pastille, Select, formaterDate } from "./ui";

export function TacheItem({ tache, dossierNom, statuts, peutModifier = true }: { tache: Tache | TacheAvecDossier; dossierNom?: string; statuts: Reference[]; peutModifier?: boolean }) {
  const bloquants = "prerequisBloquants" in tache ? tache.prerequisBloquants : [];
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded border border-neutral-200 bg-white px-3 py-2 text-sm">
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
    </li>
  );
}
