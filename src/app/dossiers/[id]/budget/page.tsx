import Link from "next/link";
import { obtenirActeurPourSection } from "@/lib/acteur-courant";
import { autorise } from "@/lib/acces";
import { scenariosCites } from "@/lib/dossiers";
import { listerPostes, listerLignes, syntheseScenario } from "@/lib/budget";
import { listerBatiments } from "@/lib/structure";
import { listerReference, libelle } from "@/lib/references";
import { formaterMontant } from "@/lib/montant";
import { actionCreerPoste, actionModifierPoste, actionSolderPoste, actionRouvrirPoste, actionAjouterLigne, actionModifierLigne } from "../../actions";
import { FormulaireAction } from "@/components/FormulaireAction";
import { REPONSE_HABITUELLE } from "@/domain/provenance";
import { Champ, EtiquetteSourceConfiance, Pastille, QuestionConfiance, QuestionSource, Section, Select, Vide, classeSaisie, formaterDate } from "@/components/ui";

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
  const acteur = await obtenirActeurPourSection(id, "budget");
  // Le budget se tient par scénario. Qui ne peut pas lire les scénarios les voit sous un libellé
  // neutre (« Scénario 1 ») : une liste vide lui faisait dire « créez d'abord un scénario », ce qui
  // était faux et lui fermait tout l'écran (issue #27).
  const scenarios = scenariosCites(acteur, id, "budget");
  const voitScenarios = autorise(acteur, id, "lire", "scenarios");
  const voitDocuments = autorise(acteur, id, "lire", "documents");
  const statutsScenario = listerReference("ref_statut_scenario");
  const postes = listerPostes(acteur, id);
  const lignes = listerLignes(acteur, id);
  const batiments = autorise(acteur, id, "lire", "lieux") ? listerBatiments(acteur, id) : [];
  const types = listerReference("ref_type_montant");
  const sources = listerReference("ref_source_donnee").filter((s) => s.code !== "suggestion_ia");
  const confiances = listerReference("ref_confiance").filter((c) => c.code !== "a_renseigner");
  const statutsLigne = listerReference("ref_statut_ligne");
  const peutEcrire = autorise(acteur, id, "ecrire", "budget");
  const choixBatiments = batiments.map((b) => ({ code: b.id, libelle: b.nom }));

  // Ici la liste est vide seulement si le dossier n'a aucun scénario. Seul qui peut en créer un est
  // invité à le faire.
  if (scenarios.length === 0) {
    return (
      <Vide>
        {autorise(acteur, id, "ecrire", "scenarios") ? (
          <>
            Le budget se tient par scénario : créez d&apos;abord un scénario (même unique) dans <Link href={`/dossiers/${id}/scenarios`} className="underline">Scénarios</Link>.
          </>
        ) : (
          "Le budget se tient par scénario, et ce dossier n'en a pas encore."
        )}
      </Vide>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <p className="text-xs text-neutral-500">
        Montants en euros, stockés en centimes entiers. Un poste sans montant est « à renseigner » et ne compte jamais pour zéro. Référence d&apos;un poste : le plus élevé entre le montant prévu (engagement, sinon devis, sinon estimation) et le total facturé ; une fois le poste soldé, le total facturé.
        {!voitScenarios && " Votre accès ne comprend pas les scénarios : ils sont désignés ici par un numéro."}
      </p>
      {scenarios.map((s) => {
        const synthese = syntheseScenario(acteur, s.id);
        const siens = postes.filter((p) => p.scenarioId === s.id);
        return (
          <Section key={s.id} titre={s.statut ? `${s.nom} — ${libelle(statutsScenario, s.statut)}` : s.nom}>
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
                <table className="w-full min-w-[640px] text-sm [&_td]:pr-3 [&_th]:pr-3">
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
                          {p.solde && <Pastille>soldé</Pastille>}
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
            {siens.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-neutral-600">Postes détaillés ({siens.length})</summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {siens.map((p) => {
                    const batiment = batiments.find((b) => b.id === p.batimentId);
                    // Un poste ne se solde qu'avec une facture retenue : sans elle, rien n'est proposé.
                    const aUneFacture = synthese.postes.some((sp) => sp.posteId === p.id && sp.factureCentimes !== null);
                    return (
                      <li key={p.id} className="flex flex-col gap-1 border-t border-neutral-100 py-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{p.nom}</span>
                          {p.solde && <Pastille>soldé</Pastille>}
                          {p.categorie && <span className="text-neutral-500">{p.categorie}</span>}
                          {batiment && <span className="text-neutral-500">bâtiment : {batiment.nom}</span>}
                        </div>
                        {peutEcrire && !p.solde && aUneFacture && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-neutral-500">Solder le poste</summary>
                            <FormulaireAction action={actionSolderPoste} bouton="Solder" compact className="mt-1 text-neutral-900">
                              <input type="hidden" name="dossierId" value={id} />
                              <input type="hidden" name="posteId" value={p.id} />
                              <p className="w-full text-neutral-600">Solder un poste, c&apos;est dire qu&apos;aucune autre facture n&apos;est attendue : sa référence devient son total facturé.</p>
                              <Champ label="Motif (obligatoire)" large>
                                <input name="motif" required className={classeSaisie} placeholder="ex. facture finale reçue" />
                              </Champ>
                            </FormulaireAction>
                          </details>
                        )}
                        {peutEcrire && p.solde && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-neutral-500">Rouvrir le poste</summary>
                            <FormulaireAction action={actionRouvrirPoste} bouton="Rouvrir" compact className="mt-1 text-neutral-900">
                              <input type="hidden" name="dossierId" value={id} />
                              <input type="hidden" name="posteId" value={p.id} />
                              <p className="w-full text-neutral-600">Un poste rouvert attend de nouveau des factures : sa référence redevient le plus élevé entre le prévu et le facturé.</p>
                              <Champ label="Motif (obligatoire)" large>
                                <input name="motif" required className={classeSaisie} placeholder="ex. facture complémentaire annoncée" />
                              </Champ>
                            </FormulaireAction>
                          </details>
                        )}
                        {peutEcrire && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-neutral-500">Corriger le poste</summary>
                            <FormulaireAction action={actionModifierPoste} bouton="Enregistrer" compact className="mt-1 text-neutral-900">
                              <input type="hidden" name="dossierId" value={id} />
                              <input type="hidden" name="posteId" value={p.id} />
                              <Champ label="Nom" large>
                                <input name="nom" required defaultValue={p.nom} className={classeSaisie} />
                              </Champ>
                              <Champ label="Catégorie">
                                <input name="categorie" defaultValue={p.categorie ?? ""} className={classeSaisie} />
                              </Champ>
                              {batiments.length > 0 && (
                                <Champ label="Bâtiment">
                                  <Select name="batimentId" options={choixBatiments} defaultValue={p.batimentId ?? ""} vide="— aucun —" />
                                </Champ>
                              )}
                            </FormulaireAction>
                          </details>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </details>
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
                        {l.documentId && voitDocuments && (
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
                            <QuestionSource name="source" sources={sources} defaultValue={l.source} />
                            <QuestionConfiance name="confiance" confiances={confiances} defaultValue={l.confiance} />
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
                    {batiments.length > 0 && (
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
                    )}
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
                      <QuestionSource name="source" sources={sources} defaultValue="estimation" />
                      <QuestionConfiance name="confiance" confiances={confiances} vide={REPONSE_HABITUELLE} />
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
