# Checklist de lancement

Cette checklist sert à valider une version en production sans créer de données inutiles.

## 1. Contrôles automatiques avant déploiement

```bash
npm ci
npm run lint
npm run build
npm audit
```

Le lint et le build doivent réussir. Ne jamais lancer `npm audit fix --force`
sans vérifier les changements proposés.

## 2. Déploiement

- Vérifier que `main` local et `origin/main` désignent le même commit.
- Déployer tous les fichiers du commit sur Infomaniak.
- Lancer le build Infomaniak.
- Vérifier que la nouvelle version démarre sans erreur dans les logs.

## 3. Test avec le compte client test

- Se connecter avec le compte client test.
- Vérifier la date de livraison.
- Vérifier le classement par catégories et l’ordre alphabétique.
- Vérifier la grille tarifaire affectée au client.
- Vérifier que seuls les produits alloués au client sont proposés.
- Passer une petite commande avec un commentaire explicite contenant le mot `TEST`.
- Vérifier l’email reçu par le client.
- Vérifier l’email reçu par l’administrateur.
- Vérifier la commande et son commentaire dans l’administration.
- Modifier la commande côté client et vérifier les emails.
- Valider la commande côté administrateur.
- Vérifier qu’elle n’est plus modifiable côté client et qu’elle apparaît dans l’historique.
- Ouvrir puis imprimer le bon de livraison.
- Supprimer ou annuler les données de test selon le fonctionnement souhaité.

## 4. Contrôles sur téléphone

- Connexion et déconnexion.
- Lecture du catalogue sans défilement horizontal.
- Ouverture de la zone commentaire.
- Modification des quantités.
- Validation de la commande.
- Consultation de l’historique.

## 5. Sauvegardes

- Dans le Manager Infomaniak, ouvrir `Restauration`.
- Choisir `Restauration avancée`.
- Vérifier que la base `yr74f_commandes_atc` est proposée.
- Vérifier qu’une sauvegarde récente est disponible.
- Ne pas lancer de restauration pendant ce contrôle.

## 6. Après validation

- Conserver le numéro du commit déployé.
- Remettre le dépôt GitHub en privé.
- Surveiller les premières commandes et les emails.
- Reporter la facturation à un chantier séparé.
