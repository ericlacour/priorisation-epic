# Contrat : formats de fichiers (import et export)

Voir [research.md](../research.md), section R9 ; la spec, FR-007, FR-007a, FR-008, FR-023 et
FR-024 ; la constitution, principe VI.

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
  ignorées, car elles sont toujours recalculées.

## Confluence

Les deux sorties contiennent les mêmes colonnes et lignes que l'export CSV, dans l'ordre du
tableau, avec un titre `Priorisation WSJF : <nom de session> (<JJ/MM/AAAA>)` et une ligne de
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
      "votes": [ { "pseudo": "alice", "featureExternalId": "F-1",
                   "bv": 8, "tc": 5, "rrOe": 3, "js": 5 } ] }
  ]
}
```

**Règles** :
- `computed` est informatif. À l'import, il est **recalculé**, puis comparé à la valeur du
  fichier : un écart produit un avertissement, et on garde le calcul.
- Si la session cible est en préparation et ne contient encore aucune fonctionnalité,
  l'import applique **l'échelle du fichier**, puis importe les `features`. C'est le cas de
  l'aller-retour (US4, scénario 3).
- Si la session contient déjà des fonctionnalités, seules les `features` sont importées,
  avec l'échelle de la session. Les valeurs hors échelle donnent un avertissement.
- Les `rounds` et les votes ne sont jamais réimportés : ils restent l'historique de la
  session d'origine.
- Pour l'aller-retour SC-008, le test compare les données et les scores entre l'export et
  la réimport dans une nouvelle session.
- L'export JSON d'une session qui a un tour ouvert **n'inclut pas** les votes de ce tour
  (SC-004).
