import Link from "next/link";
import { obtenirActeurCourant } from "@/lib/acteur-courant";
import { autorise } from "@/lib/acces";
import { listerScenarios } from "@/lib/dossiers";
import { listerPostes, listerLignes, syntheseScenario } from "@/lib/budget";
import { listerBatiments } from "@/lib/structure";
import { listerReference, libelle } from "@/lib/references";
import { formaterMontant } from "@/lib/montant";
import { actionCreerPoste, actionAjouterLigne, actionModifierLigne } from "../../actions";
import { FormulaireAction } from "@/components/FormulaireAction";
import { Champ, EtiquetteSourceConfiance, Pastille, Section, Select, Vide, classeSaisie, formaterDate } from "@/components/ui";

export const dynamic = "force-dynamic";

const LIBELLES_STATUT_POSTE: Record<string, string> = {
  a_renseigner: "à renseigner",
  estime: "estimé",
  chiffre: "chiffré (devis)",
  engage: "engagé",
  facture: "facturé",
  paye: "payé",
};

function Montant({ centimes }: { centimes: number | null }) {
  return centimes === null ? <span className="text-neutral-400">—</span> : <span>{formaterMontant(centimes)}</span>;
}

export default async function PageBudget({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acteur = await obtenirActeurCourant();
  const scenarios = autorise(acteur, id, "lire", "scenarios") ? listerScenarios(acteur, id) : [];
  const postes = listerPostes(acteur, id);
  const lignes = listerLignes(acteur, id);
  const batiments = autorise(acteur, id, "lire", "lieux") ? listerBatiments(acteur, id) : [];
  const types = listerReference("ref_type_montant");
  const sources = listerReference("ref_source_donnee").filter((s) => s.code !== "suggestion_ia");
  const confiances = listerReference("ref_confiance").filter((c) => c.code !== "a_renseigner");
  const statutsLigne = listerReference("ref_statut_ligne");
  const peutEcrire = autorise(acteur, id, "ecrire", "budget");

  if (scenarios.length === 0) {
    return (
      <Vide>
        Le budget se tient par scénario : créez d&apos;abord un scénario (même unique) dans <Link href={`/dossiers/${id}/scenarios`} className="underline">Scénarios</Link>.
      </Vide>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <p className="text-xs text-neutral-500">
        Montants en euros, stockés en centimes entiers. Un poste sans montant est « à renseigner » et ne compte jamais pour zéro. Référence d&apos;un poste = nature la plus avancée (facture &gt; engagement &gt; devis &gt; estimation).
      </p>
      {scenarios.map((s) => {
        const synthese = syntheseScenario(acteur, s.id);
        const siens = postes.filter((p) => p.scenarioId === s.id);
        return (
          <Section key={s.id} titre={`${s.nom} — ${libelle(listerReference("ref_statut_scenario"), s.statut)}`}>
            <div className="flex flex-wrap gap-4 rounded bg-neutral-100 p-3 text-sm">
              <span>
                Total de référence : <strong><Montant centimes={synthese.totalReferenceCentimes} /></strong>
                {!synthese.complet && synthese.nbPostes > 0 && <Pastille ton="attention">partiel</Pastille>}
              </span>
              <span>
                Imprévus : <Montant centimes={synthese.margeImprevusCentimes} />
              </span>
              <span>
                Total avec imprévus : <Montant centimes={synthese.totalAvecImprevusCentimes} />
              </span>
              <span>
                Facturé : <Montant centimes={synthese.totalFactureCentimes} /> · payé : <Montant centimes={synthese.totalPaiementCentimes} />
              </span>
            </div>
            {siens.length === 0 ? (
              <Vide>Aucun poste. Listez les postes même sans montant : chaque « à renseigner » rend l&apos;inconnu visible.</Vide>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-xs text-neutral-500">
                    <tr>
                      <th className="py-1">Poste</th>
                      <th>Statut</th>
                      <th>Estimation</th>
                      <th>Devis</th>
                      <th>Facture</th>
                      <th>Payé</th>
                      <th>Référence</th>
                      <th>Écart devis/estim.</th>
                      <th>Reste à payer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {synthese.postes.map((p) => (
                      <tr key={p.posteId} className="border-t border-neutral-200 align-top">
                        <td className="py-1 font-medium">{p.nom}</td>
                        <td>
                          <Pastille ton={p.statut === "a_renseigner" ? "attention" : p.statut === "estime" ? "attention" : "ok"}>{LIBELLES_STATUT_POSTE[p.statut]}</Pastille>
                        </td>
                        <td><Montant centimes={p.estimationCentimes} /></td>
                        <td><Montant centimes={p.devisCentimes} /></td>
                        <td><Montant centimes={p.factureCentimes} /></td>
                        <td><Montant centimes={p.paiementCentimes} /></td>
                        <td>
                          <Montant centimes={p.referenceCentimes} /> {p.natureReference && <span className="text-xs text-neutral-500">({p.natureReference})</span>}
                        </td>
                        <td><Montant centimes={p.ecartDevisEstimationCentimes} /></td>
                        <td><Montant centimes={p.resteAPayerCentimes} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <details className="text-sm">
              <summary className="cursor-pointer text-neutral-600">Lignes détaillées ({lignes.filter((l) => l.scenarioId === s.id).length})</summary>
              <ul className="mt-2 flex flex-col gap-1">
                {lignes
                  .filter((l) => l.scenarioId === s.id)
                  .map((l) => (
                    <li key={l.id} className={`flex flex-col gap-1 border-t border-neutral-100 py-1 ${l.statut === "ecartee" ? "text-neutral-400" : ""}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`w-40 font-medium ${l.statut === "ecartee" ? "line-through" : ""}`}>{l.poste}</span>
                        <span className="w-24">{libelle(types, l.typeMontant)}</span>
                        <span className={`w-28 text-right ${l.statut === "ecartee" ? "line-through" : ""}`}>{formaterMontant(l.montantCentimes)}</span>
                        <EtiquetteSourceConfiance source={l.source} confiance={l.confiance} />
                        {l.statut === "ecartee" && <Pastille>écartée (ne compte pas)</Pastille>}
                        {l.fournisseur && <span className="text-neutral-500">{l.fournisseur}</span>}
                        {l.datePiece && <span className="text-neutral-500">{formaterDate(l.datePiece)}</span>}
                        {l.documentId && (
                          <Link href={`/dossiers/${id}/documents/${l.documentId}`} className="text-xs underline">
                            document
                          </Link>
                        )}
                      </div>
                      {peutEcrire && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-neutral-500">Modifier ou écarter</summary>
                          <FormulaireAction action={actionModifierLigne} bouton="Enregistrer" compact className="mt-1 text-neutral-900">
                            <input type="hidden" name="dossierId" value={id} />
                            <input type="hidden" name="ligneId" value={l.id} />
                            <Champ label="Montant (€)">
                              <input name="montant" defaultValue={(l.montantCentimes / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, useGrouping: false })} className={`${classeSaisie} w-28`} />
                            </Champ>
                            <Champ label="Nature">
                              <Select name="typeMontant" options={types} defaultValue={l.typeMontant} />
                            </Champ>
                            <Champ label="Source">
                              <Select name="source" options={sources} defaultValue={l.source} />
                            </Champ>
                            <Champ label="Confiance">
                              <Select name="confiance" options={confiances} defaultValue={l.confiance} />
                            </Champ>
                            <Champ label="Fournisseur">
                              <input name="fournisseur" defaultValue={l.fournisseur ?? ""} className={classeSaisie} />
                            </Champ>
                            <Champ label="Date de la pièce">
                              <input name="datePiece" type="date" defaultValue={l.datePiece ?? ""} className={classeSaisie} />
                            </Champ>
                            <Champ label="Statut">
                              <Select name="statut" options={statutsLigne} defaultValue={l.statut} />
                            </Champ>
                            <Champ label="Motif (obligatoire)" large>
                              <input name="motif" required className={classeSaisie} placeholder="ex. devis non retenu, erreur de saisie" />
                            </Champ>
                          </FormulaireAction>
                        </details>
                      )}
                    </li>
                  ))}
              </ul>
            </details>
            {peutEcrire && (
              <div className="flex flex-col gap-3 sm:flex-row">
                <FormulaireAction action={actionCreerPoste} bouton="Ajouter le poste" titre="Nouveau poste (sans montant)">
                  <input type="hidden" name="dossierId" value={id} />
                  <input type="hidden" name="scenarioId" value={s.id} />
                  <Champ label="Nom">
                    <input name="nom" required className={classeSaisie} placeholder="ex. Toiture, Menuiseries, Panneaux solaires" />
                  </Champ>
                  <div className="flex flex-wrap gap-3">
                    <Champ label="Catégorie">
                      <input name="categorie" className={classeSaisie} placeholder="gros œuvre, énergie…" />
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
                </FormulaireAction>
                {siens.length > 0 && (
                  <FormulaireAction action={actionAjouterLigne} bouton="Ajouter la ligne" titre="Nouvelle ligne de montant">
                    <input type="hidden" name="dossierId" value={id} />
                    <div className="flex flex-wrap gap-3">
                      <Champ label="Poste">
                        <select name="posteId" className={classeSaisie}>
                          {siens.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nom}
                            </option>
                          ))}
                        </select>
                      </Champ>
                      <Champ label="Montant (€)">
                        <input name="montant" required className={`${classeSaisie} w-28`} placeholder="1250,50" />
                      </Champ>
                      <Champ label="Nature">
                        <Select name="typeMontant" options={types} />
                      </Champ>
                      <Champ label="Source">
                        <Select name="source" options={sources} defaultValue="estimation" />
                      </Champ>
                      <Champ label="Confiance">
                        <Select name="confiance" options={confiances} vide="— par défaut selon la source —" />
                      </Champ>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Champ label="Fournisseur">
                        <input name="fournisseur" className={classeSaisie} />
                      </Champ>
                      <Champ label="Date de la pièce">
                        <input name="datePiece" type="date" className={classeSaisie} />
                      </Champ>
                      <Champ label="Motif / note" large>
                        <input name="motif" className={classeSaisie} placeholder="ex. devis non reçu, estimation au m²" />
                      </Champ>
                    </div>
                  </FormulaireAction>
                )}
              </div>
            )}
          </Section>
        );
      })}
    </div>
  );
}
