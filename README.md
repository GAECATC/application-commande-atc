# Application commandes Ferme ATC

Application web complète pour gérer les commandes professionnelles légumes et bières.

## Fonctions

- Portail client avec connexion par partenaire et code d'accès.
- Catalogue séparé en `Légumes` et `Bières`.
- Commande en un clic avec total estimé.
- Calcul automatique de la prochaine récolte:
  - lundi matin: commandes jusqu'au dimanche soir;
  - jeudi matin: commandes jusqu'au mercredi soir.
- Espace administrateur protégé par mot de passe.
- Gestion du catalogue: ajout, prix, stock, visibilité.
- Récapitulatif cumulé des récoltes, imprimable ou exportable en PDF via le navigateur.

## Lancement local

1. Installer Node.js 20 LTS.
2. Installer les dépendances:

```bash
npm install
```

3. Créer `.env.local`:

```bash
ADMIN_PASSWORD=un-mot-de-passe-solide
```

4. Lancer:

```bash
npm run dev
```

5. Ouvrir:

- Portail client: `http://localhost:3000`
- Admin: `http://localhost:3000/admin`

Sans Supabase, les données sont stockées dans `data/db.json`. C'est suffisant pour tester et travailler en local.

## Codes partenaires initiaux

Tarif épicerie:

- Épicerie du Coin: `EPICERIE`
- La Fourmiliène: `FOURMILIENE`
- L'Auberge Savoyarde: `AUBERGE`
- Biocoop Mâcher: `BIOMACHER`
- Les Halles de Chartreuse: `HALLESCHARTREUSE`
- Coclich'haut: `COCLIPCHO`

Tarif Mercuriale 2026 La Ravoire:

- Satoriz La Ravoire: `SATORIZRAVOIRE`
- Satoriz Chambéry: `SATORIZCHAMBERY`
- Biocoop Pont-de-Beauvoisin: `BIOPONTBEAUVOISIN`

Client de test:

- Client test: identifiant `client-test`, code `TESTCLIENT`, email `atraverschamps73@gmail.com`

Les noms/orthographes peuvent être corrigés dans `data/seed.json` avant la première création locale de `data/db.json`, ou dans Supabase après déploiement.

## Déploiement gratuit recommandé: Vercel + Supabase Free

Le stockage JSON local n'est pas persistant sur Vercel. Pour une application réellement utilisable par tes clients, active Supabase.

1. Créer un projet gratuit sur Supabase.
2. Aller dans `SQL Editor`.
3. Coller et exécuter le contenu de `supabase/schema.sql`.
4. Coller et exécuter ensuite le contenu de `supabase/seed-data.sql`.
5. Récupérer dans Supabase:
   - `Project URL`
   - `service_role key`
6. Créer un projet Vercel connecté à ce dépôt.
7. Ajouter les variables d'environnement Vercel:

```bash
ADMIN_PASSWORD=un-mot-de-passe-solide
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=ey...
```

8. Déployer.

## Points de sécurité

- La clé `SUPABASE_SERVICE_ROLE_KEY` doit rester uniquement côté serveur dans Vercel.
- Ne jamais l'exposer dans du code frontend.
- Les codes partenaires sont simples: adaptés à un portail pro léger, mais pas à une application bancaire ou RH.
- Change `ADMIN_PASSWORD` avant tout déploiement public.

## Emails de confirmation

L'application peut envoyer un email de confirmation lors de la création ou de la modification d'une commande.
Si la configuration SMTP est absente, la commande reste enregistrée et l'email est simplement ignoré.

Variables nécessaires:

```bash
SMTP_HOST=mail.infomaniak.com
SMTP_PORT=465
SMTP_USER=adresse@domaine.fr
SMTP_PASSWORD=mot-de-passe-mail-ou-application
ORDER_EMAIL_FROM=adresse@domaine.fr
ORDER_TEST_EMAIL=adresse-de-test@domaine.fr
```

`ORDER_TEST_EMAIL` est optionnel. S'il est défini, les emails du client `client-test` sont envoyés à cette adresse.

## Tarifs par boutique

Chaque boutique est reliée à une grille tarifaire:

- les boutiques épicerie utilisent `Tarif épicerie`;
- Satoriz La Ravoire, Satoriz Chambéry et Biocoop Pont-de-Beauvoisin utilisent `Mercuriale 2026 La Ravoire`.

Le client ne voit que les produits qui ont un prix dans sa grille. Le total de commande et le récapitulatif admin utilisent le prix réellement appliqué au moment de la commande.

## Limites connues

- Les commandes ne décrémentent pas automatiquement le stock. Le stock sert d'indication et de limite de saisie côté client.
- Il n'y a pas encore d'annulation de commande côté client.
- Le PDF est généré via `Imprimer / PDF`, ce qui reste le mécanisme gratuit le plus robuste.
