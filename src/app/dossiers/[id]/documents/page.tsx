import Link from "next/link";
import { obtenirActeurPourSection } from "@/lib/acteur-courant";
import { autorise } from "@/lib/acces";
import { listerDocuments } from "@/lib/documents";
import { listerScenarios } from "@/lib/dossiers";
import { listerBatiments, listerLieux, listerPieces } from "@/lib/structure";
import { listerPostes } from "@/lib/budget";
import { listerIdees } from "@/lib/idees";
import { listerTaches } from "@/lib/taches";
import { listerReference, libelle } from "@/lib/references";
import { actionDeposerDocument } from "../../actions";
import { FormulaireAction } from "@/components/FormulaireAction";
import { Champ, Pastille, Section, Select, Vide, classeSaisie, formaterDate } from "@/components/ui";
import { formaterTaille } from "@/domain/mesure";

export const dynamic = "force-dynamic";

export default async function PageDocuments({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acteur = await obtenirActeurPourSection(id, "documents");
  const documents = listerDocuments(acteur, id);
  const types = listerReference("ref_type_document");
  const peutEcrire = autorise(acteur, id, "ecrire", "documents");
  const lit = (s: Parameters<typeof autorise>[3]) => autorise(acteur, id, "lire", s);
  const scenarios = lit("scenarios") ? listerScenarios(acteur, id) : [];
  const lieux = lit("lieux") ? listerLieux(acteur, id) : [];
  const batiments = lit("lieux") ? listerBatiments(acteur, id) : [];
  const pieces = lit("lieux") ? listerPieces(acteur, id) : [];
  const postes = lit("budget") ? listerPostes(acteur, id) : [];
  const idees = lit("idees") ? listerIdees(acteur, id) : [];
  const taches = lit("taches") ? listerTaches(acteur, id) : [];

  const choix = (name: string, label: string, options: Array<{ id: string; nom: string }>) =>
    options.length > 0 && (
      <Champ label={label}>
        <select name={name} className={classeSaisie} defaultValue="">
          <option value="">— aucun —</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nom}
            </option>
          ))}
        </select>
      </Champ>
    );

  return (
    <div className="flex flex-col gap-8">
      <Section titre="Documents et photos" sousTitre="Le fichier original est conservé tel quel, localement, nommé par identifiant. Chaque document se classe par lieu, bâtiment, pièce, scénario, poste, idée ou action.">
        {documents.length === 0 && <Vide>Aucun document.</Vide>}
        <ul className="flex flex-col gap-2 text-sm">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-neutral-200 bg-white px-3 py-2">
              <div>
                <Link href={`/dossiers/${id}/documents/${d.id}`} className="font-medium underline">
                  {d.nomOriginal}
                </Link>
                <Pastille>{libelle(types, d.typeDocument)}</Pastille>
                <p className="text-xs text-neutral-500">
                  {d.dateDocument ? `daté du ${formaterDate(d.dateDocument)}` : "date du document : à renseigner"} · déposé le {formaterDate(d.createdAt)} · {formaterTaille(d.tailleOctets)}
                  {d.scenarioId && ` · ${scenarios.find((s) => s.id === d.scenarioId)?.nom ?? "scénario"}`}
                  {d.posteId && ` · poste ${postes.find((p) => p.id === d.posteId)?.nom ?? ""}`}
                  {d.pieceId && ` · ${pieces.find((p) => p.id === d.pieceId)?.nom ?? "pièce"}`}
                </p>
              </div>
              <a href={`/api/fichiers/${d.id}`} target="_blank" rel="noreferrer" className="text-xs underline">
                ouvrir le fichier
              </a>
            </li>
          ))}
        </ul>
        {peutEcrire && (
          <FormulaireAction action={actionDeposerDocument} bouton="Déposer" titre="Déposer un document ou une photo">
            <input type="hidden" name="dossierId" value={id} />
            <div className="flex flex-wrap gap-3">
              <Champ label="Fichier (image, PDF, texte ; 20 Mo max)" large>
                <input name="fichier" type="file" required accept="image/*,application/pdf,text/plain" className={classeSaisie} />
              </Champ>
              <Champ label="Type">
                <Select name="typeDocument" options={types} />
              </Champ>
              <Champ label="Date portée par le document">
                <input name="dateDocument" type="date" className={classeSaisie} />
              </Champ>
            </div>
            <div className="flex flex-wrap gap-3">
              {choix("scenarioId", "Scénario", scenarios)}
              {choix("posteId", "Poste budgétaire", postes)}
              {choix("lieuId", "Lieu", lieux)}
              {choix("batimentId", "Bâtiment", batiments)}
              {choix("pieceId", "Pièce", pieces)}
              {choix("ideeId", "Idée", idees.map((i) => ({ id: i.id, nom: i.titre })))}
              {choix("tacheId", "Action", taches.map((t) => ({ id: t.id, nom: t.description })))}
            </div>
            <Champ label="Note">
              <input name="note" className={classeSaisie} />
            </Champ>
          </FormulaireAction>
        )}
      </Section>
    </div>
  );
}
