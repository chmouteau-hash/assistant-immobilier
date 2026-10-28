import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenirActeurPourSection } from "@/lib/acteur-courant";
import { autorise } from "@/lib/acces";
import { obtenirDocument, listerExtractions, type ChampExtraction } from "@/lib/documents";
import { listerScenarios } from "@/lib/dossiers";
import { listerBatiments, listerLieux, listerPieces } from "@/lib/structure";
import { listerPostes } from "@/lib/budget";
import { listerIdees } from "@/lib/idees";
import { listerTaches } from "@/lib/taches";
import { ErreurApplicative } from "@/lib/erreurs";
import { listerReference, libelle } from "@/lib/references";
import { actionModifierDocument, actionProposerExtraction, actionValiderExtraction } from "../../../actions";
import { FormulaireAction } from "@/components/FormulaireAction";
import { Champ, EtiquetteSourceConfiance, Pastille, Section, Select, Vide, classeSaisie, formaterDate } from "@/components/ui";

export const dynamic = "force-dynamic";

const LIBELLES_CHAMP: Record<ChampExtraction, string> = {
  montant_centimes: "Montant (€)",
  date: "Date (AAAA-MM-JJ)",
  fournisseur: "Fournisseur",
  poste: "Poste budgétaire",
  type_montant: "Nature (devis, facture, paiement…)",
};
const ORDRE: ChampExtraction[] = ["montant_centimes", "date", "fournisseur", "poste", "type_montant"];

