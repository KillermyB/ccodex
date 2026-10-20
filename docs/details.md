# CCodex Secure pour macOS

Version locale 0.5.11-secure.2, dérivée de gkorepanov/ccodex au commit 479aa13d66c9b54685348d0f7b9bdc1c7445a7bf. Projet indépendant, sans affiliation ni validation par OpenAI ou Anthropic. La licence MIT d'origine est conservée.

Cette version permet de choisir Claude dans Codex, avec un moteur Claude Code installé séparément. Elle réduit plusieurs risques de la version originale. Elle reste expérimentale : une conversation authentifiée dans l'application n'a pas encore été validée.

## Utilisation sur le Mac

Le paquet comprend une application « CCodex Secure » qui propose de vérifier les prérequis, d'activer la passerelle, de connecter Claude ou de la désinstaller. Aucune commande n'est à saisir. L'application n'est pas notariée par Apple.

Prérequis de cette construction : Mac Apple silicon, Node.js 22.13 à 26, Codex CLI officiel installé et Claude Code natif 2.1.304. Cette version de Claude a été observée sur le Mac pendant la validation. Les autres versions sont refusées jusqu'à validation explicite.

Commencer par « Vérifier ». Fermer ensuite les conversations actives et quitter Codex avant « Installer ». L'activation modifie les fichiers de démarrage des shells, le lanceur ~/.local/bin/codex et CODEX_CLI_PATH au moyen d'un LaunchAgent dédié. L'application Codex signée reste intacte. Rouvrir Codex après l'activation.

« Connecter Claude » utilise le parcours officiel de connexion dans le navigateur avec une configuration dédiée sous ~/.ccodex-secure/claude. La connexion Claude habituelle n'est pas importée. Commencer avec un projet de test sans données confidentielles. La vérification et l'installation ne lancent aucune requête à un modèle.

## Protections appliquées

- Aucun relais natif tiers, dépendance Rust ou contrôle à distance.
- Aucun titre automatique envoyé à GPT depuis un chat Claude. Les transferts de conversation entre fournisseurs sont refusés ; démarrer un nouveau chat pour changer de fournisseur.
- Aucun agent de délégation Codex ou MCP utilisateur installé. Le seul outil de commandes Claude est fourni par le code local de cette version.
- Le moteur Claude fonctionne dans un profil macOS Seatbelt. Ses outils de fichiers sont limités au projet, avec une politique supplémentaire avant chaque outil. Les commandes passent dans un processus séparé sans réseau, sans accès au trousseau, aux environnements des autres processus et aux identifiants du moteur.
- Les écritures et commandes demandent une approbation. Full Access et les profils inconnus sont refusés. La lecture seule interdit les commandes et écritures et est conservée après réouverture.
- Les configurations Claude utilisateur et projet, MCP externes et skills externes ne sont pas chargés. Les outils natifs Bash, WebFetch, WebSearch, Skill, Agent et Task sont désactivés. Les modules internes du moteur Anthropic restent sous sa responsabilité.
- Les fichiers .env, clés privées et répertoires de configuration sensibles sont bloqués. Les liens symboliques et liens physiques sont refusés par le contrôle des chemins des outils.
- L'environnement du moteur est reconstruit avec une liste explicite. Les clés, proxys et endpoints personnalisés du processus parent ne sont pas transmis. La télémétrie et les mises à jour automatiques Claude sont désactivées par configuration d'environnement.
- L'exécutable Claude est identifié par une empreinte SHA-256 lors de l'installation et vérifié avant chaque lancement. Un changement de binaire impose une nouvelle vérification et installation.
- Pas de capture RPC, ni de rétention portée à cent ans. La rétention Claude par défaut reste sous le contrôle du moteur ; aucune modification du réglage habituel n'est effectuée.
- L'installation utilise les bibliothèques locales du paquet et leur manifeste d'empreintes. Aucun npx, téléchargement de moteur ou mise à jour du registre n'est exécuté par setup/update/uninstall.

