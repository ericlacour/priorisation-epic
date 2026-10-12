# Modèle de données : Session de priorisation WSJF

**Feature** : `001-wsjf-prioritization-session` | **Date** : 2026-10-11 | **Plan** : [plan.md](./plan.md)

Les identifiants de code sont en anglais (voir [research.md](./research.md), R13). Le terme
métier français est indiqué entre parenthèses.

## Vue d'ensemble

```text
Session 1───* Participant
Session 1───* Feature
Session 1───* VotingRound 1───* RoundFeature *───1 Feature
VotingRound 1───* Vote *───1 Participant
                 Vote *───1 Feature
Session 1───* ChangeLogEntry
Session 1───* ImportPreview (temporaire)
```

## Session (Session)

| Champ | Type | Règles |
|-------|------|--------|
| sessionId | texte (22 car.) | Clé primaire, aléatoire sur 128 bits, en base64url sans remplissage (comme dans planning-poker). Forme le lien d'invitation `/s/{sessionId}` |
| animationTokenHash | texte | Empreinte SHA-256 du jeton d'animation. Le jeton lui-même n'est jamais stocké |
| name | texte (1 à 120 car.) | Obligatoire |
| status | enum `PREPARATION`, `IN_PROGRESS`, `CLOSED` | Vaut `PREPARATION` à la création |
| method | enum `WSJF` | Fixée à la création (FR-017) |
| methodVersion | entier | Vaut 1. Permet de faire évoluer une méthode sans casser les sessions existantes |
| scaleType | enum `CONTINUOUS`, `FIBONACCI` | Vaut `CONTINUOUS` par défaut |
| scaleMax | entier | En continu : de 2 à 100, 10 par défaut. En Fibonacci : une valeur de {2, 3, 5, 8, 13, 20, 40, 100}, 20 par défaut |
| createdAt | horodatage | |
| createdByPseudo | texte | Pseudo du créateur |
| version | entier | Verrouillage optimiste |

**Transitions de statut** (animateur uniquement, FR-004) :

```text
PREPARATION ──démarrer──▶ IN_PROGRESS ──clôturer──▶ CLOSED
                               ▲                      │
                               └──────rouvrir─────────┘
```

- En statut `CLOSED`, toute écriture est refusée (lecture seule), sauf « rouvrir ».
- Les fonctionnalités, les valeurs et l'échelle sont modifiables en `PREPARATION` comme en
  `IN_PROGRESS`. L'import est possible dans les deux statuts.
- Une fonctionnalité qui est dans un tour `OPEN` ne peut pas voir ses valeurs retenues
  (`bv`, `tc`, `rrOe`, `js`) modifiées, ni être supprimée, tant que le tour n'est pas
  révélé : `error FEATURE_IN_OPEN_ROUND` (FR-018). Son titre et sa description restent
  modifiables.
- Un tour de vote ne peut être ouvert qu'en `IN_PROGRESS`. En `PREPARATION`, `openRound`
  renvoie `error SESSION_NOT_STARTED` (FR-004, FR-018).
- `CLOSE` n'est possible que s'il n'y a aucun tour `OPEN`, sinon `error ROUND_OPEN`.
- Un changement d'échelle (`updateSettings` avec `scale`) est refusé tant qu'un tour est
  `OPEN` : `error ROUND_OPEN` (FR-011). Renommer la session reste possible.
- En `IN_PROGRESS`, supprimer une fonctionnalité demande une confirmation.

## Participant (Participant)

| Champ | Type | Règles |
|-------|------|--------|
| id | UUID | |
| sessionId | texte (22 car.) | Clé étrangère vers Session |
| pseudo | texte (1 à 40 car., espaces retirés aux extrémités) | Unique par session sans tenir compte de la casse (FR-003) |
| role | enum `FACILITATOR`, `PARTICIPANT` | Exactement un `FACILITATOR` par session |
| businessRole | texte, facultatif | Rôle métier indicatif : Product Owner, Product Management, Architecte, Expert métier, Lead PM, Tech Lead |
| participantTokenHash | texte | Empreinte du jeton de reprise envoyé dans le message WebSocket `hello` |
| joinedAt / lastSeenAt | horodatages | `lastSeenAt` est mis à jour à chaque `heartbeat` (au plus une fois toutes les 30 s en base) et à la fermeture de la dernière connexion du participant. L'absence de 10 minutes se compte depuis cette fermeture |

**Règles** :
- Les droits d'animateur (`FACILITATOR`) sont accordés **uniquement** à la présentation
  d'un jeton d'animation valide. Le pseudo seul ne suffit jamais.
