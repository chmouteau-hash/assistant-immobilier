import Link from "next/link";
import { obtenirActeurCourant } from "@/lib/acteur-courant";
import { obtenirDossier, listerScenarios, listerDecisions } from "@/lib/dossiers";
import { autorise, sectionsVisibles } from "@/lib/acces";
import { notFound, redirect } from "next/navigation";
import type { Section as SectionDroit } from "@/domain/droits";
import { comparaisonDossier } from "@/lib/budget";
import { classementDossier } from "@/lib/taches";
import { listerLieux } from "@/lib/structure";
import { formaterAdresseComplete } from "@/domain/geo";
import { LIBELLES_CONFIANCE, reserveDeConfiance } from "@/domain/provenance";
import { listerReference, libelle } from "@/lib/references";
import { formaterMontant } from "@/lib/montant";
import { actionModifierDossier, actionSupprimerDossier } from "../actions";
import { FormulaireAction } from "@/components/FormulaireAction";
import { Champ, Pastille, Section, Select, Vide, ancreFicheLieu, classeSaisie, formaterDateHeure } from "@/components/ui";

export const dynamic = "force-dynamic";

// Première section lisible pour un acteur qui ne voit pas l'identité du dossier (professionnel
// limité) : on l'y envoie plutôt que de lui montrer une page vide.
const ROUTE_PAR_SECTION: Partial<Record<SectionDroit, string>> = {
  lieux: "lieux",
  idees: "idees",
  scenarios: "scenarios",
  budget: "budget",
  documents: "documents",
  taches: "actions",
  personnes: "personnes",
};

