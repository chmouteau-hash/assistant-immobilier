import { obtenirActeurPourSection } from "@/lib/acteur-courant";
import { autorise } from "@/lib/acces";
import { listerIdees } from "@/lib/idees";
import { listerScenarios } from "@/lib/dossiers";
import { listerBatiments } from "@/lib/structure";
import { listerReference, libelle } from "@/lib/references";
import { actionCreerIdee, actionChangerStatutIdee, actionRattacherIdee } from "../../actions";
import { FormulaireAction } from "@/components/FormulaireAction";
import { Champ, Pastille, QuestionSource, Section, Select, Vide, classeSaisie } from "@/components/ui";
import { LIBELLES_SOURCE } from "@/domain/provenance";

export const dynamic = "force-dynamic";

export default async function PageIdees({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acteur = await obtenirActeurPourSection(id, "idees");
  const idees = listerIdees(acteur, id);
  const statuts = listerReference("ref_statut_idee");
  const sources = listerReference("ref_source_donnee");
  const scenarios = autorise(acteur, id, "lire", "scenarios") ? listerScenarios(acteur, id) : [];
  const batiments = autorise(acteur, id, "lire", "lieux") ? listerBatiments(acteur, id) : [];
  const peutEcrire = autorise(acteur, id, "ecrire", "idees");

  return (
    <div className="flex flex-col gap-8">
      <Section titre="Carnet d'idées" sousTitre="Idée → à étudier → retenue / écartée. Retenir ou écarter demande un motif et crée une décision.">
        {idees.length === 0 && <Vide>Aucune idée. Exemples du cadrage : terrasse, piscine intérieure, panneaux solaires, puits canadien, récupération d&apos;eau de pluie.</Vide>}
        <ul className="flex flex-col gap-2 text-sm">
          {idees.map((i) => (
            <li key={i.id} className="rounded border border-neutral-200 bg-white p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p>
                  <span className="font-medium">{i.titre}</span>
                  <Pastille ton={i.source === "suggestion_ia" ? "ia" : "neutre"}>{LIBELLES_SOURCE[i.source as keyof typeof LIBELLES_SOURCE] ?? i.source}</Pastille>
                </p>
                <Pastille ton={i.statut === "retenue" ? "ok" : i.statut === "ecartee" ? "neutre" : "attention"}>{libelle(statuts, i.statut)}</Pastille>
              </div>
              {i.description && <p className="text-neutral-600">{i.description}</p>}
              <p className="text-xs text-neutral-500">
                Scénario : {scenarios.find((s) => s.id === i.scenarioId)?.nom ?? "aucun"}
                {i.batimentId && ` · bâtiment : ${batiments.find((b) => b.id === i.batimentId)?.nom ?? "?"}`}
              </p>
              {peutEcrire && (
                <div className="mt-2 flex flex-wrap gap-4">
                  <FormulaireAction action={actionChangerStatutIdee} bouton="Changer" compact>
                    <input type="hidden" name="dossierId" value={id} />
                    <input type="hidden" name="ideeId" value={i.id} />
                    <Champ label="Statut">
                      <Select name="statut" options={statuts} defaultValue={i.statut} />
                    </Champ>
                    <Champ label="Motif (obligatoire pour retenir/écarter)" large>
                      <input name="motif" className={classeSaisie} />
                    </Champ>
                  </FormulaireAction>
                  {scenarios.length > 0 && (
                    <FormulaireAction action={actionRattacherIdee} bouton="Rattacher" compact>
                      <input type="hidden" name="dossierId" value={id} />
                      <input type="hidden" name="ideeId" value={i.id} />
                      <Champ label="Scénario">
                        <select key={i.scenarioId ?? ""} name="scenarioId" defaultValue={i.scenarioId ?? ""} className={classeSaisie}>
                          <option value="">— aucun —</option>
                          {scenarios.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nom}
                            </option>
                          ))}
                        </select>
                      </Champ>
                    </FormulaireAction>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        {peutEcrire && (
          <FormulaireAction action={actionCreerIdee} bouton="Noter l'idée" titre="Nouvelle idée">
            <input type="hidden" name="dossierId" value={id} />
            <div className="flex flex-wrap gap-3">
              <Champ label="Titre" large>
                <input name="titre" required className={classeSaisie} placeholder="ex. Piscine intérieure" />
              </Champ>
              <QuestionSource name="source" sources={sources} defaultValue="saisie" question="D'où vient cette idée ?" />
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
              <Champ label="Bâtiment">
                <select name="batimentId" className={classeSaisie} defaultValue="">
                  <option value="">— aucun —</option>
                  {batiments.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nom}
                    </option>
                  ))}
                </select>
              </Champ>
            </div>
            <Champ label="Description, contraintes, questions ouvertes">
              <textarea name="description" rows={2} className={classeSaisie} />
            </Champ>
          </FormulaireAction>
        )}
      </Section>
    </div>
  );
}
