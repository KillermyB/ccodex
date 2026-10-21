# CCodex Personnel — macOS

Claude dans l’interface Codex, avec outils natifs, extensions, accès à distance et aperçus interactifs.

**Version : `0.7.0-personal.1` · macOS Apple silicon · Expérimental.**

Fork de [gkorepanov/ccodex](https://github.com/gkorepanov/ccodex), créé par George Korepanov, basé sur [`479aa13`](https://github.com/gkorepanov/ccodex/commit/479aa13d66c9b54685348d0f7b9bdc1c7445a7bf). Licence [MIT](LICENSE) conservée. Projet indépendant d’OpenAI et d’Anthropic.

## Fonctions

| Fonction | Mode Mac personnel | Mode projet isolé |
|---|---|---|
| Fichiers et commandes | Outils natifs Claude, Bash, Git, accès entre dossiers et réseau | Projet sélectionné, shell dédié sous Seatbelt, sans réseau |
| Permissions | Modes natifs Standard, Accès complet, auto et Plan ; lecture seule contrôlée par les outils | Accès complet refusé ; restrictions du projet conservées |
| Extensions | Skills, agents, plugins, hooks et MCP utilisateur/projet/local | Chargement externe désactivé |
| Délégation | Sous-agents Claude et outils MCP Codex | Désactivée |
| Modèle d’une conversation | Passage GPT ↔ Claude avec historique | Changement de fournisseur refusé |
| Aperçus interactifs | Outil `mcp__artifacts__publish_html` et skill de visualisation Codex | Outil non activé |

Le mode personnel utilise les droits du compte macOS. Les autorisations natives s’appliquent ; aucune isolation Seatbelt n’est ajoutée au moteur. Les configurations de projet peuvent exécuter leurs hooks et leurs serveurs MCP. Les extensions utilisateur sont rendues accessibles à la connexion Claude dédiée sans copier ses identifiants de connexion.

## Connexion et contrôle à distance

Le relais amont est rétabli : activation/désactivation, remontée de statut et appairage avec un appareil distant. Les sessions Claude et Codex passent par la même passerelle locale.

- Activation dans les réglages Remote de Codex ou dans l’application **CCodex Personnel → Activer l’accès à distance**.
- Authentification et appairage assurés par le transport Codex amont ; aucune ouverture de serveur TCP public n’est ajoutée.
- Le relais `@gkorepanov/ccodex-relay-darwin-arm64@0.5.11` est fourni dans le paquet, avec une empreinte imposée. Aucune recherche de binaire arbitraire sur le PATH.
- Sources, dépendances et provenance : [relais Rust](relay), [version et empreintes](config/remote-relay.json), [contrôle du binaire](src/security/relay.ts).

La connexion SSH de Codex conserve son lanceur géré. Les services SSH et de partage d’écran de macOS ne sont pas modifiés.

## Aperçus d’animations

`mcp__artifacts__publish_html` publie un fragment HTML/CSS/JavaScript dans le dossier de la conversation et fournit la directive d’affichage Codex.

- Maximum **1 000 000 octets**, sans enveloppes `doctype`, `html`, `head` ou `body`.
- Conversation avec identifiant UUIDv7 requise ; publication possible en lecture seule comme contenu de réponse.
- Les requêtes API du fragment restent bloquées par le bac à sable de visualisation Codex ; seules les ressources statiques des CDN autorisés peuvent se charger.
- Les applications complètes utilisent un serveur local et une URL à ouvrir.

Exemple : « Affiche ici un test de transition avec lecture/pause et un réglage de vitesse. »

## Titres, diagnostics et mises à jour

- **Titres GPT** : le premier message d’une nouvelle conversation est transmis au modèle Codex de titrage, y compris pour une conversation Claude. Mettre `rename_prompt = ""` pour désactiver ce comportement.
- **Captures RPC** : les échanges sont enregistrables localement. Elles sont activées dans les réglages personnels fournis ; mettre `rpc_capture = false` pour les couper. Ces fichiers peuvent contenir du texte de conversations et des données sensibles.
- **Mises à jour** : le fork utilise ses propres releases GitHub, avec contrôle de la somme de l’archive et du manifeste de tous les fichiers. L’extraction refuse liens et traversées de chemins. Le contrôle automatique a lieu au plus toutes les six heures au démarrage d’une interface ; mettre `auto_update = false` pour le désactiver. La nouvelle version est chargée après fermeture et réouverture de Codex.
- Le moteur Claude suit son installation native en mode personnel. Le blocage par empreinte d’une ancienne version reste propre au mode projet isolé.

Les réglages sont dans `~/.ccodex-secure/config.toml`. [Exemple](examples/config.toml).

## Installation

Prérequis : Mac Apple silicon, Node.js `>=22.13 <27`, application et CLI Codex officiels, binaire officiel Claude Code installé séparément. SDK utilisé : `0.3.296` ; moteur validé localement : `2.1.304`.

1. Télécharger le paquet macOS depuis les [releases de ce fork](https://github.com/KillermyB/ccodex/releases).
2. Quitter Codex, ouvrir **CCodex Personnel**, puis choisir **Installer**.
3. Choisir **Connecter Claude** et terminer la connexion officielle dans le navigateur.
4. Vérifier la connexion et le réseau, puis rouvrir Codex et sélectionner un modèle Claude.

L’application est signée localement, sans notarisation Apple. L’installation conserve l’application Codex signée et ajoute des lanceurs réversibles. La désinstallation conserve les conversations et la connexion dédiées. Le nom technique `@gkorepanov/ccodex` est conservé pour les chemins ; ce fork n’est pas publié sur npm.

## Validation et limites

**37 tests dédiés réussis localement** : permissions, fichiers entre projets, Git, serveur local, extensions, délégation MCP, cycle d’appairage sur relais factice, récupération après panne et validation des archives de mise à jour. [Tests](tests/security) · [CI macOS](.github/workflows/ci.yml).

```sh
npm ci --ignore-scripts --omit=optional
npm run check
npm run check:public-tree
npm test
# Étape explicite et hors ligne pour préparer le relais après compilation :
node scripts/prepare-remote-relay.mjs /chemin/ccodex-relay-darwin-arm64-0.5.11.tgz
```

L’étape de préparation vérifie l’archive et le binaire ; elle ne les télécharge ni ne les exécute. L’activation exige un runtime complet avec son manifeste `BUNDLE-SHA256.json`.

- L’appairage réel depuis un téléphone et le rendu d’un aperçu généré par Claude restent à confirmer en usage réel. Les tests n’envoient pas de message à un modèle avec un compte utilisateur.
- Le relais est le binaire précompilé amont, vérifié par empreinte mais non reconstruit indépendamment. Les avis de sécurité des dépendances de son lockfile Rust restent applicables ; ces dépendances n’ont pas été corrigées dans cette version.
- Le contrôle visuel écran/souris n’est pas intégré. Finder, Spotlight et AppleScript dépendent des permissions macOS.
- Les sources et scripts historiques de construction Linux, de migration `0.4 → 0.5` et de préparation des releases sont restaurés. Ils ne sont pas exécutés automatiquement sur les données utilisateur. La publication npm sous le compte de l’auteur original n’est pas activée ; la distribution de ce fork passe par ses releases GitHub.
