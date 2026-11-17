# Plusieurs adresses e-mail par client

Dans l'onglet Clients, « Ajouter une adresse » ajoute un champ. Enregistrer les
clients après modification. Les adresses existantes restent utilisables telles
quelles. Les doublons sont supprimés à l'enregistrement ; une adresse invalide
ou une liste dépassant 255 caractères (séparateurs compris) est refusée.
Cette limite conserve le stockage MySQL actuel : aucune migration ni dépendance.

Les confirmations, modifications, validations et réponses aux commentaires
partent à toutes les adresses du client. La trace des réponses conserve la liste
des destinataires. Les contacts du même client figurent ensemble dans « À ».
La redirection ORDER_TEST_EMAIL des mails de commande du client-test est conservée.

Dans Disponibilités, choisir les clients comme habituellement, puis cocher les
adresses souhaitées sous « Destinataires du mail de disponibilité ». Toutes sont
cochées par défaut ; la sélection est propre à cet envoi et n'altère pas les
contacts enregistrés ni les destinataires des confirmations de commande.
Le choix reste présent après l'enregistrement de la liste. Changer de sélection
de clients ou modifier leurs adresses réinitialise le choix des destinataires.

Le serveur refuse les adresses non enregistrées pour le client. Une sélection
vide est refusée et ne déclenche jamais un envoi à toutes les adresses.
Un refus SMTP partiel n'est pas affiché comme un succès intégral. Vérifier la
messagerie avant un nouvel envoi pour éviter les doublons.

Déploiement habituel : récupérer le code, exécuter les tests et la compilation,
puis redémarrer l'application. Aucune saisie d'adresses de production n'est
effectuée pendant le développement ; faire un essai avec le client de test.
