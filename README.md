# CCodex Personnel — macOS

Passerelle permettant d’utiliser Claude dans l’interface de l’application Codex, avec deux modes d’accès au Mac et un outil d’aperçu interactif.

**Version : `0.6.0-personal.1` · Plateforme : macOS Apple silicon · Statut : expérimental.**

Fork de [gkorepanov/ccodex](https://github.com/gkorepanov/ccodex), créé par George Korepanov, basé sur le commit [`479aa13`](https://github.com/gkorepanov/ccodex/commit/479aa13d66c9b54685348d0f7b9bdc1c7445a7bf). Licence [MIT](LICENSE) conservée. Projet indépendant, sans affiliation avec OpenAI ou Anthropic.

## Modes d’accès

| Fonction | Mac personnel | Projet isolé |
|---|---|---|
| Fichiers | Dossiers accessibles au compte macOS, y compris entre projets | Projet sélectionné, avec exclusion des chemins sensibles |
| Commandes | Bash natif, Git, installation de dépendances | Outil shell dédié sous Seatbelt |
| Réseau des commandes | Autorisé | Bloqué |
| Accès complet | Disponible sur sélection explicite dans Codex | Refusé |
| Aperçus interactifs | Outil `mcp__artifacts__publish_html` | Outil non activé |
| Isolation du moteur | Permissions macOS et contrôles logiciels des outils | Profil Seatbelt macOS |

En mode personnel, les écritures et commandes demandent une approbation avec les autorisations standard. **Accès complet** supprime ces demandes côté moteur. **Lecture seule / Plan** interdit les écritures et commandes via la politique des outils ; ce contrôle logiciel ne constitue pas une isolation du système de fichiers par le noyau.

Le mode personnel permet l’accès à des fichiers sensibles accessibles au compte utilisateur. Les permissions macOS restent applicables, notamment pour Documents, Bureau et l’automatisation d’applications.

## Modifications par rapport au projet d’origine

- **Installation macOS réversible** : application de contrôle, lanceurs locaux, restauration des réglages de démarrage et désinstallation. L’application Codex signée n’est pas modifiée. [Code](src/management/commands.ts).
- **Moteur officiel installé séparément** : version Claude Code `2.1.304` exigée à l’activation ; chemin et empreinte SHA-256 enregistrés localement. Un changement du binaire bloque son lancement jusqu’à une nouvelle validation. [Code](src/security/engine.ts).
- **Connexion dédiée** : état Claude conservé sous `~/.ccodex-secure/claude`. Vérification du statut sans appel de modèle. Correction de l’accès ciblé au trousseau en mode isolé. [Authentification](src/security/authentication.ts), [trousseau](src/security/keychain.ts).
- **DNS et HTTPS en mode isolé** : autorisation du résolveur macOS et du certificat racine public système, avec vérification TLS maintenue. [Politique](src/security/policy.ts), [diagnostic réseau](src/security/network.ts).
- **Réduction des fonctions externes** : relais natif tiers retiré, contrôle distant et transferts automatiques vers GPT désactivés, captures RPC et mises à jour depuis le registre bloquées. Aucun hook, plugin ou serveur MCP externe chargé automatiquement.
- **Outils natifs en mode personnel** : lecture entre projets, Bash, Git, recherche web et serveurs de prévisualisation. [Configuration du moteur](src/claude/session.ts).
- **Aperçus HTML interactifs** : publication de fragments HTML/CSS/JavaScript dans le dossier de visualisation de la conversation. [Code](src/claude/artifacts.ts).

## Aperçus d’animations et d’interfaces

En mode personnel, `mcp__artifacts__publish_html` enregistre un fragment HTML et renvoie la directive d’affichage pour la réponse Codex.

- Taille maximale : **1 000 000 octets** ; fragment sans enveloppes `doctype`, `html`, `head` ou `body`.
- Chaque aperçu est enregistré dans le dossier de sa conversation. Une conversation avec identifiant UUIDv7 est requise.
- Les aperçus restent disponibles en lecture seule, comme contenu de réponse.
- Le bac à sable de visualisation Codex bloque les requêtes API ; seules les ressources statiques des CDN autorisés peuvent se charger.
- Une application complète utilise un serveur local lancé par Bash et une URL à ouvrir. L’ouverture automatique d’un panneau n’est pas implémentée.

Exemple : « Affiche ici un test de transition avec lecture/pause et un réglage de vitesse. »

## Prérequis et distribution

- Mac Apple silicon.
- Node.js `>=22.13 <27`.
- Application Codex et CLI Codex officiels installés.
- Binaire officiel Claude Code `2.1.304` installé séparément.

**Ce dépôt distribue les sources. Aucun installateur macOS n’est actuellement publié dans les releases GitHub.** Le paquet applicatif a été construit et vérifié localement ; il est signé localement, sans notarisation Apple.

Le nom technique `@gkorepanov/ccodex` est conservé pour la compatibilité des chemins d’installation. Le paquet npm du projet d’origine ne contient pas ces modifications ; `private: true` empêche la publication npm de ce fork.

## Utilisation du paquet macOS

1. Quitter complètement Codex.
2. Ouvrir **CCodex Personnel**, puis choisir **Installer**. L’installation graphique sélectionne le mode personnel.
3. Choisir **Connecter Claude** et terminer la connexion officielle dans le navigateur.
4. Utiliser **Vérifier la connexion** et **Vérifier le réseau**.
5. Rouvrir Codex, créer une conversation et sélectionner un modèle Claude.

Les actions **Mode Mac personnel** et **Mode projet isolé** changent le mode sans effacer la connexion ni les conversations. Quitter puis rouvrir Codex après chaque changement. **Désinstaller** retire les lanceurs et réglages gérés tout en conservant l’état dédié.

L’installation depuis les sources nécessite un runtime compilé avec son manifeste d’intégrité `BUNDLE-SHA256.json` ; les commandes de développement ci-dessous ne produisent pas ce paquet.

## Validation et développement

**30 tests dédiés réussis localement** : permissions, lecture et écriture entre projets, Git, serveur local, publication des aperçus et restrictions du mode isolé. [Tests](tests/security) · [Workflow macOS](.github/workflows/ci.yml).

Contrôles séparés : installation/désinstallation et retour arrière dans un `HOME` temporaire avec `launchctl` simulé ; initialisation du moteur officiel et disponibilité de l’outil d’aperçu sans compte ni prompt. Aucun document personnel utilisé pour ces tests.

```sh
npm ci --ignore-scripts --omit=optional
npm run check
npm run check:public-tree
npm test
```

Les tests de sockets et Seatbelt nécessitent un environnement macOS qui les autorise. Les anciens tests amont sont conservés ; la commande `npm test` exécute la suite dédiée à ce fork.

## Limites connues

- Le rendu d’un aperçu depuis une réponse générée par Claude et un échange authentifié complet restent à confirmer dans Codex.
- Les commandes Finder, Spotlight et AppleScript dépendent des autorisations macOS. Le contrôle visuel écran/souris n’est pas implémenté.
- Les mises à jour de Claude, du SDK ou de Codex peuvent casser la compatibilité. Une modification du binaire Claude exige une nouvelle validation locale.
- Les contrôles d’intégrité et les tests ne constituent pas une certification de sécurité.