- Transmission du rôle (FR-002a) : refusée avec `error PARTICIPANT_OFFLINE` si le
  bénéficiaire n'a aucune connexion ouverte. Sinon, en une seule transaction, l'ancien animateur passe
  `PARTICIPANT` et le bénéficiaire passe `FACILITATOR`. Le serveur génère un nouveau jeton
  d'animation et remplace son empreinte dans `animationTokenHash`. Le nouveau jeton est envoyé uniquement à la connexion du
  bénéficiaire, dans le message WebSocket `facilitatorHandover`.
- Présence (FR-005) : un participant est « en ligne » tant qu'il a une connexion
  WebSocket ouverte qui a réussi son `hello`.

## Feature (Fonctionnalité)

| Champ | Type | Règles |
|-------|------|--------|
| id | UUID | |
| sessionId | texte (22 car.) | Clé étrangère |
| externalId | texte (1 à 50 car.) | « Identifiant » métier. Unique par session sans tenir compte de la casse |
| title | texte (1 à 200 car.) | Obligatoire |
| description | texte (≤ 5 000 car.) | Facultative |
| bv, tc, rrOe, js | entier, facultatif | Une fois renseigné, la valeur est ≥ 1. L'appartenance à l'échelle est vérifiée à l'écriture |
| markedForReview | booléen | Marque « à revoir » posée par l'animateur (FR-006a). Faux par défaut. Sans effet sur le score ni le tri |
| reviewReason | texte (≤ 200 car.), facultatif | Motif de la marque « à revoir ». Vidé quand la marque est retirée |
| deletedAt | horodatage, facultatif | Suppression douce, pour conserver l'historique |
| version | entier | Verrouillage optimiste |

**Valeurs calculées** (jamais stockées, calculées par le domaine) :
- `complete` : vrai si les quatre critères sont renseignés **et** appartiennent à
  l'échelle courante.
- `outOfScale` : la liste des critères renseignés mais hors de l'échelle courante. Ils
  sont affichés « **hors échelle** » (FR-011). C'est un état calculé, distinct de la
  marque « à revoir » (`markedForReview`).
- **Retrait automatique de la marque « à revoir »** : à la révélation d'un tour, la marque
  de chaque fonctionnalité du tour est retirée (FR-006a).
- `cod` = bv + tc + rrOe, seulement si `complete`.
- `wsjf` = cod / js, sous forme de fraction exacte, seulement si `complete`. Affiché avec
  2 décimales.
- `rank` : la position après le tri décrit ci-dessous.

**Tri** (FR-014) : les fonctionnalités complètes d'abord, par WSJF décroissant, puis par
CoD décroissant, puis par `externalId` croissant sans tenir compte de la casse. Viennent
ensuite les fonctionnalités incomplètes ou hors échelle, par `externalId` croissant. La
marque « à revoir » ne change pas le tri.

## VotingRound (Tour de vote)

| Champ | Type | Règles |
|-------|------|--------|
| id | UUID | |
| sessionId | texte (22 car.) | Clé étrangère |
| number | entier | Numéro séquentiel dans la session, à partir de 1 |
| status | enum `OPEN`, `REVEALED` | |
| previousRoundId | UUID, facultatif | Rempli quand le tour est relancé à partir d'un tour précédent (FR-022) |
| openedAt / revealedAt | horodatages | |

**RoundFeature** : couple (`roundId`, `featureId`) qui indique quelles fonctionnalités
font partie du tour (au moins une, FR-018).

**Règles** :
- Une fonctionnalité ne peut appartenir qu'à **un seul tour `OPEN`** à la fois. La règle
  est vérifiée sous verrou sur la session (research, R7 : verrou par session).
- `OPEN → REVEALED` est la seule transition possible. Elle est réservée à l'animateur et
  porte sur toutes les fonctionnalités du tour à la fois (FR-020).
- Un tour `REVEALED` est immuable.

## Vote (Vote)

| Champ | Type | Règles |
|-------|------|--------|
| id | UUID | |
| roundId, featureId, participantId | UUID | Unique sur (`roundId`, `featureId`, `participantId`) |
| bv, tc, rrOe, js | entier, facultatif | Chaque valeur doit appartenir à l'échelle courante de la session |
| updatedAt | horodatage | |

**Règles de visibilité** (FR-019, FR-019a, SC-004), appliquées par le serveur à chaque
`sessionState` envoyé, connexion par connexion, ainsi qu'aux réponses REST et aux exports :
- Tant que le tour est `OPEN`, chacun ne voit que ses propres valeurs. Les autres membres
  voient seulement, pour chaque participant, le nombre de fonctionnalités dont les quatre
  critères sont renseignés.
