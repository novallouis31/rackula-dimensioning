# Greffe « dimensionnement » sur Rackula

**Rackula-planner** est un **fork de [Rackula](https://github.com/RackulaLives/Rackula)** (MIT, © Gareth Evans) qui conserve intégralement le déploiement, la bibliothèque de serveurs/équipements et l'interface amont. Il y ajoute le dimensionnement électrique/thermique, la **matrice de câblage**, le calcul des longueurs et les **planches d'étiquettes imprimables**.

Le projet Python autonome `rack-42u-planner` a été supprimé : toutes ses fonctionnalités utiles ont été reportées ici.

## Utilisation

1. Ouvrir ou créer un layout Rackula (glisser-déposer, images réelles, etc.).
2. Cliquer sur le bouton flottant **⚡ Dimensionnement** (en bas à droite).
3. Dans **Nommage & numérotation des ports** :
   - renommer chaque équipement (nom libre, ou proposition automatique `SRV-01`, `SW-01`, `FW-01`, `PDU-A`…) ;
   - cliquer sur **Proposer noms & ports** : chaque port reçoit une étiquette du type `ETH-IN-01`, `ETH-OUT-02`, `FIB-IO-01`, `PWR-IN-01` selon son type (RJ45, fibre, alimentation) et sa direction (in / out / bidirectionnel) ;
   - ajuster le **modèle d'étiquette** (voir ci-dessous).
4. Dans **Métadonnées**, renseigner puissance, TDP, ampérage/tension PDU et montage (horizontal / vertical 0U) par type d'équipement.
5. Consulter les synthèses puis exporter.

### Exports

| Export | Contenu |
| --- | --- |
| **Excel (.xlsx)** | 9 onglets : Synthèse, Baies, Équipements, ÉquipementsPorts, **MatriceCablage**, **MatricePorts**, Cables, Etiquettes, Types |
| **CSV Google Sheets** | un ZIP d'un CSV par onglet (UTF-8 avec BOM) |
| **Étiquettes** | planche HTML A4 prête à imprimer, **un QR code par extrémité** |

La **matrice de câblage** existe sous deux formes :

- `MatriceCablage` : équipement ↔ équipement, chaque cellule contenant les câbles (`CBL-0001 (3,5 m)`) ;
- `MatricePorts` : port ↔ port (uniquement les ports réellement câblés), avec l'identifiant et le type du câble.

## Format d'étiquette (traditionnel)

Par défaut, une étiquette suit l'usage atelier **source / port source, puis destination / port destination** :

```text
SRV-01 / ETH-IO-01
SW-CORE-01 / FIB-IO-08
CBL-0001-A · DAC SFP+ · 1,5 m
Baie 01/U36 · data
```

Le modèle est entièrement configurable dans l'interface avec les jetons : `{CABLE}`, `{END}`, `{DEVICE}`, `{PORT}`, `{PEER_DEVICE}`, `{PEER_PORT}`, `{RACK}`, `{U}`, `{PEER_RACK}`, `{PEER_U}`, `{TYPE}`, `{LEN}`, `{ROLE}`. Les sauts de ligne saisis dans le champ sont conservés. Un QR code contenant l'identifiant du câble, l'extrémité, les deux équipements et les deux ports est imprimé sur chaque étiquette.

> Un exemple de nommage précis peut être fourni ultérieurement : il suffira d'ajuster le modèle (aucun code à modifier).

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
| `Connection.custom_fields` | `dim.cableType` / `dim.role` / `dim.slackM` | Surcharge câble |
| `layout.dimensioning.settings` | dont `labelFormat` | Paramètres de calcul |

Les noms d'équipements utilisent `PlacedDevice.name` et les numéros de port `PlacedPort.label` : ces champs sont déjà affichés par Rackula (tooltips, exports PNG/PDF/SVG).

## Calcul des câbles

Les câbles sont déduits des **connexions port-à-port de Rackula**. Le type est choisi selon les connecteurs (RJ45 → Cat6A, SFP+/SFP28/QSFP28 → DAC ou fibre selon la distance, alimentation → C13-C14). La longueur est estimée par :

```
vertical (écart en U × 44,45 mm) + horizontal + 2 boucles de service
+ marge éventuelle, le tout × facteur de marge, arrondi à 0,5 m
```

C'est une estimation de cheminement, pas un routage 3D : ajuster les paramètres du dialogue ou `dim.slackM` selon le site.

## Non-régression

```bash
npm install
npx vitest run src/lib/dimensioning      # 16 tests (baie type + nommage)
npm run check                            # 0 erreur, 0 warning
npm run lint:... / npx eslint src/lib/dimensioning
npm run build
npm run check:bundle-budget              # dans le budget
npx vitest run                           # suite amont : 4613 pass / 2 échecs préexistants
```

La baie de référence (`src/lib/dimensioning/fixtures/reference-layout.ts`, exportable en `examples/baie-type-rackula.json`) fige : 17 équipements, 12 connexions, 19U/42U, 4 730 W de TDP, 273 kg, 64 A de PDU, charge 40,2 %, 50 étiquettes et les deux matrices de câblage.

Les deux échecs de la suite amont (`layout-json-schema`, `patch-bay-normal`) sont **préexistants** : reproduits à l'identique sur un arbre propre au commit `58ef6edd`, sans la greffe.

## Limites

- Les métadonnées s'éditent au niveau du **type** (le moteur lit les surcharges par équipement, mais l'UI ne les expose pas encore).
- Les paramètres de calcul et le modèle d'étiquette sont locaux au dialogue ; pour les figer dans le layout, ajouter `dimensioning.settings` via le panneau YAML de Rackula.
- Ce fork est une application navigateur : la CLI batch a disparu avec le projet Python d'origine.

## Suivi de l'amont

```bash
git remote add upstream https://github.com/RackulaLives/Rackula.git
git fetch upstream && git merge upstream/main
```

Modifications locales confinées à `src/lib/dimensioning/**`, `src/lib/components/DimensioningDialog.svelte` et deux blocs de `src/App.svelte`.
