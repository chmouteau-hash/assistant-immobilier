import { obtenirActeurCourant } from "@/lib/acteur-courant";
import { autorise } from "@/lib/acces";
import { listerLieux, listerBatiments, listerPieces } from "@/lib/structure";
import { listerReference, libelle } from "@/lib/references";
import { formaterSurface } from "@/domain/mesure";
import { actionCreerLieu, actionCreerBatiment, actionCreerPiece, actionModifierSurface, actionModifierAdresse } from "../../actions";
import { FormulaireAction } from "@/components/FormulaireAction";
import { Champ, Provenance, Section, Select, Vide, classeSaisie } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PageLieux({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acteur = await obtenirActeurCourant();
  const lieux = listerLieux(acteur, id);
  const batiments = listerBatiments(acteur, id);
  const pieces = listerPieces(acteur, id);
  const typesLieu = listerReference("ref_type_lieu");
  const sources = listerReference("ref_source_donnee").filter((s) => s.code !== "suggestion_ia");
  const confiances = listerReference("ref_confiance").filter((c) => c.code !== "a_renseigner");
  const peutEcrire = autorise(acteur, id, "ecrire", "lieux");

  const champsProvenance = (prefixe: string) => (
    <>
      <Champ label="Source">
        <Select name={`${prefixe}Source`} options={sources} vide="— si renseigné —" />
      </Champ>
      <Champ label="Confiance">
        <Select name={`${prefixe}Confiance`} options={confiances} vide="— par défaut selon la source —" />
      </Champ>
    </>
  );

  return (
    <div className="flex flex-col gap-8">
      <Section titre="Lieux" sousTitre="Bien candidat, bien acquis, terrain. L'adresse reste « à renseigner » tant qu'elle n'est pas connue.">
        {lieux.length === 0 && <Vide>Aucun lieu. En phase de recherche, on peut créer un bien candidat fictif clairement nommé.</Vide>}
        <ul className="flex flex-col gap-2 text-sm">
          {lieux.map((l) => (
            <li key={l.id} className="rounded border border-neutral-200 bg-white p-3">
              <p>
                <span className="font-medium">{l.nom}</span> <span className="text-neutral-500">· {libelle(typesLieu, l.typeLieu)}</span>
              </p>
              <p>
                Adresse : <Provenance valeur={l.adresse} formater={(v) => v} />
                {l.parcelle && <span className="ml-2 text-neutral-500">parcelle {l.parcelle}</span>}
              </p>
              {l.description && <p className="text-neutral-600">{l.description}</p>}
              {peutEcrire && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-neutral-500">Modifier l&apos;adresse</summary>
                  <FormulaireAction action={actionModifierAdresse} bouton="Enregistrer" compact className="mt-2">
                    <input type="hidden" name="dossierId" value={id} />
                    <input type="hidden" name="lieuId" value={l.id} />
                    <Champ label="Adresse (vide = à renseigner)" large>
                      <input name="adresse" defaultValue={l.adresse.valeur ?? ""} className={classeSaisie} />
                    </Champ>
                    {champsProvenance("adresse")}
                    <Champ label="Motif">
                      <input name="motif" className={classeSaisie} />
                    </Champ>
                  </FormulaireAction>
                </details>
              )}
            </li>
          ))}
        </ul>
        {peutEcrire && (
          <FormulaireAction action={actionCreerLieu} bouton="Ajouter le lieu" titre="Nouveau lieu">
            <input type="hidden" name="dossierId" value={id} />
            <div className="flex flex-wrap gap-3">
              <Champ label="Nom" large>
                <input name="nom" required className={classeSaisie} placeholder="ex. Bien candidat n°1 (fictif)" />
              </Champ>
              <Champ label="Type">
                <Select name="typeLieu" options={typesLieu} />
              </Champ>
            </div>
            <div className="flex flex-wrap gap-3">
              <Champ label="Adresse (facultatif)" large>
                <input name="adresse" className={classeSaisie} />
              </Champ>
              {champsProvenance("adresse")}
              <Champ label="Parcelle (facultatif)">
                <input name="parcelle" className={classeSaisie} />
              </Champ>
            </div>
            <Champ label="Description libre">
              <textarea name="description" className={classeSaisie} rows={2} />
            </Champ>
          </FormulaireAction>
        )}
      </Section>

      <Section titre="Bâtiments" sousTitre="Description libre : « bâtiment ancien, toiture refaite », « maison bois à côté »…">
        {batiments.length === 0 && <Vide>Aucun bâtiment.</Vide>}
        <ul className="flex flex-col gap-3 text-sm">
          {batiments.map((b) => {
            const siennes = pieces.filter((p) => p.batimentId === b.id);
            const lieu = lieux.find((l) => l.id === b.lieuId);
            return (
              <li key={b.id} className="rounded border border-neutral-200 bg-white p-3">
                <p>
                  <span className="font-medium">{b.nom}</span>
                  {b.type && <span className="text-neutral-500"> · {b.type}</span>}
                  {lieu && <span className="text-neutral-500"> · {lieu.nom}</span>}
                </p>
                <p className="text-neutral-600">
                  {b.etat ? `État : ${b.etat}` : "État : à renseigner"} · usage actuel : {b.usageActuel ?? "à renseigner"} · usage envisagé : {b.usageEnvisage ?? "à renseigner"}
                </p>
                <p className="mt-2 text-xs font-medium text-neutral-500">Pièces et espaces</p>
                {siennes.length === 0 ? (
                  <p className="text-xs text-neutral-400">Aucune pièce.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {siennes.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 py-1">
                        <span>
                          {p.nom}
                          {p.usage && <span className="text-neutral-500"> ({p.usage})</span>} — surface : <Provenance valeur={p.surface} formater={formaterSurface} />
                        </span>
                        {peutEcrire && (
                          <details>
                            <summary className="cursor-pointer text-xs text-neutral-500">Surface</summary>
                            <FormulaireAction action={actionModifierSurface} bouton="Enregistrer" compact className="mt-1">
                              <input type="hidden" name="dossierId" value={id} />
                              <input type="hidden" name="pieceId" value={p.id} />
                              <Champ label="m² (vide = à renseigner)">
                                <input name="surface" className={`${classeSaisie} w-24`} placeholder="92,5" />
                              </Champ>
                              {champsProvenance("surface")}
                              <Champ label="Motif">
                                <input name="motif" className={classeSaisie} />
                              </Champ>
                            </FormulaireAction>
                          </details>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {peutEcrire && (
                  <FormulaireAction action={actionCreerPiece} bouton="Ajouter" compact className="mt-2">
                    <input type="hidden" name="dossierId" value={id} />
                    <input type="hidden" name="batimentId" value={b.id} />
                    <Champ label="Nouvelle pièce / espace" large>
                      <input name="nom" required className={classeSaisie} placeholder="ex. Grande pièce principale, Terrasse" />
                    </Champ>
                    <Champ label="Usage">
                      <input name="usage" className={`${classeSaisie} w-28`} />
                    </Champ>
                    <Champ label="m²">
                      <input name="surface" className={`${classeSaisie} w-20`} />
                    </Champ>
                    {champsProvenance("surface")}
                  </FormulaireAction>
                )}
              </li>
            );
          })}
        </ul>
        {peutEcrire && (
          <FormulaireAction action={actionCreerBatiment} bouton="Ajouter le bâtiment" titre="Nouveau bâtiment">
            <input type="hidden" name="dossierId" value={id} />
            <div className="flex flex-wrap gap-3">
              <Champ label="Nom" large>
                <input name="nom" required className={classeSaisie} placeholder="ex. Bâtiment ancien, Maison bois" />
              </Champ>
              <Champ label="Lieu">
                <select name="lieuId" className={classeSaisie} defaultValue="">
                  <option value="">— aucun —</option>
                  {lieux.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nom}
                    </option>
                  ))}
                </select>
              </Champ>
              <Champ label="Type">
                <input name="type" className={classeSaisie} placeholder="ancien, bois, extension…" />
              </Champ>
            </div>
            <div className="flex flex-wrap gap-3">
              <Champ label="État">
                <input name="etat" className={classeSaisie} placeholder="toiture refaite (à vérifier)" />
              </Champ>
              <Champ label="Usage actuel">
                <input name="usageActuel" className={classeSaisie} />
              </Champ>
              <Champ label="Usage envisagé">
                <input name="usageEnvisage" className={classeSaisie} />
              </Champ>
            </div>
          </FormulaireAction>
        )}
      </Section>
    </div>
  );
}
