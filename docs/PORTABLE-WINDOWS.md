# Version portable Windows (sans Docker)

Rackula-planner peut fonctionner **sans Docker, sans Node.js et sans droit administrateur** sur n'importe quel PC Windows disposant de PowerShell (fourni par défaut depuis Windows 7).

Le paquet portable contient l'application déjà compilée et un petit serveur HTTP écrit en PowerShell. Il suffit de décompresser le ZIP et de double-cliquer sur le lanceur.

## Téléchargement

Le ZIP est publié dans les **Releases** du dépôt :

<https://github.com/novallouis31/rackula-planner/releases>

Fichier : `rackula-planner-portable-<version>.zip`.

## Démarrage

1. Décompresser le ZIP où vous voulez (par exemple `C:\Outils\Rackula-planner`).
2. Double-cliquer sur **`Lancer-Rackula-Planner.cmd`**.
3. Le navigateur par défaut s'ouvre sur <http://127.0.0.1:8420/>.

Si Windows affiche un avertissement au décompressage (fichier téléchargé depuis Internet) : clic droit sur le ZIP → **Propriétés** → cocher **Débloquer**, puis décompresser à nouveau.

Pour arrêter : `Ctrl+C` dans la fenêtre noire, ou fermer cette fenêtre.

## Pourquoi un serveur local et pas un simple fichier HTML ?

L'application utilise les API de stockage du navigateur (IndexedDB, localStorage) pour l'enregistrement automatique des plans. Ces API ne fonctionnent pas de manière fiable depuis une URL `file://` (origine opaque). Servir l'application sur `http://127.0.0.1` lui donne une origine stable, comme en production, sans exposer le poste au réseau.

Le serveur :

- n'écoute que sur **127.0.0.1** (boucle locale), jamais sur l'interface réseau ;
- ne nécessite **aucun droit administrateur** ni règle pare-feu ;
- ne fait aucune requête sortante ;
- refuse les méthodes autres que `GET`/`HEAD`, les traversées de répertoire (`..`, chemins encodés) et les chemins absolus ;
- ajoute `X-Content-Type-Options: nosniff` et un cache adapté (les fichiers hachés de `app/assets/` sont immuables, `index.html` et `config.js` ne sont jamais mis en cache).

## Données et sauvegarde

Les plans sont stockés **par le navigateur**, pour l'origine `http://127.0.0.1:8420`. Ils ne sont donc pas dans le dossier de l'application.

- Gardez le **même port** (8420 par défaut) pour retrouver vos plans.
- Changer de port crée une origine différente, donc un stockage vide.
- Pour transférer un plan d'un PC à un autre, exportez-le en `.rackula.yaml` depuis l'application, puis importez-le sur l'autre poste.
- Vider les données du navigateur pour ce site efface les plans locaux.

## Options du lanceur

```powershell
# Port different (stockage navigateur distinct)
.\Lancer-Rackula-Planner.ps1 -Port 9000

# Ne pas ouvrir le navigateur (serveur seul)
.\Lancer-Rackula-Planner.ps1 -NoBrowser

# Journaliser chaque requete HTTP
.\Lancer-Rackula-Planner.ps1 -VerboseRequests

# Servir un autre dossier compile
.\Lancer-Rackula-Planner.ps1 -Root D:\Builds\rackula\dist
```

Le fichier `.cmd` accepte les mêmes options :

```bat
Lancer-Rackula-Planner.cmd -Port 9000
```

## Depuis les sources

```powershell
npm install
npm run build
.\Lancer-Rackula-Planner.ps1
```

Le lanceur détecte `app\` (paquet portable) ou `dist\` (build local). Si aucun des deux n'existe et que Node.js est disponible, il lance automatiquement `npm run build`.

Pour fabriquer le paquet portable et son ZIP :

```powershell
.\tools\Build-Portable.ps1
```

Résultat dans `release\` :

```text
release\
  rackula-planner-portable\
    app\
    Lancer-Rackula-Planner.ps1
    Lancer-Rackula-Planner.cmd
    LISEZMOI.txt
    VERSION.txt
    LICENSE
  rackula-planner-portable-<version>.zip
```

## Mise à jour

Remplacer le dossier `app\` par celui d'une nouvelle version. Les données du navigateur restent attachées à l'origine `http://127.0.0.1:8420` et sont donc conservées. En cas de changement de schéma, l'application applique ses migrations habituelles au chargement.

## Limites

- Windows uniquement (le lanceur utilise PowerShell et `TcpListener`).
- Pas de partage multi-utilisateurs ni de comptes : c'est le mode navigateur de Rackula, mono-poste.
- Le serveur est volontairement minimal (fichiers statiques uniquement) : il n'expose pas l'API de stockage serveur, qui reste réservée aux déploiements Docker/LXC.
