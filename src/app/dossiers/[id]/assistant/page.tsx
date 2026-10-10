import { obtenirActeurCourant } from "@/lib/acteur-courant";
import { autorise } from "@/lib/acces";
import { obtenirDossier } from "@/lib/dossiers";
import { listerEchanges, perimetreEffectif } from "@/lib/ia";
import { LIBELLES_SECTION, SECTIONS } from "@/domain/droits";
import { SECTIONS_NON_TRANSMISSIBLES } from "@/domain/ia/types";
import { actionConfigurerIA, actionDemanderAssistant } from "../../actions";
import { FormulaireAction } from "@/components/FormulaireAction";
import { Champ, Pastille, Section, Vide, classeSaisie, formaterDateHeure } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PageAssistant({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acteur = await obtenirActeurCourant();
  const dossier = obtenirDossier(acteur, id);
  const peutConfigurer = autorise(acteur, id, "activer_ia", "ia");
  const echanges = listerEchanges(acteur, id);
  const effectif = perimetreEffectif(acteur, dossier);
  const distantDisponible = Boolean(process.env.ANTHROPIC_API_KEY);
  const transmissibles = SECTIONS.filter((s) => !SECTIONS_NON_TRANSMISSIBLES.includes(s));

  return (
    <div className="flex flex-col gap-8">
      <Section titre="Assistant IA (facultatif)" sousTitre="Désactivé par défaut. Il ne reçoit que les sections cochées, sous forme d'agrégats : jamais de nom, d'adresse ni de fichier. Il n'écrit rien dans le dossier.">
        <p className="text-sm">
          État : {dossier.iaActivee ? <Pastille ton="ia">activé · fournisseur « {dossier.iaFournisseur} »</Pastille> : <Pastille>désactivé</Pastille>}
          {dossier.iaActivee && (
            <span className="ml-2 text-neutral-500">
              sections transmises pour vous : {effectif.length === 0 ? "aucune" : effectif.map((s) => LIBELLES_SECTION[s]).join(", ")}
            </span>
          )}
        </p>
        {peutConfigurer && (
          <FormulaireAction action={actionConfigurerIA} bouton="Enregistrer" titre="Configurer pour ce dossier">
            <input type="hidden" name="dossierId" value={id} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="activee" defaultChecked={dossier.iaActivee} /> Activer l&apos;assistant pour ce dossier
            </label>
            <Champ label="Fournisseur">
              <select name="fournisseur" defaultValue={dossier.iaFournisseur} className={classeSaisie}>
                <option value="regles_locales">Règles locales — sans réseau, déterministe, signale ce qui manque</option>
                <option value="anthropic" disabled={!distantDisponible}>
                  Modèle distant (Claude){distantDisponible ? "" : " — ANTHROPIC_API_KEY absente"}
                </option>
              </select>
            </Champ>
            <fieldset className="flex flex-wrap gap-2 text-sm">
              <legend className="text-neutral-600">Sections transmissibles</legend>
              {transmissibles.map((s) => (
                <label key={s} className="flex items-center gap-1">
                  <input type="checkbox" name="perimetre" value={s} defaultChecked={dossier.iaPerimetre.includes(s)} /> {LIBELLES_SECTION[s]}
                </label>
              ))}
            </fieldset>
            <p className="text-xs text-neutral-500">Jamais transmis, quoi qu&apos;il arrive : {SECTIONS_NON_TRANSMISSIBLES.map((s) => LIBELLES_SECTION[s]).join(", ")}.</p>
          </FormulaireAction>
        )}
      </Section>

      <Section titre="Poser une question">
        {dossier.iaActivee ? (
          <FormulaireAction action={actionDemanderAssistant} bouton="Demander" compact>
            <input type="hidden" name="dossierId" value={id} />
            <Champ label="Question" large>
              <input name="question" required defaultValue="Que manque-t-il pour avancer ?" className={classeSaisie} />
            </Champ>
          </FormulaireAction>
        ) : (
          <Vide>L&apos;assistant est désactivé : tout le reste de l&apos;application fonctionne sans lui.</Vide>
        )}
      </Section>

      <Section titre="Réponses" sousTitre="Constat (fait, source, date) → Hypothèse (à valider) → Suggestion (non décisionnelle) → Vérification (par qui, comment).">
        {echanges.length === 0 && <Vide>Aucun échange.</Vide>}
        {echanges.map((e) => (
          <article key={e.id} className="flex flex-col gap-2 rounded border border-violet-200 bg-white p-3 text-sm">
            <header className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-neutral-500">
              <span>
                <strong className="text-neutral-800">{e.question}</strong>
              </span>
              <span>
                {formaterDateHeure(e.createdAt)} · {e.fournisseur}
                {e.modele && ` (${e.modele})`} · sections : {e.perimetre.map((s) => LIBELLES_SECTION[s]).join(", ")}
              </span>
            </header>
            {e.reponse.elements.length === 0 ? (
              <p className="text-neutral-500">Rien à signaler dans le périmètre transmis.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {e.reponse.elements.map((el, i) => (
                  <li key={i} className="rounded bg-violet-50 p-2">
                    <p>
                      <span className="font-medium">Constat :</span> {el.constat.texte}{" "}
                      <Pastille ton={el.incertitude === "faible" ? "ok" : "attention"}>incertitude {el.incertitude}</Pastille>
                      {el.inattendue && <Pastille ton="ia">option inattendue</Pastille>}
                    </p>
                    <p className="text-xs text-neutral-500">
                      Sources : {el.constat.sources.map((s) => `${s.titre}${s.date ? ` (${formaterDateHeure(s.date)})` : " (date inconnue)"}${s.reference ? ` [${s.reference}]` : ""}`).join(" ; ")}
                    </p>
                    {el.hypothese && (
                      <p>
                        <span className="font-medium">Hypothèse (à valider) :</span> {el.hypothese}
                      </p>
                    )}
                    {el.suggestion && (
                      <p>
                        <span className="font-medium">Suggestion (non décisionnelle) :</span> {el.suggestion}
                      </p>
                    )}
                    {el.verification && (
                      <p>
                        <span className="font-medium">Vérification :</span> {el.verification.quoi} — par {el.verification.parQui}, {el.verification.comment}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
            <p className="text-xs text-amber-800">{e.reponse.avertissement}</p>
          </article>
        ))}
      </Section>
    </div>
  );
}
