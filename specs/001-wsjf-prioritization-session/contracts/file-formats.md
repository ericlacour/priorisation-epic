# Contrat : formats de fichiers (import et export)

Voir [research.md](../research.md), section R9 ; la spec, FR-007, FR-007a, FR-008, FR-023 et
FR-024 ; la constitution, principe VI.

## Versions des formats (constitution VI)

Chaque format d'export porte un **numéro de version documenté** :

| Format | Version actuelle | Où la version apparaît |
|--------|------------------|------------------------|
| CSV tableau (`csv`) | `tableau-v1` | Nom du fichier : `<session>-tableau-v1.csv` |
| CSV votes (`csv-votes`) | `votes-v1` | Nom du fichier : `<session>-votes-v1.csv` |
| Confluence HTML (`confluence-html`) | `confluence-v1` | Ligne de légende : « Format confluence-v1 » |
| Confluence wiki (`confluence-wiki`) | `confluence-v1` | Nom du fichier `<session>-confluence-v1.txt` et ligne de légende |
| JSON (`json`) | `formatVersion: 1` | Champ `formatVersion` |

**Règles de version** :
- Ajouter une colonne ou un champ **à la fin** ne change pas la version.
- Renommer, supprimer ou réordonner une colonne, ou changer le format d'une valeur, crée
  une nouvelle version : `v2`.
- L'import accepte toujours les versions précédentes. Il reconnaît la version d'un CSV à
  ses en-têtes, et celle d'un JSON à `formatVersion`, puis convertit les données.
- Chaque changement de version est noté dans ce document.

## Colonnes communes (Excel et CSV)

Les en-têtes sont **imposés**. Ils sont comparés sans tenir compte de la casse ni des
espaces aux extrémités, et l'ordre des colonnes est libre :

| En-tête | Obligatoire | Contenu |
|---------|-------------|---------|
| `Identifiant` | oui | 1 à 50 caractères, unique dans la session |
| `Titre` | oui | 1 à 200 caractères |
| `Description` | non | 5 000 caractères au plus |
| `BV` | non | Entier appartenant à l'échelle de la session |
| `TC` | non | Idem |
| `RR/OE` | non | Idem |
| `JS` | non | Idem |

**Règles d'import** :
- Si `Identifiant` ou `Titre` manque, **tout le fichier est refusé**. Le message liste les
  en-têtes attendus et propose le modèle.
- Les colonnes inconnues sont ignorées et signalées dans l'aperçu.
- Une ligne entièrement vide est ignorée sans être signalée.
- Une ligne est **rejetée**, avec son motif, si :
  - son identifiant est vide ;
  - son titre est vide ;
  - son identifiant est déjà utilisé, dans la session ou plus haut dans le fichier ;
  - un texte est trop long.
- Une valeur de critère qui n'est pas un entier ou qui sort de l'échelle ne fait **pas**
  rejeter la ligne : la ligne est importée sans cette valeur, et un avertissement est
  ajouté à l'aperçu.
- Le fichier est limité à 5 Mo et 1 000 lignes de données.

## Modèle Excel (`GET /api/import-template.xlsx`)