export default async function PageDocument({ params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const acteur = await obtenirActeurPourSection(id, "documents");
  let document;
  try {
    document = obtenirDocument(acteur, docId);
  } catch (e) {
    if (e instanceof ErreurApplicative) notFound();
    throw e;
  }
  if (document.dossierId !== id) notFound();
  const extractions = listerExtractions(acteur, docId);
  const types = listerReference("ref_type_document");
  const statutsExtraction = listerReference("ref_statut_extraction");
  const typesMontant = listerReference("ref_type_montant").filter((t) => t.code !== "estimation");
  const peutEcrire = autorise(acteur, id, "ecrire", "documents");
  const peutBudget = autorise(acteur, id, "ecrire", "budget");
  const enAttente = extractions.filter((e) => e.statut === "proposee");
  const validees = extractions.filter((e) => e.statut !== "proposee");
  const estImage = document.mime.startsWith("image/");

  // Ce à quoi le document se rattache. Chaque liste n'est lue que si l'acteur peut lire sa section :
  // sans elle, le rattachement n'est ni montré ni proposé, et la correction n'y touche pas.
  const lit = (s: Parameters<typeof autorise>[3]) => autorise(acteur, id, "lire", s);
  const scenarios = lit("scenarios") ? listerScenarios(acteur, id) : [];
  const nomScenario = (scenarioId: string) => scenarios.find((s) => s.id === scenarioId)?.nom;
  const rattachements = [
    { name: "scenarioId", label: "Scénario", valeur: document.scenarioId, options: scenarios.map((s) => ({ code: s.id, libelle: s.nom })) },
    {
      name: "posteId",
      label: "Poste budgétaire",
      valeur: document.posteId,
      // Deux scénarios peuvent porter un poste du même nom : le scénario les départage.
      options: (lit("budget") ? listerPostes(acteur, id) : []).map((p) => ({ code: p.id, libelle: nomScenario(p.scenarioId) ? `${p.nom} (${nomScenario(p.scenarioId)})` : p.nom })),
    },
    { name: "lieuId", label: "Lieu", valeur: document.lieuId, options: (lit("lieux") ? listerLieux(acteur, id) : []).map((l) => ({ code: l.id, libelle: l.nom })) },
    { name: "batimentId", label: "Bâtiment", valeur: document.batimentId, options: (lit("lieux") ? listerBatiments(acteur, id) : []).map((b) => ({ code: b.id, libelle: b.nom })) },
    { name: "pieceId", label: "Pièce", valeur: document.pieceId, options: (lit("lieux") ? listerPieces(acteur, id) : []).map((p) => ({ code: p.id, libelle: p.nom })) },
    { name: "ideeId", label: "Idée", valeur: document.ideeId, options: (lit("idees") ? listerIdees(acteur, id) : []).map((i) => ({ code: i.id, libelle: i.titre })) },
    { name: "tacheId", label: "Action", valeur: document.tacheId, options: (lit("taches") ? listerTaches(acteur, id) : []).map((t) => ({ code: t.id, libelle: t.description })) },
  ].filter((r) => r.options.length > 0);
  const classement = rattachements.flatMap((r) => {
    const choisi = r.options.find((o) => o.code === r.valeur);
    return choisi ? [`${r.label.toLowerCase()} : ${choisi.libelle}`] : [];
  });

  return (
    <div className="flex flex-col gap-8">
      <Link href={`/dossiers/${id}/documents`} className="text-sm text-neutral-500 hover:underline">
        ← Documents
      </Link>
      <Section titre={document.nomOriginal} sousTitre={`${libelle(types, document.typeDocument)} · ${document.mime} · SHA-256 ${document.sha256.slice(0, 12)}…`}>
        <p className="text-sm">
          Date du document : {document.dateDocument ? formaterDate(document.dateDocument) : <Pastille ton="attention">À renseigner</Pastille>} ·{" "}
          <a href={`/api/fichiers/${docId}`} target="_blank" rel="noreferrer" className="underline">
            ouvrir l&apos;original
          </a>
        </p>
        {estImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/fichiers/${docId}`} alt={document.nomOriginal} className="max-h-96 max-w-full rounded border border-neutral-200 object-contain" />
        )}
        {document.note && <p className="text-sm text-neutral-600">{document.note}</p>}
        {classement.length > 0 && <p className="text-sm text-neutral-600">Classé dans : {classement.join(" · ")}</p>}
        {peutEcrire && (
          <details className="text-sm">
            <summary className="cursor-pointer text-neutral-600">Corriger le classement</summary>
            <FormulaireAction action={actionModifierDocument} bouton="Enregistrer" compact className="mt-2">
              <input type="hidden" name="dossierId" value={id} />
              <input type="hidden" name="documentId" value={docId} />
              <Champ label="Type">
                <Select name="typeDocument" options={types} defaultValue={document.typeDocument} />
              </Champ>
              <Champ label="Date portée par le document">
                <input name="dateDocument" type="date" defaultValue={document.dateDocument ?? ""} className={classeSaisie} />
              </Champ>
              {rattachements.map((r) => (
                <Champ key={r.name} label={r.label}>
                  <Select name={r.name} options={r.options} defaultValue={r.valeur ?? ""} vide="— aucun —" />
                </Champ>
              ))}
              <Champ label="Note" large>
                <input name="note" defaultValue={document.note ?? ""} className={classeSaisie} />
              </Champ>
            </FormulaireAction>
          </details>
        )}
      </Section>

      <Section titre="Lecture du document" sousTitre="Principe « validation avant effet » : les champs lus sont proposés, puis validés ou corrigés. Rien n'entre au budget avant.">
        {validees.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {validees.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2">
                <span className="w-56 text-neutral-600">{LIBELLES_CHAMP[e.champ]}</span>
                <span className="font-medium">{e.valeurValidee ?? "—"}</span>
                {e.statut === "corrigee" && <span className="text-xs text-texte-discret italic">(proposé : {e.valeurProposee})</span>}
                <EtiquetteSourceConfiance source={e.source} confiance={e.confiance} />
                <Pastille ton={e.statut === "rejetee" ? "neutre" : "ok"}>{libelle(statutsExtraction, e.statut)}</Pastille>
              </li>
            ))}
          </ul>
        )}

        {enAttente.length > 0 ? (
          peutEcrire && peutBudget ? (
            <FormulaireAction action={actionValiderExtraction} bouton="Valider (après correction éventuelle)" titre="Champs proposés — à vérifier contre l'original">
              <input type="hidden" name="dossierId" value={id} />
              <input type="hidden" name="documentId" value={docId} />
              <div className="flex flex-wrap gap-3">
                {ORDRE.filter((c) => enAttente.some((e) => e.champ === c)).map((c) => {
                  const e = enAttente.find((x) => x.champ === c)!;
                  return (
                    <Champ key={c} label={LIBELLES_CHAMP[c]}>
                      {c === "type_montant" ? (
                        <Select name={c} options={typesMontant} defaultValue={e.valeurProposee ?? ""} vide="— choisir —" />
                      ) : (
                        <input name={c} defaultValue={e.valeurProposee ?? ""} className={classeSaisie} />
                      )}
                      <EtiquetteSourceConfiance source={e.source} confiance={e.confiance} />
                    </Champ>
                  );
                })}
              </div>
              <Champ label="Motif / remarque">
                <input name="motif" className={classeSaisie} />
              </Champ>
              <p className="text-xs text-neutral-500">
                À la validation : ligne de budget créée avec source « document importé », statut « connu », reliée à ce document. Le document doit être rattaché à un scénario (ou à un poste) — sinon la validation le signalera.
              </p>
            </FormulaireAction>
          ) : (
            <Vide>{enAttente.length} champ(s) en attente de validation par une personne autorisée sur le budget.</Vide>
          )
        ) : (
          peutEcrire && (
            <FormulaireAction action={actionProposerExtraction} bouton="Proposer ces champs" titre="Lire le document (saisie humaine)">
              <input type="hidden" name="dossierId" value={id} />
              <input type="hidden" name="documentId" value={docId} />
              <p className="text-xs text-neutral-500">
                Sans IA, c&apos;est vous qui lisez la pièce. Avec l&apos;assistant activé, ses propositions arrivent ici avec la source « suggestion de l&apos;IA » et restent à confirmer (V1 : proposition manuelle seulement, voir améliorations).
              </p>
              <div className="flex flex-wrap gap-3">
                <Champ label={LIBELLES_CHAMP.montant_centimes}>
                  <input name="montant_centimes" className={classeSaisie} placeholder="12 435,67" />
                </Champ>
                <Champ label={LIBELLES_CHAMP.date}>
                  <input name="date" type="date" defaultValue={document.dateDocument ?? ""} className={classeSaisie} />
                </Champ>
                <Champ label={LIBELLES_CHAMP.fournisseur}>
                  <input name="fournisseur" className={classeSaisie} />
                </Champ>
                <Champ label={LIBELLES_CHAMP.poste}>
                  <input name="poste" className={classeSaisie} placeholder="ex. Toiture" />
                </Champ>
                <Champ label={LIBELLES_CHAMP.type_montant}>
                  <Select name="type_montant" options={typesMontant} vide="— selon le type du document —" />
                </Champ>
              </div>
            </FormulaireAction>
          )
        )}
      </Section>
    </div>
  );
}
