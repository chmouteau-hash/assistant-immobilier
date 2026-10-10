import { obtenirActeurCourant } from "@/lib/acteur-courant";
import { autorise } from "@/lib/acces";
import { listerScenarios, listerHypotheses, listerDecisions, historiqueScenario } from "@/lib/dossiers";
import { comparaisonDossier } from "@/lib/budget";
import { listerReference, libelle } from "@/lib/references";
import { formaterMontant } from "@/lib/montant";
import { actionCreerScenario, actionChangerStatutScenario, actionAjouterHypothese, actionChangerStatutHypothese } from "../../actions";
import { FormulaireAction } from "@/components/FormulaireAction";
import { Champ, Pastille, Section, Select, Vide, classeSaisie, formaterDateHeure } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PageScenarios({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acteur = await obtenirActeurCourant();
  const scenarios = listerScenarios(acteur, id);
  const hypotheses = listerHypotheses(acteur, id);
  const decisions = listerDecisions(acteur, id);
  const statuts = listerReference("ref_statut_scenario");
  const statutsHyp = listerReference("ref_statut_hypothese");
  const sources = listerReference("ref_source_donnee");
  const peutEcrire = autorise(acteur, id, "ecrire", "scenarios");
  const comparaison = autorise(acteur, id, "lire", "budget") ? comparaisonDossier(acteur, id, true) : null;

  return (
    <div className="flex flex-col gap-8">
      {comparaison && (
        <Section titre="Comparaison" sousTitre="Aucun scénario n'écrase l'autre. Les totaux ne sont comparés que si tous les postes sont renseignés.">
          {comparaison.lignes.length < 2 ? (
            <Vide>Il faut au moins deux scénarios pour comparer.</Vide>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs text-neutral-500">
                  <tr>
                    <th className="py-1">Scénario</th>
                    <th>Statut</th>
                    <th>Total de référence</th>
                    <th>Avec imprévus</th>
                    <th>Postes</th>
                    <th>Rang</th>
                    <th>Écart</th>
                    <th>Hypothèses à valider</th>
                  </tr>
                </thead>
                <tbody>
                  {comparaison.lignes.map((l) => (
                    <tr key={l.scenarioId} className="border-t border-neutral-200">
                      <td className="py-1 font-medium">{l.nom}</td>
                      <td>{libelle(statuts, l.statut)}</td>
                      <td>{l.synthese.totalReferenceCentimes === null ? <Pastille ton="attention">aucun montant</Pastille> : formaterMontant(l.synthese.totalReferenceCentimes)}</td>
                      <td>{l.synthese.totalAvecImprevusCentimes === null ? "—" : formaterMontant(l.synthese.totalAvecImprevusCentimes)}</td>
                      <td>
                        {l.synthese.nbPostes} {l.synthese.nbPostesARenseigner > 0 && <Pastille ton="attention">{l.synthese.nbPostesARenseigner} à renseigner</Pastille>}{" "}
                        {l.synthese.nbPostesSurEstimation > 0 && <Pastille ton="attention">{l.synthese.nbPostesSurEstimation} estimé(s)</Pastille>}
                      </td>
                      <td>{l.rangCout ?? "—"}</td>
                      <td>{l.ecartAuMoinsCherCentimes === null ? "—" : l.ecartAuMoinsCherCentimes === 0 ? "le moins cher" : `+ ${formaterMontant(l.ecartAuMoinsCherCentimes)}`}</td>
                      <td>{l.nbHypothesesOuvertes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {comparaison.reserve && comparaison.lignes.length >= 2 && <p className="text-sm text-amber-800">{comparaison.reserve}</p>}
        </Section>
      )}

      <Section titre="Scénarios" sousTitre="Ex. « Rénover l'ancien bâtiment » et « Construire en bois à côté ». Changer de statut exige un motif ; retenir ou écarter crée une décision.">
        {scenarios.length === 0 && <Vide>Aucun scénario.</Vide>}
        <div className="grid gap-3 sm:grid-cols-2">
          {scenarios.map((s) => {
            const siennes = hypotheses.filter((h) => h.scenarioId === s.id);
            const historique = historiqueScenario(acteur, s.id);
            return (
              <article key={s.id} className="flex flex-col gap-3 rounded border border-neutral-200 bg-white p-3 text-sm">
                <header className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{s.nom}</h3>
                  <Pastille ton={s.statut === "retenue" ? "ok" : "neutre"}>{libelle(statuts, s.statut)}</Pastille>
                </header>
                {s.description && <p className="text-neutral-600">{s.description}</p>}
                <div>
                  <p className="text-xs font-medium text-neutral-500">Hypothèses</p>
                  {siennes.length === 0 ? (
                    <p className="text-xs text-neutral-400">Aucune hypothèse notée.</p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {siennes.map((h) => (
                        <li key={h.id} className="flex flex-wrap items-center justify-between gap-1 border-t border-neutral-100 py-1">
                          <span>
                            {h.enonce} <Pastille ton={h.statut === "validee" ? "ok" : h.statut === "invalidee" ? "neutre" : "attention"}>{libelle(statutsHyp, h.statut)}</Pastille>
                          </span>
                          {peutEcrire && h.statut === "a_valider" && (
                            <FormulaireAction action={actionChangerStatutHypothese} bouton="OK" compact>
                              <input type="hidden" name="dossierId" value={id} />
                              <input type="hidden" name="hypotheseId" value={h.id} />
                              <Select name="statut" options={statutsHyp.filter((x) => x.code !== "a_valider")} />
                              <input name="motif" placeholder="motif" required className={`${classeSaisie} w-32`} />
                            </FormulaireAction>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {peutEcrire && (
                    <FormulaireAction action={actionAjouterHypothese} bouton="Noter" compact className="mt-1">
                      <input type="hidden" name="dossierId" value={id} />
                      <input type="hidden" name="scenarioId" value={s.id} />
                      <input name="enonce" required placeholder="Hypothèse à valider" className={`${classeSaisie} flex-1`} />
                      <Select name="source" options={sources} defaultValue="saisie" />
                    </FormulaireAction>
                  )}
                </div>
                {peutEcrire && (
                  <FormulaireAction action={actionChangerStatutScenario} bouton="Changer le statut" compact>
                    <input type="hidden" name="dossierId" value={id} />
                    <input type="hidden" name="scenarioId" value={s.id} />
                    <Champ label="Statut">
                      <Select name="statut" options={statuts} defaultValue={s.statut} />
                    </Champ>
                    <Champ label="Motif (obligatoire)" large>
                      <input name="motif" required className={classeSaisie} />
                    </Champ>
                    <Champ label="Conditions encore ouvertes" large>
                      <input name="conditionsOuvertes" className={classeSaisie} placeholder="ex. devis toiture à confirmer" />
                    </Champ>
                  </FormulaireAction>
                )}
                {historique.length > 0 && (
                  <details className="text-xs text-neutral-500">
                    <summary className="cursor-pointer">Historique ({historique.length})</summary>
                    <ul className="mt-1 flex flex-col gap-1">
                      {historique.map((evt) => (
                        <li key={evt.id}>
                          {formaterDateHeure(evt.dtEvenement)} — {evt.action}
                          {evt.changements?.map((c) => ` ${c.champ} : ${c.avant ?? "—"} → ${c.apres ?? "—"}`)}
                          {evt.motif && ` : « ${evt.motif} »`}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </article>
            );
          })}
        </div>
        {peutEcrire && (
          <FormulaireAction action={actionCreerScenario} bouton="Ajouter le scénario" titre="Nouveau scénario">
            <input type="hidden" name="dossierId" value={id} />
            <Champ label="Nom">
              <input name="nom" required className={classeSaisie} placeholder="ex. Rénover l'ancien bâtiment" />
            </Champ>
            <Champ label="Description (travaux envisagés, contraintes, questions)">
              <textarea name="description" rows={2} className={classeSaisie} />
            </Champ>
          </FormulaireAction>
        )}
      </Section>

      <Section titre="Décisions" sousTitre="Historique des choix : quoi, pourquoi, alternatives écartées, conditions ouvertes.">
        {decisions.length === 0 ? (
          <Vide>Aucune décision.</Vide>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {decisions.map((d) => (
              <li key={d.id} className="rounded border border-neutral-200 bg-white px-3 py-2">
                <span className="font-medium">{d.choix}</span> — {d.motif}
                {d.alternativesEcartees && <span className="text-neutral-500"> · écarté : {d.alternativesEcartees}</span>}
                {d.conditionsOuvertes && <span className="text-amber-800"> · conditions ouvertes : {d.conditionsOuvertes}</span>}
                <span className="ml-2 text-xs text-neutral-400">{formaterDateHeure(d.dateDecision)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
