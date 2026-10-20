on run
  set runtimeFolder to (POSIX path of (path to me)) & "/Contents/Resources/runtime"
  try
    set nodePath to do shell script "for p in /opt/homebrew/bin/node /usr/local/bin/node; do if [ -x \"$p\" ]; then printf '%s' \"$p\"; exit 0; fi; done; exit 1"
  on error
    display dialog "Node.js est nécessaire. Installe une version 22.13 à 26 avant de continuer." buttons {"Fermer"} default button "Fermer" with title "CCodex Secure"
    return
  end try
  set commandBase to "PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin " & quoted form of nodePath & " " & quoted form of (runtimeFolder & "/dist/cli/main.js")
  set actionChoice to choose from list {"Vérifier", "Vérifier la connexion", "Installer", "Connecter Claude", "Désinstaller", "Lire les limites"} with title "CCodex Secure" with prompt "Version locale expérimentale. Choisis d’abord Vérifier. Les commandes de l’IA restent sans réseau." default items {"Vérifier"} OK button name "Continuer" cancel button name "Fermer"
  if actionChoice is false then return
  set chosenAction to item 1 of actionChoice
  try
    if chosenAction is "Vérifier" then
      set resultText to do shell script (commandBase & " secure-check")
      display dialog "Le moteur et les restrictions macOS ont passé la vérification locale. Aucun compte ni message IA n’a été utilisé.\n\nClaude Code requis : 2.1.304. Une conversation authentifiée dans Codex reste à vérifier." buttons {"Fermer"} with title "CCodex Secure"
    else if chosenAction is "Vérifier la connexion" then
      do shell script (commandBase & " secure-auth-check")
      display dialog "La connexion Claude est reconnue sous les protections macOS. Aucun message n’a été envoyé à un modèle." buttons {"Fermer"} with title "CCodex Secure"
    else if chosenAction is "Installer" then
      display dialog "Ferme tes conversations actives et quitte Codex avant de continuer.\n\nL’activation ajoute un lanceur local et une configuration de démarrage réversible. L’application Codex signée reste intacte. Aucune connexion à tes comptes n’est effectuée.\n\nLes commandes IA ne pourront pas télécharger de dépendances ni démarrer une prévisualisation réseau." buttons {"Annuler", "Installer"} default button "Installer" cancel button "Annuler" with title "Activer CCodex Secure"
      do shell script (commandBase & " setup")
      display dialog "Version locale activée. Utilise maintenant Connecter Claude, puis rouvre Codex et commence dans un projet de test. Choisis un modèle Claude pour une nouvelle conversation." buttons {"Fermer"} with title "CCodex Secure"
    else if chosenAction is "Connecter Claude" then
      display dialog "La connexion officielle Claude va s’ouvrir dans ton navigateur. Elle utilise un espace séparé et n’importe pas ta connexion habituelle. Termine la connexion dans le navigateur pour revenir ici." buttons {"Annuler", "Continuer"} default button "Continuer" cancel button "Annuler" with title "Connecter Claude"
      with timeout of 600 seconds
        do shell script (commandBase & " auth claude")
      end timeout
      display dialog "La connexion Claude a été vérifiée sous les protections macOS. Rouvre Codex et vérifie un premier échange dans un projet de test." buttons {"Fermer"} with title "CCodex Secure"
    else if chosenAction is "Désinstaller" then
      display dialog "Quitte Codex avant de continuer. Les lanceurs et réglages de démarrage gérés seront retirés. Les conversations et la connexion Claude dédiées seront conservées dans ~/.ccodex-secure." buttons {"Annuler", "Désinstaller"} default button "Désinstaller" cancel button "Annuler" with title "Retirer CCodex Secure"
      do shell script (commandBase & " uninstall")
      display dialog "Les réglages de démarrage gérés ont été retirés. Tu peux rouvrir Codex." buttons {"Fermer"} with title "CCodex Secure"
    else
      do shell script "/usr/bin/open " & quoted form of (runtimeFolder & "/README.md")
    end if
  on error errorText number errorNumber
    if errorNumber is -128 then return
    if chosenAction is "Connecter Claude" then
      display dialog "La connexion n’a pas abouti ou a été annulée. Relance Vérifier, assure-toi que la version est installée, puis réessaie Connecter Claude. Aucun détail d’authentification n’est affiché ici." buttons {"Fermer"} with title "CCodex Secure"
    else
      display dialog errorText buttons {"Fermer"} with title "CCodex Secure — action interrompue"
    end if
  end try
end run
