# Paquet portable Windows

Ce dossier est **généré** par `tools/Build-Portable.ps1`. Il est publié dans le dépôt pour permettre un accès direct sans passer par la page Releases.

- `rackula-planner-portable/` : paquet décompressé, prêt à l'emploi ;
- `rackula-planner-portable-<version>.zip` : la même chose sous forme d'archive.

## Démarrage

Double-cliquer sur `rackula-planner-portable/Lancer-Rackula-Planner.cmd`.

Aucun Docker, aucun Node.js, aucun droit administrateur. Le lanceur démarre un mini serveur HTTP en boucle locale sur <http://127.0.0.1:8420/> et ouvre le navigateur.

## Régénérer le paquet

```powershell
.\tools\Build-Portable.ps1
```

Le ZIP est également joint à la Release GitHub : <https://github.com/novallouis31/rackula-planner/releases>.

## Données

Les plans sont stockés par le navigateur (IndexedDB) pour l'origine `http://127.0.0.1:8420`. Conserver le même port pour les retrouver, et exporter régulièrement les layouts en `.rackula.yaml` pour la sauvegarde et le transfert vers un autre poste.

Documentation complète : [`docs/PORTABLE-WINDOWS.md`](../docs/PORTABLE-WINDOWS.md).
