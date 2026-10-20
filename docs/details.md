# CCodex Personnel pour macOS

Version locale 0.6.0-personal.1, dérivée de gkorepanov/ccodex (base 479aa13d66c9b54685348d0f7b9bdc1c7445a7bf) puis des corrections locales secure.1 à secure.3. Projet indépendant, sans affiliation ni validation OpenAI ou Anthropic. Licence MIT conservée.

## Mode Mac personnel

Ce mode utilise les outils natifs de Claude Code et les autorisations de ton compte macOS. Le moteur n'est plus enfermé dans un profil Seatbelt limité au projet. Il peut lire et rechercher des documents entre tes projets, utiliser Git, installer des dépendances, lancer des commandes avec réseau et démarrer des prévisualisations locales. Les dossiers accessibles sont ceux que macOS autorise au processus ; les permissions Documents, Bureau, accessibilité ou automatisation peuvent nécessiter ton intervention dans les réglages macOS.

En autorisations standard, les écritures et commandes demandent une approbation dans Codex. Le choix explicite Accès complet dans la conversation active le mode natif sans demandes d'approbation. Le choix Lecture seule ou Plan continue d'interdire les écritures et commandes via la politique des outils ; en mode personnel, ce contrôle est logiciel et ne constitue pas une isolation du système de fichiers par le noyau.

Les fichiers personnels, y compris les fichiers de configuration contenant des secrets, peuvent devenir accessibles au moteur lorsque les permissions de la conversation le permettent. Les instructions et fichiers des projets restent des données à examiner, pas une autorisation de lancer des actions externes. La connexion Claude dédiée sous ~/.ccodex-secure/claude est conservée. Les clés, proxys et endpoints du processus parent ne sont pas automatiquement importés.

## Animations et interfaces directement dans Codex

Claude dispose de l'outil mcp__artifacts__publish_html : il enregistre un fragment HTML/CSS/JavaScript dans le dossier de visualisation de la conversation et renvoie la directive d'affichage inline. Il peut ainsi afficher un test d'animation ou une petite interface interactive dans son message, avec des contrôles comme lecture/pause ou vitesse. Exemple de demande : « Crée trois essais de transition et affiche le résultat ici avec un contrôle de vitesse. »

Ces aperçus sont du contenu de réponse, y compris dans une conversation en lecture seule. Ils sont limités à 1 Mo et restent dans le bac à sable de visualisation de Codex : les requêtes API sont bloquées, et seules les ressources statiques des CDN autorisés par Codex peuvent se charger. Pour une application de projet complète, Claude peut lancer un serveur de développement via Bash et fournir son URL locale à ouvrir dans le navigateur intégré de Codex. L'ouverture automatique d'un panneau n'est pas ajoutée par cette passerelle.

## Finder et computer use

Claude peut retrouver des fichiers avec ses outils natifs ou Spotlight, puis ouvrir ou révéler un document dans Finder avec les commandes macOS, selon les autorisations de la conversation. Il peut utiliser AppleScript lorsqu'une tâche le demande et que macOS autorise l'automatisation correspondante.

Le computer use officiel avec vision de l'écran, clics et souris n'est pas disponible dans les sessions non interactives du CLI, comme celles utilisées par le SDK de cette passerelle. Il n'est pas présenté comme activé ici. Documentation officielle : https://code.claude.com/docs/en/computer-use

## Utilisation

Le paquet contient une application CCodex Personnel, avec Vérifier, Vérifier la connexion, Vérifier le réseau, Mode Mac personnel, Mode projet isolé, Installer, Connecter Claude et Désinstaller. L'installation graphique sélectionne le mode personnel. Sur une installation existante, le mode peut être changé sans supprimer les conversations ni refaire la connexion. Quitter complètement Codex et le rouvrir pour charger une nouvelle version ou un changement de mode.

Le mode projet isolé reste disponible : il conserve les restrictions des versions secure, avec commandes sans réseau, fichiers limités au projet et refus d'Accès complet. Le binaire natif Claude reste identifié par SHA-256 et doit correspondre à la version validée 2.1.304. Prérequis : Mac Apple silicon, Node.js 22.13 à 26 et Codex CLI officiel déjà installés.

Le contrôle distant, le relais natif tiers, les transferts automatiques vers GPT, les captures RPC et les mises à jour du registre restent désactivés. Aucun hook, MCP ou plugin externe n'est chargé automatiquement. L'application est signée localement, sans notarisation Apple.

## Validation et développement

Tests sur documents et moteurs factices : lecture et écriture entre projets, Git, accès à un serveur local, changements Standard/Accès complet/Lecture seule, persistance des permissions, génération de fragments et directives de visualisation, conservation des restrictions du mode projet et retour arrière d'installation. Initialisation du vrai SDK avec les outils natifs et le serveur d'aperçu dans un HOME temporaire sans compte ni prompt. Aucun document personnel n'a servi aux tests.

Installer les bibliothèques avec npm ci --ignore-scripts --omit=optional ; lancer npm run check et npm test sur macOS. Les tests de sockets et Seatbelt nécessitent un environnement qui les autorise. Les anciens tests amont sont conservés comme références. Le script scripts/verify-packaged-installation.mjs vérifie l'installation du runtime avec launchctl simulé et un HOME temporaire. Les tests réseau natifs synthétiques sont séparés pour ne pas imposer Internet à la suite locale.

Cette version reste expérimentale. L'échange authentifié complet, les permissions macOS d'automatisation et le rendu depuis une réponse générée par Claude restent à confirmer en usage réel. Le moteur officiel, Node et l'application Codex restent des dépendances de confiance. Le mode personnel offre volontairement des droits plus larges que le mode projet isolé.
