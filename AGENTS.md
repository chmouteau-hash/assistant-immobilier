<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Issues GitHub : structure et cases à cocher

Une issue de réalisation suit le modèle `.github/ISSUE_TEMPLATE/realisation.md` : Objectif, Déjà
livré, Reste à réaliser, Recette, Hors périmètre. Le modèle ne s'applique pas tout seul en ligne de
commande : reprendre cette structure à chaque création ou réécriture d'issue avec `gh`. Un retour
d'utilisation garde son propre modèle (`retour_utilisateur.md`).

- Chaque point est une case : `- [x]` pour ce qui est livré, `- [ ]` pour ce qui reste. La syntaxe
  est stricte (`[x]`, sans espace) : sinon GitHub affiche du texte au lieu d'une case.
- Une case « Déjà livré » se coche sur preuve : le point a été lu dans le code ou essayé, jamais
  supposé.
- Une case « Reste à réaliser » se coche quand la PR qui livre le point est fusionnée.
- Une grosse issue se découpe en blocs numérotés, dans l'ordre conseillé.
- Aucune donnée personnelle dans une issue : ni adresse, ni coordonnées, ni montant réel.

Trois étiquettes disent la nature de l'issue. Comme le modèle, elles ne se posent pas toutes seules
en ligne de commande : ajouter `--label` à `gh issue create`.

- `réalisation` : issue au modèle « Réalisation ».
- `retour` : issue au modèle « Retour d'utilisation ».
- `idée` : piste non engagée ; s'ajoute à `retour` quand le retour est une idée.
- Pas d'étiquette d'avancement : les cases à cocher le disent déjà.
