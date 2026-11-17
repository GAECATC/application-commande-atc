# Historique des réponses aux commentaires

## Comportement

Chaque réponse est enregistrée avant de tenter l'envoi : texte, commentaire du
client à cet instant, destinataire utilisé, date UTC et état du mail. Les dates
s'affichent en heure de Paris. Plusieurs réponses restent consultables dans
l'administration et l'historique, après validation ou annulation de la commande.
Le statut « envoyé » signifie que le serveur SMTP a accepté l'envoi ; il ne
prouve pas la réception ni la lecture par le destinataire.

Si l'enregistrement échoue, aucun mail ne part. Si l'envoi échoue ou si sa
confirmation manque, la réponse reste conservée avec un statut explicite.
Il n'y a pas de renvoi automatique. Une interruption peut laisser « en cours ou
interrompu » : vérifier la messagerie avant tout nouvel envoi.

Les mails envoyés avec la version précédente ne peuvent pas être reconstitués
automatiquement : l'application n'en avait conservé aucune copie.

## Installation MySQL — validation humaine obligatoire

Le SQL ajoute uniquement `order_comment_replies`, sans modifier les commandes.
Aucune migration automatique à l'ouverture de la page ou à la compilation.
Après accord humain et récupération du code sur le serveur, exécuter :

```bash
node scripts/migrate-order-replies.js --apply
```

Le script sauvegarde les commandes et leurs lignes dans `data/backups`, relit
le fichier et vérifie son empreinte avant de créer la table. Il s'arrête si la
sauvegarde échoue. Ces sauvegardes restent privées sur le serveur.
Puis exécuter les tests, compiler et redémarrer comme habituellement.

## Retour arrière

Redéployer la version précédente de l'application (commit `69afabc`), compiler
et redémarrer. Garder la nouvelle table et ses réponses : l'ancien code les
ignore. Aucune suppression de table ni restauration des anciennes commandes
n'est nécessaire puisque la migration ne les modifie pas. Ne pas restaurer le
fichier de sauvegarde sur des commandes plus récentes.

## Stockage local

En JSON, les réponses sont rattachées aux commandes existantes. Aucune écriture
sur les données de production n'est exécutée pendant le développement. Le
stockage Supabase historique ne prend pas en charge cet ajout.