export default async function PageVueEnsemble({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acteur = await obtenirActeurCourant();
  if (!autorise(acteur, id, "lire", "identite")) {
    const premiere = sectionsVisibles(acteur, id).find((s) => ROUTE_PAR_SECTION[s]);
    if (premiere) redirect(`/dossiers/${id}/${ROUTE_PAR_SECTION[premiere]}`);
    notFound();
  }
  const dossier = obtenirDossier(acteur, id);
  const types = listerReference("ref_type_projet");
  const stades = listerReference("ref_stade");
  const statutsScenario = listerReference("ref_statut_scenario");
  const peutEcrire = autorise(acteur, id, "ecrire", "identite");
  const peutExporter = autorise(acteur, id, "exporter", "identite");
  const peutSupprimer = autorise(acteur, id, "supprimer_dossier", "identite");
  const voitBudget = autorise(acteur, id, "lire", "budget") && autorise(acteur, id, "lire", "scenarios");
  const voitTaches = autorise(acteur, id, "lire", "taches");
  // Les lieux ne se montrent qu'à qui peut lire leur section (issue #54) : un résumé, la fiche
  // complète et sa provenance restent dans l'onglet Lieux.
  const voitLieux = autorise(acteur, id, "lire", "lieux");
  const lieux = voitLieux ? listerLieux(acteur, id) : [];
  const typesLieu = listerReference("ref_type_lieu");

  const comparaison = voitBudget ? comparaisonDossier(acteur, id) : null;
  const classement = voitTaches ? classementDossier(acteur, id) : null;
  const decisions = autorise(acteur, id, "lire", "scenarios") ? listerDecisions(acteur, id).slice(0, 5) : [];
  const scenarios = autorise(acteur, id, "lire", "scenarios") ? listerScenarios(acteur, id) : [];

  return (
    <div className="flex flex-col gap-8">
      <Section titre="Identité du dossier" sousTitre="Tout peut rester « à renseigner » ; rien n'est inventé.">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-neutral-500">Type de projet</dt>
          <dd>{dossier.typeProjet ? libelle(types, dossier.typeProjet) : <Pastille ton="attention">À renseigner</Pastille>}</dd>
          <dt className="text-neutral-500">Stade</dt>
          <dd>{dossier.stade ? libelle(stades, dossier.stade) : <Pastille ton="attention">À renseigner</Pastille>}</dd>
          <dt className="text-neutral-500">Objectif</dt>
          <dd>{dossier.objectif ?? <Pastille ton="attention">À renseigner</Pastille>}</dd>
          <dt className="text-neutral-500">Marge d&apos;imprévus</dt>
          <dd>{(dossier.tauxImprevusPourMille / 10).toLocaleString("fr-FR")} % du total de référence (paramètre du dossier, pas une norme)</dd>
        </dl>
        {peutEcrire && (
          <FormulaireAction action={actionModifierDossier} bouton="Mettre à jour" titre="Modifier">
            <input type="hidden" name="dossierId" value={id} />
            <div className="flex flex-wrap gap-3">
              <Champ label="Nom" large>
                <input name="nom" defaultValue={dossier.nom} required className={classeSaisie} />
              </Champ>
              <Champ label="Type de projet">
                <Select name="typeProjet" options={types} defaultValue={dossier.typeProjet ?? ""} vide="— à renseigner —" />
              </Champ>
              <Champ label="Stade">
                <Select name="stade" options={stades} defaultValue={dossier.stade ?? ""} vide="— à renseigner —" />
              </Champ>
              <Champ label="Imprévus (%)">
                <input name="tauxImprevusPourcent" defaultValue={(dossier.tauxImprevusPourMille / 10).toString()} className={`${classeSaisie} w-20`} />
              </Champ>
            </div>
            <Champ label="Objectif">
              <input name="objectif" defaultValue={dossier.objectif ?? ""} className={classeSaisie} />
            </Champ>
          </FormulaireAction>
        )}
      </Section>

      {voitLieux && (
        <Section titre="Lieux" sousTitre="Les biens et terrains du dossier. Les bâtiments, les pièces et la carte sont dans l'onglet « Lieux, bâtiments, pièces ».">
          {lieux.length === 0 ? (
            <Vide>Aucun lieu. Un lieu s&apos;ajoute dans l&apos;onglet « Lieux, bâtiments, pièces ».</Vide>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {lieux.map((l) => {
                const adresse = formaterAdresseComplete(l.adresse.valeur, l.commune.valeur);
                const reserve = reserveDeConfiance([l.adresse, l.commune]);
                return (
                  <li key={l.id} className="rounded border border-neutral-200 bg-white p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span>
                        <span className="font-medium">{l.nom}</span> <span className="text-neutral-500">· {libelle(typesLieu, l.typeLieu)}</span>
                      </span>
                      <Link href={`/dossiers/${id}/lieux#${ancreFicheLieu(l.id)}`} prefetch={false} className="text-xs font-medium underline">
                        Voir sa fiche
                      </Link>
                    </div>
                    <p className="mt-1">
                      {adresse === null ? (
                        <Pastille ton="attention">Adresse à renseigner</Pastille>
                      ) : (
                        <span className="inline-flex flex-wrap items-center gap-1">
                          <span>{adresse}</span>
                          {reserve && <Pastille ton="attention">{LIBELLES_CONFIANCE[reserve]}</Pastille>}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-neutral-500">{l.position.valeur === null ? "Pas encore situé sur la carte" : "Situé sur la carte"}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}

      {comparaison && (
        <Section titre="Scénarios en un coup d'œil" sousTitre="Totaux de référence : par poste, le plus élevé entre le prévu et le facturé ; le facturé seul une fois le poste soldé.">
          {comparaison.lignes.length === 0 ? (
            <Vide>Aucun scénario. Un dossier simple (une chambre à refaire) peut n&apos;en avoir qu&apos;un.</Vide>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {comparaison.lignes.map((l) => (
                <li key={l.scenarioId} className="rounded border border-neutral-200 bg-white p-3 text-sm">
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium">{l.nom}</span>
                    <Pastille>{libelle(statutsScenario, l.statut)}</Pastille>
                  </div>
                  <p className="mt-1">
                    {l.synthese.totalReferenceCentimes === null ? (
                      <Pastille ton="attention">Aucun montant</Pastille>
                    ) : (
                      <>
                        {formaterMontant(l.synthese.totalReferenceCentimes)}
                        {!l.synthese.complet && <Pastille ton="attention">partiel : {l.synthese.nbPostesARenseigner} poste(s) à renseigner</Pastille>}
                        {l.synthese.nbPostesSurEstimation > 0 && <Pastille ton="attention">{l.synthese.nbPostesSurEstimation} sur estimation</Pastille>}
                      </>
                    )}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {l.nbHypothesesOuvertes} hypothèse(s) à valider · {l.nbIdeesRetenues} idée(s) retenue(s) · {l.nbTachesOuvertes} action(s) ouverte(s)
                  </p>
                </li>
              ))}
            </ul>
          )}
          {comparaison.reserve && <p className="text-sm text-amber-800">{comparaison.reserve}</p>}
        </Section>
      )}

      {classement && (
        <Section titre="Liste du jour" sousTitre="Ce dossier seulement.">
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            {(["aujourdhui", "aDebloquer", "aExplorer"] as const).map((cle) => (
              <div key={cle} className="rounded border border-neutral-200 bg-white p-3">
                <p className="font-medium">{{ aujourdhui: "Aujourd'hui", aDebloquer: "À débloquer", aExplorer: "À explorer" }[cle]}</p>
                {classement[cle].length === 0 ? (
                  <p className="text-texte-discret italic">Rien.</p>
                ) : (
                  <ul className="mt-1 list-disc pl-4">
                    {classement[cle].slice(0, 5).map((t) => (
                      <li key={t.id}>{t.description}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {(peutExporter || peutSupprimer) && (
        <Section titre="Vos données" sousTitre="Portabilité et effacement : tout le dossier, rien d'autre.">
          {peutExporter && (
            <p className="text-sm">
              <a href={`/api/dossiers/${id}/export`} className="underline">
                Exporter le dossier complet (.zip)
              </a>
              <span className="text-neutral-500"> : données table par table (JSON), fichiers déposés, journal d&apos;audit. Archive à conserver sur un support privé.</span>
            </p>
          )}
          {peutSupprimer && (
            <details className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
              <summary className="cursor-pointer font-medium text-red-800">Supprimer définitivement ce dossier</summary>
              <p className="mt-2 text-red-900">
                Efface tout : lieux, scénarios, budget, documents et photos (fichiers compris), actions, échanges avec l&apos;assistant, et le journal d&apos;audit du dossier. Il ne reste qu&apos;une trace sans contenu (date, acteur, motif). Faites un export avant si vous voulez garder une copie.
              </p>
              <FormulaireAction action={actionSupprimerDossier} bouton="Supprimer définitivement" compact className="mt-3">
                <input type="hidden" name="dossierId" value={id} />
                <Champ label={`Retapez le nom : ${dossier.nom}`} large>
                  <input name="confirmationNom" required className={classeSaisie} autoComplete="off" />
                </Champ>
                <Champ label="Motif" large>
                  <input name="motif" required className={classeSaisie} />
                </Champ>
              </FormulaireAction>
            </details>
          )}
        </Section>
      )}

      {scenarios.length > 0 && (
        <Section titre="Dernières décisions" sousTitre="Chaque décision garde son motif, ses alternatives et ses conditions ouvertes.">
          {decisions.length === 0 ? (
            <Vide>Aucune décision enregistrée. Retenir ou écarter un scénario ou une idée en crée une.</Vide>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {decisions.map((d) => (
                <li key={d.id} className="rounded border border-neutral-200 bg-white px-3 py-2">
                  <span className="font-medium">{d.choix}</span> — {d.motif}
                  {d.conditionsOuvertes && <span className="text-amber-800"> · conditions ouvertes : {d.conditionsOuvertes}</span>}
                  <span className="ml-2 text-xs text-texte-discret italic">{formaterDateHeure(d.dateDecision)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}
