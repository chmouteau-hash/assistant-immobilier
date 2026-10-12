import Link from "next/link";
import { obtenirActeurPourSection } from "@/lib/acteur-courant";
import { autorise } from "@/lib/acces";
import { listerLieux, listerLieuxVoisins, listerBatiments, listerPieces, objetsNonVides, type Batiment } from "@/lib/structure";
import { listerReference, libelle } from "@/lib/references";
import { formaterSurface } from "@/domain/mesure";
import { formaterAdresseComplete, formaterCommune, formaterCoordonnee, formaterPosition } from "@/domain/geo";
import { NOM_SERVICE_GEOCODAGE } from "@/lib/geocodage";
import {
  actionCreerLieu,
  actionCreerBatiment,
  actionCreerPiece,
  actionModifierSurface,
  actionModifierAdresse,
  actionModifierPosition,
  actionSituerDepuisAdresse,
  actionChercherEndroit,
  actionSituerSurEndroit,
  actionAdresseLaPlusProche,
  actionSituerParClic,
  actionRattacherBatiment,
  actionModifierLieu,
  actionModifierBatiment,
  actionModifierPiece,
  actionRetirerLieu,
  actionRetirerBatiment,
  actionRetirerPiece,
} from "../../actions";
import { FormulaireAction } from "@/components/FormulaireAction";
import { CarteLieux } from "@/components/CarteLieux";
import { RechercheEndroit } from "@/components/RechercheEndroit";
import { REPONSE_HABITUELLE } from "@/domain/provenance";
import { Champ, Pastille, Provenance, QuestionConfiance, QuestionSource, Section, Select, Vide, ancreFicheLieu, classeSaisie } from "@/components/ui";

export const dynamic = "force-dynamic";

const classeNiveau = "text-xs font-medium uppercase tracking-wide text-neutral-500";

// Un lieu contient ses bâtiments, un bâtiment contient ses pièces : l'écran les emboîte dans cet
// ordre. Deux listes séparées, l'une sous l'autre, laissaient douter que les bâtiments fassent
// partie du lieu (issue #14). Un bâtiment se crée donc dans la carte de son lieu ; ceux qui n'en
// ont pas sont montrés à part, avec de quoi les y rattacher. Chaque carte porte un formulaire
// « Corriger » : une faute de frappe ne se rattrapait qu'en supprimant le dossier (issue #22).
// L'adresse, la position et la surface gardent leur propre formulaire, parce qu'elles portent une
// provenance. Chaque carte porte aussi « Retirer », qui n'offre son bouton que pour un objet vide.
//
// La carte des lieux (composant `CarteLieux`) montre un repère par lieu situé. À ne pas confondre
// avec les « cartes » des commentaires ci-dessus, qui sont les encadrés de l'écran. Elle n'est
// montée que si au moins un lieu a une position, ou si l'utilisateur demande à en situer un sur la
// carte : sans cela, l'écran ne demande aucun fond de carte au réseau.
//
// Rien ne part vers le service d'adresses sans un geste (DECISIONS.md, 2026-10-11 et 2026-10-12) :
// l'adresse du lieu, avec son code postal et sa ville, sur « Situer d'après l'adresse » ; le texte
// saisi sur « Chercher » ; le point cliqué en mode « Choisir l'endroit sur la carte ». Ce mode
// s'ouvre par le paramètre `placer` de l'adresse de la page, pour un lieu à la fois : c'est un lien
// ordinaire, lu ici côté serveur.
//
// L'adresse d'un lieu tient en trois champs : la voie, le code postal et la ville (issue #52). Le
// champ de recherche d'un endroit reste visible sur chaque fiche, que le lieu soit situé ou non :
// replié dans « Situer sur la carte », il ne se trouvait pas. Les autres façons de situer un lieu
// restent repliées, sous « Situer sur la carte autrement ».
//
// La carte montre aussi, d'une autre couleur, les lieux situés des autres dossiers que l'acteur
// peut lire (issue #50) : plusieurs biens étudiés dans un même secteur se voient ensemble. Un clic
// sur un repère mène à la fiche du lieu, ici ou dans son dossier : chaque fiche porte une ancre.

