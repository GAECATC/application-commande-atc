# Migration MySQL/MariaDB Infomaniak

## Principe

- MySQL/MariaDB est utilise seulement si `MYSQL_HOST`, `MYSQL_DATABASE`, `MYSQL_USER` et `MYSQL_PASSWORD` sont definis.
- Sans ces variables, l'application garde le stockage JSON `data/db.json`.
- `data/db.json` reste la sauvegarde de rollback tant que la migration n'est pas validee.

## Sauvegarde obligatoire avant migration

Sur le serveur Infomaniak :

```bash
cd ~/sites/commandes.atraverschamps73.fr
mkdir -p backups
cp data/db.json backups/db-$(date +%Y%m%d-%H%M%S).json
```

Verifier ensuite que le fichier existe :

```bash
ls -lh backups/
```

## Variables serveur attendues

Dans `.env.local` cote serveur :

```bash
MYSQL_HOST=
MYSQL_PORT=3306
MYSQL_DATABASE=
MYSQL_USER=
MYSQL_PASSWORD=
```

## Import JSON vers MySQL

Depuis le dossier applicatif serveur, apres sauvegarde :

```bash
npm run db:import:mysql
```

Pour importer un fichier precis :

```bash
npm run db:import:mysql -- backups/db-YYYYMMDD-HHMMSS.json
```

## Verification minimale

Apres import et redemarrage Infomaniak, verifier :

- connexion admin ;
- connexion `client-test` ;
- produits visibles ;
- creation d'une commande test ;
- modification d'une commande ;
- validation d'une commande ;
- bon de livraison ;
- emails ;
- historique.

## Rollback

Si la migration echoue, retirer ou commenter les variables `MYSQL_*` dans `.env.local`, puis redemarrer l'application Infomaniak. L'application reutilisera `data/db.json`.

Si `data/db.json` a ete abime localement, restaurer la sauvegarde :

```bash
cd ~/sites/commandes.atraverschamps73.fr
cp backups/db-YYYYMMDD-HHMMSS.json data/db.json
```
