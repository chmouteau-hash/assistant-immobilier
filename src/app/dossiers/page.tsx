import Link from "next/link";
import { obtenirActeurCourant } from "@/lib/acteur-courant";
import { listerDossiers } from "@/lib/dossiers";
import { listerLieuxParDossier } from "@/lib/structure";
import { formaterCommune } from "@/domain/geo";
import { listerReference, libelle } from "@/lib/references";
import { actionCreerDossier } from "./actions";
import { FormulaireAction } from "@/components/FormulaireAction";
import { Champ, Select, classeSaisie } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PageDossiers() {
  const acteur = await obtenirActeurCourant();
  const dossiers = listerDossiers(acteur);
  // Les lieux de chaque dossier dont l'acteur peut lire la section « lieux » (issue #54). Un
  // dossier absent de cette liste n'affiche rien : ce n'est pas « aucun lieu ».
  const lieuxParDossier = listerLieuxParDossier(acteur);
  const types = listerReference("ref_type_projet");
  const stades = listerReference("ref_stade");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <Link href="/" className="text-sm text-neutral-500 hover:underline">
        ← Accueil
      </Link>
      <h1 className="text-xl font-semibold">Mes dossiers</h1>
      <p className="text-sm text-neutral-500">Vous voyez les dossiers auxquels <strong>{acteur.nom}</strong> participe.</p>

      {dossiers.length === 0 ? (
        <p className="text-neutral-500">Aucun dossier pour l&apos;instant.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {dossiers.map((d) => {
            const lieux = lieuxParDossier.get(d.id);
            return (
              <li key={d.id}>
                <Link href={`/dossiers/${d.id}`} className="block rounded-lg border border-neutral-200 bg-white p-3 hover:border-neutral-400">
                  <span className="font-medium">{d.nom}</span>
                  <span className="ml-2 text-sm text-neutral-500">
                    {libelle(types, d.typeProjet)} · {libelle(stades, d.stade)}
                  </span>
                  {lieux && (
                    <span className="mt-1 block text-sm text-neutral-600">
                      {lieux.length === 0 ? "Aucun lieu pour l'instant" : `Lieux : ${lieux.map((l) => (l.commune ? `${l.nom} (${formaterCommune(l.commune)})` : l.nom)).join(", ")}`}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <FormulaireAction action={actionCreerDossier} bouton="Créer le dossier" titre="Nouveau dossier">
        <p className="text-xs text-neutral-500">Seul le nom est obligatoire : tout le reste peut rester « à renseigner » et se compléter au fil du projet.</p>
        <Champ label="Nom">
          <input name="nom" required className={classeSaisie} placeholder="ex. Lieu à acheter pour y habiter" />
        </Champ>
        <div className="flex flex-wrap gap-3">
          <Champ label="Type de projet (facultatif)">
            <Select name="typeProjet" options={types} vide="— à renseigner —" />
          </Champ>
          <Champ label="Stade de départ (facultatif)">
            <Select name="stade" options={stades} vide="— à renseigner —" />
          </Champ>
        </div>
        <Champ label="Objectif (facultatif)">
          <input name="objectif" className={classeSaisie} />
        </Champ>
      </FormulaireAction>
    </main>
  );
}
