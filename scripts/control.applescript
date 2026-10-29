on run
  set runtimeFolder to (POSIX path of (path to me)) & "/Contents/Resources/runtime"
  try
    set nodePath to do shell script "for p in /opt/homebrew/bin/node /usr/local/bin/node; do if [ -x \"$p\" ]; then printf '%s' \"$p\"; exit 0; fi; done; exit 1"
  on error
    display dialog "Node.js est nécessaire. Installe une version 22.13 à 26 avant de continuer." buttons {"Fermer"} default button "Fermer" with title "CCodex Personnel"
    return
  end try
  set commandBase to "PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin " & quoted form of nodePath & " " & quoted form of (runtimeFolder & "/dist/cli/main.js")
  set actionChoice to choose from list {"Vérifier", "Activer Claude dans Codex", "Rétablir le démarrage natif", "Vérifier la connexion", "Vérifier le réseau", "Activer l’accès à distance", "Désactiver l’accès à distance", "Vérifier les mises à jour", "Mode Mac personnel", "Mode projet isolé", "Installer", "Connecter Claude", "Désinstaller", "Lire les limites"} with title "CCodex Personnel" with prompt "Choisis le mode Mac personnel pour les documents entre projets, Git et les commandes réseau. Le mode projet isolé reste disponible." default items {"Vérifier"} OK button name "Continuer" cancel button name "Fermer"
  if actionChoice is false then return
  set chosenAction to item 1 of actionChoice
  try
    if chosenAction is "Vérifier" then
      set resultText to do shell script (commandBase & " secure-check")
      display dialog "Le moteur et les contrôles locaux ont passé la vérification. Le mode Mac personnel utilise les autorisations natives Claude et macOS ; le mode projet isolé conserve ses restrictions. Aucun compte ni message IA n’a été utilisé.\n\nLe mode personnel utilise le moteur Claude officiel installé. Une conversation authentifiée dans Codex reste à vérifier." buttons {"Fermer"} with title "CCodex Personnel"
    else if chosenAction is "Activer Claude dans Codex" then
      do shell script (commandBase & " desktop enable")
      display dialog "Le contrôle de démarrage officiel a réussi. Quitte complètement Codex puis rouvre-le pour retrouver Claude." buttons {"Fermer"} with title "CCodex Personnel"
    else if chosenAction is "Rétablir le démarrage natif" then
      do shell script (commandBase & " desktop disable")
      display dialog "Le démarrage natif est rétabli. Quitte complètement Codex puis rouvre-le. Les conversations et la connexion Claude sont conservées." buttons {"Fermer"} with title "CCodex Personnel"
    else if chosenAction is "Vérifier la connexion" then
      do shell script (commandBase & " secure-auth-check")
      display dialog "La connexion Claude est reconnue dans le mode configuré. Aucun message n’a été envoyé à un modèle." buttons {"Fermer"} with title "CCodex Personnel"
    else if chosenAction is "Vérifier le réseau" then
      do shell script (commandBase & " secure-network-check")
      display dialog "La résolution DNS et HTTPS vers l’API officielle Anthropic fonctionnent dans le mode configuré. Aucun identifiant ni message IA n’a été envoyé." buttons {"Fermer"} with title "CCodex Personnel"
    else if chosenAction is "Activer l’accès à distance" then
      do shell script (commandBase & " app-server daemon enable-remote-control")
      display dialog "Le contrôle à distance est activé. Utilise les réglages Remote de Codex pour l’appairage avec ton appareil." buttons {"Fermer"} with title "CCodex Personnel"
    else if chosenAction is "Désactiver l’accès à distance" then
      do shell script (commandBase & " app-server daemon disable-remote-control")
      display dialog "Le contrôle à distance est désactivé." buttons {"Fermer"} with title "CCodex Personnel"
    else if chosenAction is "Vérifier les mises à jour" then
      set resultText to do shell script (commandBase & " update --check")
      display dialog resultText buttons {"Fermer"} with title "CCodex Personnel"
    else if chosenAction is "Mode Mac personnel" then
      do shell script (commandBase & " access personal")
      display dialog "Mode Mac personnel sélectionné. Claude peut accéder aux dossiers accessibles à ton compte et exécuter des commandes avec réseau. Les autorisations de la conversation et celles de macOS s’appliquent. Quitte et rouvre Codex." buttons {"Fermer"} with title "CCodex Personnel"
    else if chosenAction is "Mode projet isolé" then
      do shell script (commandBase & " access project")
      display dialog "Mode projet isolé sélectionné. Quitte et rouvre Codex pour l’appliquer." buttons {"Fermer"} with title "CCodex Personnel"
    else if chosenAction is "Installer" then
      display dialog "Ferme tes conversations actives et quitte Codex avant de continuer.\n\nL’activation ajoute un lanceur local et une configuration de démarrage réversible. L’application Codex signée reste intacte. Aucune connexion à tes comptes n’est effectuée.\n\nLe mode Mac personnel permet les commandes réseau, Git et les documents entre projets. Tu peux revenir au mode projet isolé depuis cette application." buttons {"Annuler", "Installer"} default button "Installer" cancel button "Annuler" with title "Activer CCodex Secure"
      do shell script (commandBase & " access personal")
      do shell script (commandBase & " setup")
      display dialog "Version locale activée. Utilise maintenant Connecter Claude, puis rouvre Codex et commence dans un projet de test. Choisis un modèle Claude pour une nouvelle conversation." buttons {"Fermer"} with title "CCodex Personnel"
    else if chosenAction is "Connecter Claude" then
      display dialog "La connexion officielle Claude va s’ouvrir dans ton navigateur. Elle utilise un espace séparé et n’importe pas ta connexion habituelle. Termine la connexion dans le navigateur pour revenir ici." buttons {"Annuler", "Continuer"} default button "Continuer" cancel button "Annuler" with title "Connecter Claude"
      with timeout of 600 seconds
        do shell script (commandBase & " auth claude")
      end timeout
      display dialog "La connexion Claude a été vérifiée dans le mode configuré. Rouvre Codex et vérifie un premier échange dans un projet de test." buttons {"Fermer"} with title "CCodex Personnel"
    else if chosenAction is "Désinstaller" then
      display dialog "Quitte Codex avant de continuer. Les lanceurs et réglages de démarrage gérés seront retirés. Les conversations et la connexion Claude dédiées seront conservées dans ~/.ccodex-secure." buttons {"Annuler", "Désinstaller"} default button "Désinstaller" cancel button "Annuler" with title "Retirer CCodex Secure"
      do shell script (commandBase & " uninstall")
      display dialog "Les réglages de démarrage gérés ont été retirés. Tu peux rouvrir Codex." buttons {"Fermer"} with title "CCodex Personnel"
    else
      do shell script "/usr/bin/open " & quoted form of (runtimeFolder & "/README.md")
    end if
  on error errorText number errorNumber
    if errorNumber is -128 then return
    if chosenAction is "Connecter Claude" then
      display dialog "La connexion n’a pas abouti ou a été annulée. Relance Vérifier, assure-toi que la version est installée, puis réessaie Connecter Claude. Aucun détail d’authentification n’est affiché ici." buttons {"Fermer"} with title "CCodex Personnel"
    else
      display dialog errorText buttons {"Fermer"} with title "CCodex Secure — action interrompue"
    end if
  end try
end run
