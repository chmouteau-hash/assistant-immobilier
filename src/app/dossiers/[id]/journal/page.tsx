import { obtenirActeurPourSection } from "@/lib/acteur-courant";
import { journalAudit } from "@/lib/dossiers";
import { listerToutesPersonnes } from "@/lib/personnes";
import { Section, Vide, formaterDateHeure } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PageJournal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acteur = await obtenirActeurPourSection(id, "droits");
  const journal = journalAudit(acteur, id);
  const personnes = listerToutesPersonnes();
  const nom = (pid: string | null) => personnes.find((p) => p.id === pid)?.nom ?? pid ?? "—";

  // À la souris, le tableau tient dans la largeur disponible et les valeurs longues de
  // « Changements » passent à la ligne : sa barre de défilement, tout en bas d'un long journal,
  // était hors de vue et la colonne « Motif » coupée (issue #29). Au doigt, il garde sa largeur
  // minimale et défile seul.
  return (
    <Section titre="Journal d'audit" sousTitre="En ajout seul, garanti par la base : qui a changé quoi, quand, pourquoi. Les refus d'accès y figurent aussi.">
      {journal.length === 0 ? (
        <Vide>Aucun événement.</Vide>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs pointer-coarse:min-w-[720px] [&_td]:pr-3 [&_th]:pr-3">
            <thead className="text-left text-neutral-500">
              <tr>
                <th className="py-1">Quand</th>
                <th>Qui</th>
                <th>Entité</th>
                <th>Action</th>
                <th>Changements</th>
                <th>Motif</th>
              </tr>
            </thead>
            <tbody>
              {journal.map((e) => (
                <tr key={e.id} className={`border-t border-neutral-200 align-top ${e.action === "acces_refuse" ? "bg-red-50" : ""}`}>
                  <td className="py-1 whitespace-nowrap">{formaterDateHeure(e.dtEvenement)}</td>
                  <td>{nom(e.acteurId)}</td>
                  <td>{e.nomEntite}</td>
                  <td>{e.action}</td>
                  <td className="wrap-anywhere">{e.changements?.map((c) => `${c.champ} : ${c.avant ?? "—"} → ${c.apres ?? "—"}`).join(" ; ")}</td>
                  <td>{e.motif}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
