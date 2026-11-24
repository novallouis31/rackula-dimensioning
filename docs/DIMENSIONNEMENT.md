# Greffe « dimensionnement » sur Rackula

Ce dépôt est un **fork de [Rackula](https://github.com/RackulaLives/Rackula)** (MIT, © Gareth Evans) auquel on a greffé le moteur de [`rack-42u-planner`](https://github.com/novallouis31/rack-42u-planner) : calcul TDP/poids/puissance/charge PDU, câbles et étiquettes, exports Excel et CSV pour Google Sheets.

L'interface visuelle de Rackula (glisser-déposer, vraies images d'équipements, import/export NetBox, partage par URL, exports PNG/PDF/SVG) reste **inchangée**.

## Utilisation

1. Ouvrir ou créer un layout Rackula.
2. Cliquer sur le bouton flottant **⚡ Dimensionnement** (en bas à droite).
3. Dans l'onglet _Métadonnées d'équipement_, sélectionner un type et renseigner puissance (W), TDP (W), ampérage PDU (A), tension (V) et montage (horizontal / vertical 0U), puis **Appliquer au type**.
4. Consulter les cartes de synthèse (TDP, BTU/h, poids, puissance, courant, capacité PDU, câbles) et les tableaux _Baies_ et _Câbles_.
5. Exporter :
   - **Excel (.xlsx)** : 6 onglets (Synthèse, Baies, Équipements, Câbles, Étiquettes, Types) ;
   - **CSV Google Sheets** : un ZIP d'un CSV par onglet ;
   - **Étiquettes** : planche HTML imprimable (deux étiquettes par câble).

Le bouton et le dialogue sont chargés **à la demande** : le bundle initial de Rackula reste dans son budget (vérifié par `npm run check:bundle-budget`).

## Modèle de données

Aucune migration de schéma Rackula n'est nécessaire. Les métadonnées sont stockées dans les `custom_fields` déjà supportés par le schéma amont, avec le préfixe `dim.` :

| Emplacement | Clé | Signification |
| --- | --- | --- |
| `DeviceType.custom_fields` | `dim.powerW` | Puissance théorique en W |
|  | `dim.tdpW` | Chaleur rejetée en W (défaut = `powerW`) |
|  | `dim.pduAmps` | Capacité de la PDU en A |
|  | `dim.pduVolts` | Tension de la PDU (défaut 230 V) |
|  | `dim.mount` | `horizontal` ou `vertical` (0U) |
| `PlacedDevice.custom_fields` | les mêmes clés | Surcharge par équipement |
| `Connection.custom_fields` | `dim.cableType` | Forcer un type de câble |
|  | `dim.role` | Rôle / VLAN |
|  | `dim.slackM` | Marge supplémentaire en mètres |
| `layout.dimensioning.settings` | voir `DEFAULT_SETTINGS` | Paramètres de calcul |

Le poids vient du champ natif `DeviceType.weight` / `weight_unit` de Rackula.

## Calcul des câbles

Les câbles sont déduits des **connexions port-à-port de Rackula** : le type est choisi selon les connecteurs des deux ports (RJ45 → Cat6A, SFP+/SFP28/QSFP28 → DAC ou fibre selon la distance, alimentation → C13-C14), et la longueur est estimée par :

```
vertical (écart en U × 44,45 mm) + horizontal + 2 boucles de service
+ marge éventuelle, le tout × facteur de marge, arrondi à 0,5 m
```

Le calcul est une **estimation de cheminement**, pas un routage 3D : ajuster les paramètres du dialogue ou `dim.slackM` selon le site.

## Non-régression

```bash
npm install
npx vitest run src/lib/dimensioning/engine.test.ts   # 10 tests (baie type)
npm run check                                        # 0 erreur, 0 warning
npm run build
npm run check:bundle-budget                          # dans le budget
npm run test:run                                     # suite amont complète
```

Résultat observé sur cet environnement : **4 613 tests passés, 2 échecs** sur 4 615. Ces deux échecs (`layout-json-schema` et un cas de `patch-bay-normal`) sont **préexistants** : ils se reproduisent à l'identique sur un arbre propre au commit amont `58ef6edd`, sans la greffe. Aucun test amont n'a été cassé par l'ajout du module.

La baie de référence (`src/lib/dimensioning/fixtures/reference-layout.ts`, également exportable en `examples/baie-type-rackula.json` pour import dans Rackula) fige les valeurs attendues : 17 équipements, 12 connexions, 19U/42U, 4 730 W de TDP, 273 kg, 64 A de PDU, charge 40,2 %, et la répartition des types de câbles.

## Limites

- Les métadonnées s'éditent au niveau du **type** (pas encore une case par équipement dans l'UI, même si le moteur lit les surcharges par équipement).
- Les paramètres de calcul sont **locaux au dialogue** ; pour les figer dans le layout, ajouter `dimensioning.settings` via le panneau YAML de Rackula.
- Ce fork est une application navigateur : la CLI batch reste dans le dépôt `rack-42u-planner` d'origine.

## Suivi de l'amont

```bash
git remote add upstream https://github.com/RackulaLives/Rackula.git
git fetch upstream
git merge upstream/main
```

Les modifications locales sont volontairement confinées à :

- `src/lib/dimensioning/**` (moteur, exports, tests, fixture) ;
- `src/lib/components/DimensioningDialog.svelte` ;
- deux petits blocs dans `src/App.svelte` (import dynamique + bouton).