## Limites pratiques et risques restants

Le moteur reçoit les messages et les fichiers autorisés pour les traiter chez Anthropic. Son trafic API HTTPS reste nécessaire. Les commandes, elles, ne peuvent pas contacter Internet ni un serveur local ; elles ne peuvent donc pas télécharger des paquets, lancer un serveur de prévisualisation ou utiliser un navigateur. Les dépendances d'un projet doivent être installées séparément par l'utilisateur. Les commandes sont arrêtées après 120 secondes et leur sortie est limitée à 1 Mo.

Les fichiers du projet explicitement autorisés peuvent contenir des données confidentielles sous des noms ordinaires. Aucun détecteur de secrets ne peut garantir leur absence. Les fichiers de configuration protégés, opérations Git, connexions externes, subagents et certaines fonctions avancées du logiciel original sont volontairement indisponibles. Les images à envoyer doivent être placées dans le projet et faire au plus 20 Mo.

Le moteur natif Anthropic et le moteur Codex officiel restent des dépendances de confiance. Leurs binaires n'ont pas été reconstruits ni audités intégralement. Le profil du moteur Claude autorise HTTPS et les services macOS nécessaires à son authentification ; le refus de réseau affiché pour le projet concerne ses commandes. Cette version n'apporte aucune garantie contre un autre programme ayant déjà les mêmes droits que l'utilisateur, ni contre toutes les attaques par concurrence sur les fichiers.

La version durcie a modifié des fonctions importantes du logiciel original. Elle ne doit pas être présentée comme certifiée ou entièrement sûre. Premier usage recommandé sur un projet jetable, avec contrôle des premières approbations et possibilité de désinstallation.

## Validation effectuée

Compilation TypeScript, tests des contrôles d'outils et de chemins, essais macOS réels sur fichiers factices, refus du réseau local, délai de commande, lecture seule persistante, changement de binaire refusé, tests de passerelle avec moteurs factices. L'installation, la désinstallation et le retour arrière après échec ont aussi été vérifiés dans un HOME temporaire avec launchctl simulé. Le moteur Claude Code 2.1.304 a réussi l'initialisation du SDK et du serveur local sécurisé avec une configuration temporaire sans compte et sans prompt.

Aucun échange avec un modèle authentifié, aucune modification d'un projet personnel et aucune activation de la passerelle dans l'environnement utilisateur n'ont été effectués pendant la préparation.

## Développement

Installer les dépendances avec `npm ci --ignore-scripts --omit=optional`, puis utiliser `npm run check` et `npm test` sur macOS. Les anciens tests de fonctionnalités amont restent comme références mais ne font pas partie du contrat de cette version ; plusieurs fonctions ont été retirées. Les nouveaux tests sont dans tests/security. Les tests nécessitent l'accès normal à Seatbelt et aux sockets locaux ; un bac à sable englobant peut empêcher leur exécution.

Ne pas publier le paquet sous le nom npm de l'auteur original. package.json est privé et les workflows de publication ont été retirés.

Le script scripts/verify-packaged-installation.mjs permet de répéter le test du paquet avec Node et l’option --experimental-test-module-mocks, en lui donnant le chemin absolu du runtime. Il remplace launchctl en mémoire et refuse toute utilisation du HOME réel.

Correctif secure.2 : lecture du seul fichier du trousseau de session sélectionné par macOS pour le moteur officiel, afin de retrouver la connexion Claude dédiée. Le dossier complet des trousseaux et ses fichiers voisins ne sont pas ajoutés au profil. Les commandes de projet ne reçoivent pas cette exception et restent sans réseau ni trousseau. Le moteur natif reste une dépendance de confiance : le fichier du trousseau peut contenir d’autres entrées chiffrées ; cette permission système n’est pas un filtrage par entrée. Une vérification de connexion sous isolation est maintenant proposée dans l’application et exécutée après une connexion réussie. Aucun jeton n’est affiché par cette vérification.
