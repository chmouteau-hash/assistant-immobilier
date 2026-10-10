import { obtenirActeurCourant } from "@/lib/acteur-courant";
import { autorise } from "@/lib/acces";
import { listerTaches, listerDependances, classementDossier, timelineDossier } from "@/lib/taches";
import { listerScenarios } from "@/lib/dossiers";
import { listerReference } from "@/lib/references";
import { actionCreerTache, actionAjouterDependance, actionRetirerDependance } from "../../actions";
import { FormulaireAction } from "@/components/FormulaireAction";
import { TacheItem } from "@/components/TacheItem";
import { Champ, Pastille, Section, Vide, classeSaisie, formaterDate } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PageActions({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acteur = await obtenirActeurCourant();
  const taches = listerTaches(acteur, id);
  const dependances = listerDependances(acteur, id);
  const classement = classementDossier(acteur, id);
  const timeline = timelineDossier(acteur, id);
  const statuts = listerReference("ref_statut_tache");
  const voitScenarios = autorise(acteur, id, "lire", "scenarios");
  const scenarios = voitScenarios ? listerScenarios(acteur, id) : [];
  // Sans droit de lire les scénarios, le rattachement d'une action n'est ni montré ni modifiable.
  const scenariosProposes = voitScenarios ? scenarios : undefined;
  const peutEcrire = autorise(acteur, id, "ecrire", "taches");
  const nom = (tid: string) => taches.find((t) => t.id === tid)?.description ?? "?";
  // Les colonnes de la liste du jour ne classent que les actions non faites : sans cette liste,
  // une action passée à « Faite » par erreur n'avait plus de liste « Statut » pour être rouverte.
  const faites = taches.filter((t) => t.statut === "fait");

  return (
    <div className="flex flex-col gap-8">
      <Section titre="Liste du jour" sousTitre="Une action n'apparaît que dans une colonne : à débloquer d'abord, puis aujourd'hui, puis à explorer.">
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["aujourdhui", "Aujourd'hui"],
              ["aDebloquer", "À débloquer"],
              ["aExplorer", "À explorer"],
            ] as const
          ).map(([cle, titre]) => (
            <div key={cle}>
              <p className="mb-1 text-sm font-medium">{titre}</p>
              {classement[cle].length === 0 ? (
                <p className="text-xs text-neutral-400">Rien.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {classement[cle].map((t) => (
                    <TacheItem key={t.id} tache={t} statuts={statuts} peutModifier={peutEcrire} corrigeable scenarios={scenariosProposes} />
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
        {faites.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-neutral-600">Actions faites ({faites.length})</summary>
            <ul className="mt-2 flex flex-col gap-2">
              {faites.map((t) => (
                <TacheItem key={t.id} tache={t} statuts={statuts} peutModifier={peutEcrire} corrigeable scenarios={scenariosProposes} />
              ))}
            </ul>
          </details>
        )}
      </Section>

      <Section titre="Timeline" sousTitre="Les actions sans échéance restent à part : aucune date n'est inventée.">
        {timeline.datees.length === 0 ? (
          <Vide>Aucune action datée.</Vide>
        ) : (
          <ol className="flex flex-col gap-1 border-l-2 border-neutral-300 pl-4 text-sm">
            {timeline.datees.map((e) => (
              <li key={e.action.id} className="relative">
                <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${e.position === "passe" ? (e.action.statut === "fait" ? "bg-green-500" : "bg-red-500") : e.position === "aujourdhui" ? "bg-amber-500" : "bg-neutral-400"}`} />
                <span className="text-neutral-500">{formaterDate(e.action.echeance)}</span> — {e.action.estJalon && <Pastille>jalon</Pastille>} {e.action.description}
                {e.enRetard && <Pastille ton="attention">en retard</Pastille>}
                {e.prerequisBloquants.length > 0 && <span className="text-xs text-amber-700"> attend : {e.prerequisBloquants.map(nom).join(", ")}</span>}
                {e.action.statut === "fait" && <Pastille ton="ok">fait</Pastille>}
              </li>
            ))}
          </ol>
        )}
        {timeline.sansDate.length > 0 && (
          <p className="text-sm text-neutral-500">
            Sans date connue :{" "}
            {timeline.sansDate.map((e, i) => (
              <span key={e.action.id}>
                {i > 0 && " · "}
                {e.action.description}
                {e.action.statut === "fait" && <> <Pastille ton="ok">fait</Pastille></>}
              </span>
            ))}
          </p>
        )}
      </Section>

      <Section titre="Dépendances" sousTitre="« B dépend de A » : B ne peut être commencée ni faite tant que A n'est pas faite. Les cycles sont refusés.">
        {dependances.length === 0 ? (
          <Vide>Aucune dépendance.</Vide>
        ) : (
          <ul className="flex flex-col text-sm">
            {dependances.map((d) => (
              <li key={`${d.actionId}-${d.dependDeId}`} className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 py-1">
                <span>
                  {nom(d.actionId)} <span className="text-neutral-500">dépend de</span> {nom(d.dependDeId)}
                </span>
                {peutEcrire && (
                  <FormulaireAction action={actionRetirerDependance} bouton="Retirer" compact>
                    <input type="hidden" name="dossierId" value={id} />
                    <input type="hidden" name="tacheId" value={d.actionId} />
                    <input type="hidden" name="dependDeId" value={d.dependDeId} />
                  </FormulaireAction>
                )}
              </li>
            ))}
          </ul>
        )}
        {peutEcrire && taches.length >= 2 && (
          <FormulaireAction action={actionAjouterDependance} bouton="Ajouter" compact>
            <input type="hidden" name="dossierId" value={id} />
            <Champ label="Action">
              <select name="tacheId" className={classeSaisie}>
                {taches.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.description}
                  </option>
                ))}
              </select>
            </Champ>
            <Champ label="dépend de">
              <select name="dependDeId" className={classeSaisie}>
                {taches.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.description}
                  </option>
                ))}
              </select>
            </Champ>
          </FormulaireAction>
        )}
      </Section>

      {peutEcrire && (
        <FormulaireAction action={actionCreerTache} bouton="Ajouter l'action" titre="Nouvelle action ou jalon">
          <input type="hidden" name="dossierId" value={id} />
          <div className="flex flex-wrap gap-3">
            <Champ label="Description" large>
              <input name="description" required className={classeSaisie} placeholder="ex. Demander le devis toiture" />
            </Champ>
            <Champ label="Échéance (vide = inconnue)">
              <input name="echeance" type="date" className={classeSaisie} />
            </Champ>
            <Champ label="Responsable">
              <input name="responsable" className={`${classeSaisie} w-28`} placeholder="moi, courtier…" />
            </Champ>
            <Champ label="Scénario">
              <select name="scenarioId" className={classeSaisie} defaultValue="">
                <option value="">— aucun —</option>
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom}
                  </option>
                ))}
              </select>
            </Champ>
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="estJalon" /> jalon
            </label>
          </div>
          {taches.length > 0 && (
            <Champ label="Dépend de (plusieurs choix possibles)">
              <select name="dependDe" multiple className={`${classeSaisie} h-24`}>
                {taches.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.description}
                  </option>
                ))}
              </select>
            </Champ>
          )}
        </FormulaireAction>
      )}
    </div>
  );
}
