import { obtenirActeurPourSection } from "@/lib/acteur-courant";
import { autorise } from "@/lib/acces";
import { listerParticipations, listerPersonnesInvitables } from "@/lib/personnes";
import { listerReference, libelle } from "@/lib/references";
import { LIBELLES_SECTION, SECTIONS } from "@/domain/droits";
import { actionInviterPersonne, actionModifierParticipation, actionRevoquerParticipation } from "../../actions";
import { FormulaireAction } from "@/components/FormulaireAction";
import { Champ, Pastille, Section, Select, Vide, classeSaisie, formaterDateHeure } from "@/components/ui";

export const dynamic = "force-dynamic";

const SECTIONS_PRO = SECTIONS.filter((s) => s !== "droits" && s !== "ia");

function CasesPerimetre({ coches = [] as string[] }) {
  return (
    <fieldset className="flex flex-wrap gap-2 text-xs">
      <legend className="text-neutral-600">Périmètre (professionnel seulement)</legend>
      {SECTIONS_PRO.map((s) => (
        <label key={s} className="flex items-center gap-1">
          <input type="checkbox" name="perimetre" value={s} defaultChecked={coches.includes(s)} /> {LIBELLES_SECTION[s]}
        </label>
      ))}
    </fieldset>
  );
}

export default async function PagePersonnes({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acteur = await obtenirActeurPourSection(id, "personnes");
  const participations = listerParticipations(acteur, id);
  const roles = listerReference("ref_role");
  const peutGerer = autorise(acteur, id, "gerer_droits", "droits");
  const invitables = peutGerer ? listerPersonnesInvitables(acteur, id) : [];

  return (
    <div className="flex flex-col gap-8">
      <Section titre="Personnes et droits" sousTitre="Propriétaire : tout. Contributeur : écrit, sans gérer les droits ni l'IA. Lecteur : lit. Professionnel : lit son périmètre, dépose des documents et des montants.">
        <ul className="flex flex-col gap-2 text-sm">
          {participations.map((p) => (
            <li key={p.id} className={`rounded border border-neutral-200 bg-white p-3 ${p.revoqueeLe ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p>
                  <span className="font-medium">{p.personneNom}</span>
                  {p.profession && <span className="text-neutral-500"> · {p.profession}</span>}
                  {p.personneId === acteur.personneId && <span className="text-xs text-texte-discret italic"> (vous)</span>}
                </p>
                <Pastille ton={p.revoqueeLe ? "neutre" : p.role === "proprietaire" ? "ok" : "attention"}>
                  {p.revoqueeLe ? `révoqué le ${formaterDateHeure(p.revoqueeLe)}` : libelle(roles, p.role)}
                </Pastille>
              </div>
              {p.role === "professionnel" && (
                <p className="text-xs text-neutral-500">
                  Mission : {p.finalite ?? "—"} · voit : {p.perimetre.map((s) => LIBELLES_SECTION[s]).join(", ") || "rien"}
                </p>
              )}
              {peutGerer && !p.revoqueeLe && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-neutral-500">Modifier ou révoquer</summary>
                  <div className="mt-2 flex flex-col gap-3">
                    <FormulaireAction action={actionModifierParticipation} bouton="Modifier" compact>
                      <input type="hidden" name="dossierId" value={id} />
                      <input type="hidden" name="participationId" value={p.id} />
                      <Champ label="Rôle">
                        <Select name="role" options={roles} defaultValue={p.role} />
                      </Champ>
                      <Champ label="Motif">
                        <input name="motif" required className={classeSaisie} />
                      </Champ>
                      <Champ label="Mission">
                        <input name="finalite" defaultValue={p.finalite ?? ""} className={classeSaisie} />
                      </Champ>
                      <CasesPerimetre coches={p.perimetre} />
                    </FormulaireAction>
                    <FormulaireAction action={actionRevoquerParticipation} bouton="Révoquer l'accès" compact>
                      <input type="hidden" name="dossierId" value={id} />
                      <input type="hidden" name="participationId" value={p.id} />
                      <Champ label="Motif de révocation">
                        <input name="motif" required className={classeSaisie} />
                      </Champ>
                    </FormulaireAction>
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
        {peutGerer ? (
          <FormulaireAction action={actionInviterPersonne} bouton="Ajouter" titre="Ajouter une personne au dossier">
            <input type="hidden" name="dossierId" value={id} />
            <div className="flex flex-wrap gap-3">
              {invitables.length > 0 && (
                <Champ label="Personne déjà connue">
                  <select name="personneId" className={classeSaisie} defaultValue="">
                    <option value="">— nouvelle personne —</option>
                    {invitables.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nom}
                        {p.profession ? ` (${p.profession})` : ""}
                      </option>
                    ))}
                  </select>
                </Champ>
              )}
              <Champ label="Nom (si nouvelle)">
                <input name="nom" className={classeSaisie} />
              </Champ>
              <Champ label="Type">
                <select name="type" className={classeSaisie} defaultValue="particulier">
                  <option value="particulier">particulier</option>
                  <option value="professionnel">professionnel</option>
                  <option value="societe">société</option>
                </select>
              </Champ>
              <Champ label="Profession">
                <input name="profession" className={classeSaisie} placeholder="notaire, architecte…" />
              </Champ>
              <Champ label="Rôle dans le dossier">
                <Select name="role" options={roles} defaultValue="lecteur" />
              </Champ>
              <Champ label="Mission (professionnel)">
                <input name="finalite" className={classeSaisie} placeholder="ex. Acte de vente" />
              </Champ>
            </div>
            <CasesPerimetre />
            <p className="text-xs text-neutral-500">
              V1 locale : pas d&apos;envoi d&apos;invitation. Pour voir le dossier « comme » cette personne, utilisez « Vous agissez en tant que » sur l&apos;accueil.
            </p>
          </FormulaireAction>
        ) : (
          <Vide>Seul un propriétaire peut modifier les accès.</Vide>
        )}
      </Section>
    </div>
  );
}