- Tant que le tour est `OPEN`, un participant non animateur voit les fonctionnalités du tour
  sans `bv`, `tc`, `rrOe`, `js`, `cod`, `wsjf`, ni votes des tours précédents. Elles
  portent le marqueur `votingInProgress = true` et sont placées en fin de tableau.
  L'animateur, lui, voit les valeurs retenues.
- Une fois le tour `REVEALED`, tout le monde voit tous les votes, ainsi que le minimum et le
  maximum de chaque critère. Le domaine calcule aussi, par critère, l'**écart important**
  (maximum moins minimum strictement supérieur à 3, FR-020) et la **valeur unanime**
  (identique chez tous les votants, sinon vide), qui préremplit le consensus (FR-021). Les participants qui n'ont pas voté sont signalés. Ce sont
  les participants inscrits dans la session au moment de la révélation, animateur compris.
- Tous les tours révélés restent visibles par tous, du plus récent au plus ancien, avec
  leurs votes (`revealedRounds` dans `sessionState`, FR-022, écran 9). Un tour encore
  `OPEN` n'y figure jamais.

## ChangeLogEntry (Entrée d'historique, enregistrée mais non affichée en V1)

| Champ | Type | Règles |
|-------|------|--------|
| id | UUID | |
| sessionId | texte (22 car.) | Clé étrangère |
| at | horodatage | |
| authorPseudo | texte | Pseudo de l'auteur au moment de l'action |
| entityType | enum `SESSION`, `FEATURE` | |
| entityId | texte | `sessionId` ou identifiant de la fonctionnalité |
| action | enum `VALUE_CHANGE`, `SCALE_CHANGE` | Seules opérations tracées (FR-025) |
| field | texte, facultatif | `bv`, `tc`, `rrOe` ou `js` pour `VALUE_CHANGE` |
| oldValue / newValue | JSON, facultatif | |

Les entrées sont écrites dans la même transaction que la modification. Elles ne sont jamais
modifiées ni supprimées. Une modification de valeur retenue n'est tracée que si la valeur
change vraiment.

**Retour d'un participant** (cas limite « Participant qui quitte la session ») :
- Si un participant n'a plus aucune connexion ouverte depuis **10 minutes**
  (`lastSeenAt`, paramètre `absence-timeout`, 10 min par défaut comme dans PP), son pseudo
  devient « reprenable ».
- Un `POST /participants` avec ce pseudo rattache alors le nouvel arrivant au participant
  existant, qui garde ses votes. Un nouveau jeton est émis, et l'empreinte de l'ancien est
  remplacée.
- Avant ces 10 minutes, le pseudo est refusé (`PseudoTaken`).
- Le rôle `FACILITATOR` ne se reprend jamais par pseudo, seulement par le lien
  d'animation.

## ImportPreview (Aperçu d'import, temporaire)

| Champ | Type | Règles |
|-------|------|--------|
| id | UUID | `previewId` |
| sessionId | texte (22 car.) | |
| sourceType | enum `XLSX`, `CSV`, `JSON` | |
| validRows | JSON | Lignes qui seront importées |
| rejectedRows | JSON | Pour chaque ligne rejetée : numéro de ligne, identifiant et motif en français |
| warnings | JSON | Avertissements par ligne, par exemple une valeur hors échelle ignorée |
| expiresAt | horodatage | Création + 15 min. Une tâche planifiée purge les aperçus expirés |

## Règles de validation récapitulatives

| Règle | Source | Où elle est appliquée |
|-------|--------|-----------------------|
| Critère ∈ valeurs de l'échelle (entier ≥ 1) | FR-009, FR-010 | Domaine (`Scale.accepts`), puis contrainte `CHECK ≥ 1` en base |
| JS jamais nul | Spec, FR-010 | Garanti par la plus petite valeur de l'échelle, qui vaut 1 |
| `externalId` unique par session | FR-006 | Domaine, puis index unique `lower(external_id)` |
| Pseudo unique par session | FR-003 | Domaine, puis index unique `lower(pseudo)` |
| Un seul animateur par session | FR-002a | Service, sous transaction |
| Une fonctionnalité dans un seul tour ouvert | FR-018 | Service, sous verrou sur la session |
| Écritures interdites en `CLOSED` | FR-026 | Service |
| Seul l'animateur modifie les valeurs retenues, l'échelle et le statut, et pilote les tours | FR-004, FR-021 | Contrôle d'accès dans l'API, via le jeton d'animation |