// Comment vider un objet, dit sous la phrase de refus : chaque rattachement se change sur l'écran
// de ce qui est rattaché.
const POUR_VIDER = {
  lieu: "Un bâtiment se déplace avec « Changer de lieu ». Un document se reclasse depuis sa fiche, dans Documents.",
  batiment: "Une pièce se déplace avec « Corriger ». Une idée se rattache ailleurs dans Idées, un poste dans Budget (« Postes détaillés »), un document depuis sa fiche, dans Documents.",
  piece: "Un document se reclasse depuis sa fiche, dans Documents.",
};

export default async function PageLieux({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ placer?: string | string[] }> }) {
  const { id } = await params;
  const { placer } = await searchParams;
  const acteur = await obtenirActeurPourSection(id, "lieux");
  const lieux = listerLieux(acteur, id);
  const batiments = listerBatiments(acteur, id);
  const pieces = listerPieces(acteur, id);
  const typesLieu = listerReference("ref_type_lieu");
  const sources = listerReference("ref_source_donnee").filter((s) => s.code !== "suggestion_ia");
  const confiances = listerReference("ref_confiance").filter((c) => c.code !== "a_renseigner");
  const peutEcrire = autorise(acteur, id, "ecrire", "lieux");
  const sansLieu = batiments.filter((b) => !lieux.some((l) => l.id === b.lieuId));
  const choixBatiments = batiments.map((b) => ({ code: b.id, libelle: b.nom }));
  const nonVides = peutEcrire ? objetsNonVides(acteur, id) : {};
  const auMoinsUnSitue = lieux.some((l) => l.position.valeur !== null);
  // Le lieu à situer sur la carte, s'il est bien de ce dossier et si l'acteur peut écrire : sinon
  // le paramètre est ignoré, sans rien dire de plus.
  const lieuAPlacer = peutEcrire && typeof placer === "string" ? (lieux.find((l) => l.id === placer) ?? null) : null;
  const cheminLieux = `/dossiers/${id}/lieux`;
  const carteMontee = auMoinsUnSitue || lieuAPlacer !== null;
  // Les biens des autres dossiers ne se lisent que si la carte s'affiche.
  const voisins = carteMontee ? listerLieuxVoisins(acteur, id) : [];

  // Un objet non vide montre la phrase que le serveur opposerait à une demande directe, à la place
  // du bouton.
  const blocRetrait = (niveau: keyof typeof POUR_VIDER, action: typeof actionRetirerLieu, champ: string, objetId: string, titre: string) => (
    <details className="max-w-full min-w-0">
      <summary className="cursor-pointer text-xs text-neutral-500">{titre}</summary>
      {nonVides[objetId] ? (
        <p className="mt-1 text-xs text-neutral-600">
          {nonVides[objetId]} {POUR_VIDER[niveau]}
        </p>
      ) : (
        <FormulaireAction action={action} bouton="Retirer définitivement" compact className="mt-1">
          <input type="hidden" name="dossierId" value={id} />
          <input type="hidden" name={champ} value={objetId} />
          <p className="w-full text-xs text-neutral-600">Le retrait est définitif. Il reste inscrit au journal d&apos;audit, avec ce qui avait été saisi.</p>
        </FormulaireAction>
      )}
    </details>
  );

  // Les deux questions n'apparaissent qu'une fois la valeur saisie : tant que le champ marqué
  // `valeur-tracee` est vide dans son groupe, une règle CSS les masque (issue #15). Une position
  // demande ses deux champs. Une adresse se contente d'une de ses trois parties (`uneSuffit`) : la
  // ville seule suffit à dire d'où vient l'information.
  const champsProvenance = (prefixe: string, uneSuffit = false) => (
    <div className={uneSuffit ? "hidden group-has-[.valeur-tracee:not(:placeholder-shown)]:contents" : "contents group-has-[.valeur-tracee:placeholder-shown]:hidden"}>
      <QuestionSource name={`${prefixe}Source`} sources={sources} vide="— à choisir —" />
      <QuestionConfiance name={`${prefixe}Confiance`} confiances={confiances} vide={REPONSE_HABITUELLE} />
    </div>
  );

  // Sans `lieuId`, le bâtiment est créé hors de tout lieu : proposé seulement quand le dossier
  // n'a encore aucun lieu.
  const formulaireBatiment = (lieuId: string | null) => (
    <FormulaireAction action={actionCreerBatiment} bouton="Ajouter le bâtiment" titre={lieuId ? undefined : "Nouveau bâtiment"} className="mt-2">
      <input type="hidden" name="dossierId" value={id} />
      {lieuId && <input type="hidden" name="lieuId" value={lieuId} />}
      <div className="flex flex-wrap gap-3">
        <Champ label="Nom" large>
          <input name="nom" required className={classeSaisie} placeholder="ex. Bâtiment ancien, Maison bois" />
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
  );

  const formulaireRattachement = (b: Batiment, bouton: string) => (
    <FormulaireAction action={actionRattacherBatiment} bouton={bouton} compact className="mt-1">
      <input type="hidden" name="dossierId" value={id} />
      <input type="hidden" name="batimentId" value={b.id} />
      <Champ label="Lieu">
        <select name="lieuId" required defaultValue="" className={classeSaisie}>
          <option value="">— choisir —</option>
          {lieux
            .filter((l) => l.id !== b.lieuId)
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.nom}
              </option>
            ))}
        </select>
      </Champ>
    </FormulaireAction>
  );

  const carteBatiment = (b: Batiment) => {
    const siennes = pieces.filter((p) => p.batimentId === b.id);
    const rattache = lieux.some((l) => l.id === b.lieuId);
    const autresLieux = lieux.filter((l) => l.id !== b.lieuId).length;
    return (
      <li key={b.id} className="rounded border border-neutral-200 bg-neutral-50 p-3">
        <p>
          <span className={classeNiveau}>Bâtiment</span> <span className="font-medium">{b.nom}</span>
          {b.type && <span className="text-neutral-500"> · {b.type}</span>}
          {!rattache && lieux.length > 0 && (
            <>
              {" "}
              <Pastille ton="attention">sans lieu</Pastille>
            </>
          )}
        </p>
        <p className="text-neutral-600">
          {b.etat ? `État : ${b.etat}` : "État : à renseigner"} · usage actuel : {b.usageActuel ?? "à renseigner"} · usage envisagé : {b.usageEnvisage ?? "à renseigner"}
        </p>
        {peutEcrire && (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-neutral-500">Corriger le bâtiment</summary>
            <FormulaireAction action={actionModifierBatiment} bouton="Enregistrer" compact className="mt-1">
              <input type="hidden" name="dossierId" value={id} />
              <input type="hidden" name="batimentId" value={b.id} />
              <Champ label="Nom" large>
                <input name="nom" required defaultValue={b.nom} className={classeSaisie} />
              </Champ>
              <Champ label="Type">
                <input name="type" defaultValue={b.type ?? ""} className={classeSaisie} />
              </Champ>
              <Champ label="État">
                <input name="etat" defaultValue={b.etat ?? ""} className={classeSaisie} />
              </Champ>
              <Champ label="Usage actuel">
                <input name="usageActuel" defaultValue={b.usageActuel ?? ""} className={classeSaisie} />
              </Champ>
              <Champ label="Usage envisagé">
                <input name="usageEnvisage" defaultValue={b.usageEnvisage ?? ""} className={classeSaisie} />
              </Champ>
            </FormulaireAction>
          </details>
        )}
        {peutEcrire && !rattache && lieux.length > 0 && formulaireRattachement(b, "Rattacher")}
        {peutEcrire && rattache && autresLieux > 0 && (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-neutral-500">Changer de lieu</summary>
            {formulaireRattachement(b, "Déplacer")}
          </details>
        )}
        {peutEcrire && <div className="mt-1">{blocRetrait("batiment", actionRetirerBatiment, "batimentId", b.id, "Retirer le bâtiment")}</div>}
        <p className="mt-2 text-xs font-medium text-neutral-500">Pièces et espaces</p>
        {siennes.length === 0 ? (
          <p className="text-xs text-neutral-400">Aucune pièce.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {siennes.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 py-1">
                <span>
                  {p.nom}
                  {p.usage && <span className="text-neutral-500"> ({p.usage})</span>} — surface : <Provenance valeur={p.surface} formater={formaterSurface} />
                </span>
                {peutEcrire && (
                  <div className="flex max-w-full min-w-0 flex-wrap justify-end gap-x-4 gap-y-1">
                    <details className="max-w-full min-w-0">
                      <summary className="cursor-pointer text-xs text-neutral-500">Corriger</summary>
                      <FormulaireAction action={actionModifierPiece} bouton="Enregistrer" compact className="mt-1">
                        <input type="hidden" name="dossierId" value={id} />
                        <input type="hidden" name="pieceId" value={p.id} />
                        <Champ label="Nom" large>
                          <input name="nom" required defaultValue={p.nom} className={classeSaisie} />
                        </Champ>
                        <Champ label="Usage">
                          <input name="usage" defaultValue={p.usage ?? ""} className={`${classeSaisie} w-28`} />
                        </Champ>
                        {batiments.length > 1 && (
                          <Champ label="Bâtiment">
                            <Select name="batimentId" options={choixBatiments} defaultValue={p.batimentId} />
                          </Champ>
                        )}
                      </FormulaireAction>
                    </details>
                    <details className="max-w-full min-w-0">
                      <summary className="cursor-pointer text-xs text-neutral-500">Surface</summary>
                      <FormulaireAction action={actionModifierSurface} bouton="Enregistrer" compact className="group mt-1">
                        <input type="hidden" name="dossierId" value={id} />
                        <input type="hidden" name="pieceId" value={p.id} />
                        <Champ label="m² (vide = à renseigner)">
                          <input name="surface" className={`${classeSaisie} valeur-tracee w-24`} placeholder="92,5" />
                        </Champ>
                        {champsProvenance("surface")}
                        <Champ label="Motif">
                          <input name="motif" className={classeSaisie} />
                        </Champ>
                      </FormulaireAction>
                    </details>
                    {blocRetrait("piece", actionRetirerPiece, "pieceId", p.id, "Retirer")}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {peutEcrire && (
          <FormulaireAction action={actionCreerPiece} bouton="Ajouter" compact className="group mt-2">
            <input type="hidden" name="dossierId" value={id} />
            <input type="hidden" name="batimentId" value={b.id} />
            <Champ label="Nouvelle pièce / espace" large>
              <input name="nom" required className={classeSaisie} placeholder="ex. Grande pièce principale, Terrasse" />
            </Champ>
            <Champ label="Usage">
              <input name="usage" className={`${classeSaisie} w-28`} />
            </Champ>
            <Champ label="m²">
              <input name="surface" className={`${classeSaisie} valeur-tracee w-20`} placeholder="12,5" />
            </Champ>
            {champsProvenance("surface")}
          </FormulaireAction>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      <Section
        titre="Lieux, bâtiments, pièces"
        sousTitre="Un lieu (bien candidat, bien acquis, terrain) contient ses bâtiments, un bâtiment contient ses pièces. L'adresse reste « à renseigner » tant qu'elle n'est pas connue."
      >
        {lieux.length === 0 && <Vide>Aucun lieu. En phase de recherche, on peut créer un bien candidat fictif clairement nommé.</Vide>}
        {carteMontee && (
          // `scroll-mt` : le lien « Choisir l'endroit sur la carte » amène ici, sous la barre d'onglets collée.
          <div id="carte-des-lieux" className="scroll-mt-32">
            <CarteLieux
              dossierId={id}
              lieux={lieux.map((l) => ({ id: l.id, nom: l.nom, position: l.position.valeur }))}
              voisins={voisins.map((v) => ({ id: v.id, nom: v.nom, dossierNom: v.dossierNom, lien: `/dossiers/${v.dossierId}/lieux#${ancreFicheLieu(v.id)}`, position: v.position }))}
              peutEcrire={peutEcrire}
              action={actionModifierPosition}
              sources={sources}
              confiances={confiances}
              aPlacer={lieuAPlacer ? { id: lieuAPlacer.id, nom: lieuAPlacer.nom, adresse: formaterAdresseComplete(lieuAPlacer.adresse.valeur, lieuAPlacer.commune.valeur) } : null}
              actionAdresseProche={actionAdresseLaPlusProche}
              actionSituerParClic={actionSituerParClic}
              chemin={cheminLieux}
            />
          </div>
        )}
        {lieux.length > 0 && !auMoinsUnSitue && !lieuAPlacer && (
          <Vide>
            Aucun lieu n&apos;est encore situé : la carte apparaît dès qu&apos;un lieu a une position{peutEcrire ? " (cherchez un endroit dans la fiche du lieu, ou ouvrez « Situer sur la carte autrement »)" : ""}.
          </Vide>
        )}
        <ul className="flex flex-col gap-4 text-sm">
          {lieux.map((l) => {
            const siens = batiments.filter((b) => b.lieuId === l.id);
            return (
              <li key={l.id} id={ancreFicheLieu(l.id)} className="scroll-mt-32 rounded border border-neutral-200 bg-white p-3">
                <p>
                  <span className={classeNiveau}>Lieu</span> <span className="font-medium">{l.nom}</span> <span className="text-neutral-500">· {libelle(typesLieu, l.typeLieu)}</span>
                </p>
                <p>
                  Adresse : <Provenance valeur={l.adresse} formater={(v) => v} />
                  {l.parcelle && <span className="ml-2 text-neutral-500">parcelle {l.parcelle}</span>}
                </p>
                <p>
                  Code postal et ville : <Provenance valeur={l.commune} formater={formaterCommune} />
                </p>
                <p>
                  Position : <Provenance valeur={l.position} formater={formaterPosition} />
                  {l.position.note && <span className="ml-2 text-neutral-500">d&apos;après « {l.position.note} »</span>}
                </p>
                {l.description && <p className="text-neutral-600">{l.description}</p>}
                {peutEcrire && (
                  <RechercheEndroit
                    dossierId={id}
                    lieuId={l.id}
                    adresseActuelle={formaterAdresseComplete(l.adresse.valeur, l.commune.valeur)}
                    actionChercher={actionChercherEndroit}
                    actionSituer={actionSituerSurEndroit}
                  />
                )}
                {peutEcrire && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-neutral-500">Corriger le lieu</summary>
                    <FormulaireAction action={actionModifierLieu} bouton="Enregistrer" compact className="mt-2">
                      <input type="hidden" name="dossierId" value={id} />
                      <input type="hidden" name="lieuId" value={l.id} />
                      <Champ label="Nom" large>
                        <input name="nom" required defaultValue={l.nom} className={classeSaisie} />
                      </Champ>
                      <Champ label="Type">
                        <Select name="typeLieu" options={typesLieu} defaultValue={l.typeLieu} />
                      </Champ>
                      <Champ label="Parcelle">
                        <input name="parcelle" defaultValue={l.parcelle ?? ""} className={classeSaisie} />
                      </Champ>
                      <Champ label="Description libre" large>
                        <textarea name="description" defaultValue={l.description ?? ""} className={classeSaisie} rows={2} />
                      </Champ>
                    </FormulaireAction>
                  </details>
                )}
                {peutEcrire && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-neutral-500">Modifier l&apos;adresse, le code postal ou la ville</summary>
                    <FormulaireAction action={actionModifierAdresse} bouton="Enregistrer" compact className="group mt-2">
                      <input type="hidden" name="dossierId" value={id} />
                      <input type="hidden" name="lieuId" value={l.id} />
                      <Champ label="Adresse : numéro et voie (vide = à renseigner)" large>
                        <input name="adresse" defaultValue={l.adresse.valeur ?? ""} className={`${classeSaisie} valeur-tracee`} placeholder=" " />
                      </Champ>
                      <Champ label="Code postal">
                        <input
                          name="codePostal"
                          inputMode="numeric"
                          autoComplete="off"
                          defaultValue={l.commune.valeur?.codePostal ?? ""}
                          className={`${classeSaisie} valeur-tracee w-28`}
                          placeholder=" "
                        />
                      </Champ>
                      <Champ label="Ville">
                        <input name="ville" defaultValue={l.commune.valeur?.ville ?? ""} className={`${classeSaisie} valeur-tracee`} placeholder=" " />
                      </Champ>
                      {champsProvenance("adresse", true)}
                      <Champ label="Motif">
                        <input name="motif" className={classeSaisie} />
                      </Champ>
                    </FormulaireAction>
                  </details>
                )}
                {peutEcrire && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-neutral-500">Situer sur la carte autrement</summary>
                    <p className="mt-2 text-xs text-neutral-600">
                      <Link href={`${cheminLieux}?placer=${l.id}#carte-des-lieux`} prefetch={false} className="font-medium text-neutral-900 underline">
                        Choisir l&apos;endroit sur la carte
                      </Link>{" "}
                      : vous cliquez à l&apos;endroit du lieu, l&apos;écran montre l&apos;adresse connue la plus proche, puis vous enregistrez.
                    </p>
                    {l.adresse.valeur !== null || l.commune.valeur !== null ? (
                      <FormulaireAction action={actionSituerDepuisAdresse} bouton="Situer d'après l'adresse" compact className="mt-2">
                        <input type="hidden" name="dossierId" value={id} />
                        <input type="hidden" name="lieuId" value={l.id} />
                        <p className="w-full text-xs text-neutral-600">
                          Ce qui est renseigné de l&apos;adresse de ce lieu (voie, code postal, ville), et rien d&apos;autre, est envoyé à la {NOM_SERVICE_GEOCODAGE}, un service public sans compte. La
                          position obtenue est notée « source externe · à confirmer » : vérifiez le repère sur la carte.{l.position.valeur !== null && " Elle remplace la position actuelle."}
                        </p>
                      </FormulaireAction>
                    ) : (
                      <p className="mt-2 text-xs text-neutral-600">
                        Ce lieu n&apos;a ni adresse, ni code postal, ni ville : cherchez l&apos;endroit ci-dessus, choisissez-le sur la carte, ou saisissez sa position ci-dessous.
                      </p>
                    )}
                    <FormulaireAction action={actionModifierPosition} bouton="Enregistrer" compact className="group mt-2">
                      <input type="hidden" name="dossierId" value={id} />
                      <input type="hidden" name="lieuId" value={l.id} />
                      <p className="w-full text-xs text-neutral-600">Ou saisissez la position, en degrés décimaux. Rien ne part sur le réseau.</p>
                      <Champ label="Latitude (vide = à renseigner)">
                        <input
                          name="latitude"
                          defaultValue={l.position.valeur ? formaterCoordonnee(l.position.valeur.latitudeMicrodeg) : ""}
                          className={`${classeSaisie} valeur-tracee w-32`}
                          placeholder="48,868546"
                        />
                      </Champ>
                      <Champ label="Longitude">
                        <input
                          name="longitude"
                          defaultValue={l.position.valeur ? formaterCoordonnee(l.position.valeur.longitudeMicrodeg) : ""}
                          className={`${classeSaisie} valeur-tracee w-32`}
                          placeholder="2,33031"
                        />
                      </Champ>
                      {champsProvenance("position")}
                      <Champ label="Motif">
                        <input name="motif" className={classeSaisie} />
                      </Champ>
                    </FormulaireAction>
                  </details>
                )}
                {peutEcrire && <div className="mt-1">{blocRetrait("lieu", actionRetirerLieu, "lieuId", l.id, "Retirer le lieu")}</div>}
                <div className="mt-3 flex flex-col gap-3 border-l-2 border-neutral-200 pl-3">
                  <p className="text-xs font-medium text-neutral-500">
                    {siens.length === 0 ? "Aucun bâtiment dans ce lieu." : siens.length === 1 ? "1 bâtiment dans ce lieu" : `${siens.length} bâtiments dans ce lieu`}
                  </p>
                  {siens.length > 0 && <ul className="flex flex-col gap-3">{siens.map(carteBatiment)}</ul>}
                  {peutEcrire && (
                    <details open={siens.length === 0}>
                      <summary className="cursor-pointer text-xs text-neutral-500">Ajouter un bâtiment à ce lieu</summary>
                      {formulaireBatiment(l.id)}
                    </details>
                  )}
                </div>
              </li>
            );
          })}
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
            <div className="group flex flex-wrap gap-3">
              <Champ label="Adresse : numéro et voie (facultatif)" large>
                <input name="adresse" className={`${classeSaisie} valeur-tracee`} placeholder=" " />
              </Champ>
              <Champ label="Code postal (facultatif)">
                <input name="codePostal" inputMode="numeric" autoComplete="off" className={`${classeSaisie} valeur-tracee w-28`} placeholder=" " />
              </Champ>
              <Champ label="Ville (facultatif)">
                <input name="ville" className={`${classeSaisie} valeur-tracee`} placeholder=" " />
              </Champ>
              {champsProvenance("adresse", true)}
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

      {(sansLieu.length > 0 || (lieux.length === 0 && peutEcrire)) && (
        <Section
          titre="Bâtiments sans lieu"
          sousTitre={
            lieux.length === 0
              ? "Tant qu'aucun lieu n'existe, un bâtiment n'est rangé nulle part. Créez un lieu pour l'y rattacher."
              : "Ces bâtiments ne sont rangés dans aucun lieu. Rattachez chacun au lieu dont il fait partie."
          }
        >
          {sansLieu.length > 0 && <ul className="flex flex-col gap-3 text-sm">{sansLieu.map(carteBatiment)}</ul>}
          {lieux.length === 0 && peutEcrire && formulaireBatiment(null)}
        </Section>
      )}
    </div>
  );
}