Le modèle contient une feuille « Fonctionnalités », la ligne d'en-têtes ci-dessus dans cet
ordre, et une ligne d'exemple : `F-1 | Exemple de fonctionnalité | Description facultative |
8 | 5 | 3 | 4`.

## Excel (`.xlsx`), en import

Seule la première feuille est lue, et la première ligne non vide sert d'en-tête. Les
cellules numériques et les cellules texte contenant un entier sont toutes deux acceptées.
Les formules sont lues par leur dernière valeur calculée.

## CSV, en import et en export

- Encodage UTF-8. Le BOM est écrit à l'export et accepté à l'import.
- Le séparateur est `;` à l'export. À l'import, `;` ou `,` sont acceptés, détectés sur la
  ligne d'en-tête.
- Guillemets RFC 4180 pour les champs qui contiennent le séparateur, un guillemet ou un
  saut de ligne.
- **Colonnes d'export**, dans l'ordre du tableau : `Rang;Identifiant;Titre;Description;BV;TC;RR/OE;JS;CoD;WSJF`.
  - Le WSJF a 2 décimales avec une virgule (`4,00`).
  - Une fonctionnalité incomplète a `Rang`, `CoD` et `WSJF` vides.
- Un CSV exporté peut être réimporté : les colonnes `Rang`, `CoD` et `WSJF` sont alors
  ignorées, car elles sont toujours recalculées. Cet aller-retour, dans une session vide de
  même échelle, est testé (constitution VI).

## CSV des votes (`csv-votes`, export uniquement)

Ce format rend les évaluations exportables en CSV (constitution VI). Il suit les mêmes
règles d'encodage que le CSV tableau : UTF-8 avec BOM, `;`, guillemets RFC 4180.

- **Colonnes** : `Tour;Identifiant;Titre;Pseudo;A voté;BV;TC;RR/OE;JS`.
- **Une ligne** par tour, fonctionnalité et participant **inscrit dans la session au
  moment de la révélation du tour**, animateur compris (la même liste que celle qui sert à
  afficher « n'a pas voté »), triée par tour, puis par
  identifiant, puis par pseudo. `A voté` vaut `oui` ou `non`. Les critères non saisis
  sont laissés vides.
- **Seuls les tours révélés** sont exportés. Les votes d'un tour encore ouvert ne
  sortent jamais (SC-004).
- Ce format n'est pas réimportable : les tours appartiennent à la session d'origine.

## Confluence

Les deux sorties contiennent les mêmes colonnes et lignes que l'export CSV, dans l'ordre du
tableau, avec un titre `Priorisation Fonctionnalités : <nom de session> (<JJ/MM/AAAA>)` et une ligne de
légende qui rappelle la formule et la règle d'égalité (constitution, principe I).

1. **`confluence-html`** : un fragment HTML `<table>`, sans styles externes, copié dans le
   presse-papiers par le bouton « Copier pour Confluence ». Il se colle tel quel dans
   l'éditeur Confluence.
2. **`confluence-wiki`** : du texte au format *wiki markup* :
   ```text
   ||Rang||Identifiant||Titre||Description||BV||TC||RR/OE||JS||CoD||WSJF||
   |1|F-1|Titre|Description|8|5|3|4|16|4,00|
   ```
   Les caractères `|`, `{`, `}`, `[` et `]` contenus dans les textes sont échappés avec `\`.
   Les sauts de ligne d'une description sont remplacés par `\\`.

## JSON, en import et en export complet

Le format est versionné. Un changement incompatible incrémente `formatVersion` et
s'accompagne d'une conversion des anciens fichiers (constitution, principe VI).

```json
{
  "formatVersion": 1,
  "exportedAt": "2026-10-11T14:00:00Z",
  "session": {
    "name": "PI 27 – Epics",
    "status": "CLOSED",
    "method": "WSJF",
    "methodVersion": 1,
    "scale": { "type": "CONTINUOUS", "max": 10 }
  },
  "features": [
    { "externalId": "F-1", "title": "…", "description": "…",
      "bv": 8, "tc": 5, "rrOe": 3, "js": 4,
      "computed": { "cod": 16, "wsjf": "4,00", "rank": 1 } }
  ],
  "rounds": [
    { "number": 1, "status": "REVEALED", "featureExternalIds": ["F-1"],
      "openedAt": "2026-10-11T13:40:00Z", "revealedAt": "2026-10-11T13:45:00Z",
      "votes": [ { "pseudo": "alice", "featureExternalId": "F-1",
                   "bv": 8, "tc": 5, "rrOe": 3, "js": 5,
                   "updatedAt": "2026-10-11T13:42:00Z" } ] }
  ]
}
```

**Règles** :
- `computed` est informatif. À l'import, il est **recalculé**, puis comparé à la valeur du
  fichier : un écart produit un avertissement, et on garde le calcul.
- **Importer un JSON** (`POST /api/sessions/{id}/imports`) : seules les `features` sont
  importées. Si la session est en préparation et ne contient encore aucune
  fonctionnalité, l'échelle du fichier est appliquée : c'est l'aller-retour (US4,
  scénario 3, et SC-008). Sinon, on garde l'échelle de la session, et les valeurs hors
  échelle donnent un avertissement.
- Les `rounds` et les votes ne sont **jamais réimportés** (constitution VI) : ils restent
  lisibles dans l'export, avec leurs dates (`openedAt`, `revealedAt` et `updatedAt`).
- Pour l'aller-retour SC-008, le test compare les fonctionnalités, les valeurs, l'échelle
  et les scores entre la session d'origine et la session vide dans laquelle l'export est
  importé.
- L'export JSON d'une session qui a un tour ouvert **n'inclut pas** les votes de ce tour
  (SC-004).
