# Modèle de données : Session de priorisation WSJF

**Feature** : `001-wsjf-prioritization-session` | **Date** : 2026-10-11 | **Plan** : [plan.md](./plan.md)

Les identifiants de code sont en anglais (voir [research.md](./research.md), R13). Le terme
métier français est indiqué entre parenthèses.

## Vue d'ensemble

```text
Session *───1 PrioritizationMethod (définie dans le code, non stockée)
Session 1───* Participant
Session 1───* Feature 1───* FeatureCriterionValue
Session 1───* VotingRound 1───* RoundFeature *───1 Feature
VotingRound 1───* RoundCriterion
VotingRound 1───* RoundBallot *───1 Participant
VotingRound 1───* Vote *───1 Participant
                 Vote *───1 Feature
                 Vote 1───* VoteCriterionValue
Session 1───* ChangeLogEntry
Session 1───* ImportPreview (temporaire)
```

**Principe** (FR-017a, FR-017b) : aucune table, aucun schéma du contrat et aucun écran ne
liste les critères du WSJF. Les valeurs sont rangées **par clé de critère**, et la liste
des critères et des valeurs calculées vient toujours de la définition de la méthode de la
session. Ajouter une méthode ne demande donc aucune migration de base ni aucun changement
du contrat.

## Session (Session)

| Champ | Type | Règles |
|-------|------|--------|
| sessionId | texte (22 car.) | Clé primaire, aléatoire sur 128 bits, en base64url sans remplissage (comme dans planning-poker). Forme le lien d'invitation `/s/{sessionId}` |
| animationTokenHash | texte | Empreinte SHA-256 du jeton d'animation. Le jeton lui-même n'est jamais stocké |
| name | texte (1 à 120 car.) | Obligatoire. Unique parmi toutes les sessions, sans tenir compte de la casse ni des espaces autour (FR-001a) : la colonne générée `name_key` (fonction SQL `session_name_key` : NFKC, espaces retirés aux extrémités, minuscules selon la collation de la base) porte un index unique. Seule la base calcule cette clé, pour l'index comme pour les recherches de l'application |
| status | enum `PREPARATION`, `IN_PROGRESS`, `CLOSED` | Vaut `PREPARATION` à la création |
| method | texte (≤ 20 car.) | Identifiant de la méthode, choisi à la création parmi les méthodes de `MethodRegistry`, `WSJF` par défaut (FR-017d). Figé ensuite (FR-017) |
| methodVersion | entier | La dernière version de la méthode au moment de la création (1 en V1). Une nouvelle version d'une méthode s'ajoute à côté de l'ancienne : une session garde toujours sa version |
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

- En statut `CLOSED`, toute écriture est refusée (lecture seule) avec `error SESSION_CLOSED`,
  sauf « rouvrir ». L'import (REST) y répond 403.
- Une action sans effet (`START` sur une session en cours, `REOPEN` sur une session qui n'est
  pas clôturée) est acceptée et ne change rien. `CLOSE` sur une session en `PREPARATION` est
  refusé : `error SESSION_NOT_STARTED`.
- Les fonctionnalités, les valeurs et l'échelle sont modifiables en `PREPARATION` comme en
  `IN_PROGRESS`. L'import est possible dans les deux statuts.
- Une fonctionnalité qui est dans un tour `OPEN` ne peut pas voir ses valeurs retenues
  (ses critères) modifiées, ni être supprimée, tant que le tour n'est pas
  révélé : `error FEATURE_IN_OPEN_ROUND` (FR-018). Son titre et sa description restent
  modifiables.
- Un tour de vote ne peut être ouvert qu'en `IN_PROGRESS`. En `PREPARATION`, `openRound`
  renvoie `error SESSION_NOT_STARTED` (FR-004, FR-018).
- `CLOSE` n'est possible que s'il n'y a aucun tour `OPEN`, sinon `error ROUND_OPEN`.
- Un changement d'échelle (`updateSettings` avec `scale`) est refusé tant qu'un tour est
  `OPEN` : `error ROUND_OPEN` (FR-011). Renommer la session reste possible.
- En `IN_PROGRESS`, supprimer une fonctionnalité demande une confirmation.

## PrioritizationMethod (Méthode de priorisation, définie dans le code)

Une méthode n'est pas stockée en base : c'est du code du domaine, identifié par
(`method`, `methodVersion`) et enregistré dans `MethodRegistry`. Elle expose une
**définition** (`MethodDefinition`), envoyée telle quelle au front dans `sessionState`, et
un **calcul**.

| Élément | Contenu |
|---------|---------|
| key, version, name | `WSJF`, `1`, « WSJF » |
| criteria | Liste ordonnée de `CriterionDefinition` : `key` (clé technique, en camelCase), `code` (sigle affiché), `label` (nom complet), `definition` (texte d'aide en français), `header` (en-tête de colonne à l'import et à l'export) |
| computedValues | Liste ordonnée de `ComputedValueDefinition` : `key`, `code`, `label`, `definition`, `header`, `display` (`INTEGER` ou `DECIMAL_2`) |
| formula | Texte affiché, par exemple « CoD = BV + TC + RR/OE ; WSJF = CoD / JS » |
| tieBreakRule | Texte affiché de la règle de tri et d'égalité |
| compute(criteria) | Calcule les valeurs calculées en **fractions exactes**, ou rien si la fonctionnalité n'est pas calculable |
| explain(criteria) | Le détail du calcul avec les vraies valeurs (FR-016) |
| compare(a, b) | L'ordre entre deux fonctionnalités calculables. L'application ajoute toujours, en dernier, `externalId` croissant sans tenir compte de la casse |

**Définition du WSJF, version 1** :

| Type | key | code | label | header | display |
|------|-----|------|-------|--------|---------|
| Critère | `bv` | BV | Business Value | `BV` | |
| Critère | `tc` | TC | Time Criticality | `TC` | |
| Critère | `rrOe` | RR/OE | Risk Reduction / Opportunity Enablement | `RR/OE` | |
| Critère | `js` | JS | Job Size | `JS` | |
| Valeur calculée | `cod` | CoD | Cost of Delay | `CoD` | `INTEGER` |
| Valeur calculée | `wsjf` | WSJF | Weighted Shortest Job First | `WSJF` | `DECIMAL_2` |

- Calculable si les quatre critères sont renseignés et dans l'échelle.
- `cod` = bv + tc + rrOe ; `wsjf` = cod / js, en fraction exacte.
- Tri : `wsjf` décroissant, puis `cod` décroissant.

**Règles** :
- Les clés de critère sont uniques dans une méthode et ne changent jamais pour une version
  donnée. Changer un critère, un calcul ou un tri crée une **nouvelle version** de la
  méthode (constitution I : le changement est documenté et visible).
- Une clé de critère inconnue de la méthode de la session est refusée :
  `error UNKNOWN_CRITERION`.
- Les textes de la définition sont en français (constitution V). Ils sont la seule source
  des sigles, noms et définitions affichés (FR-016a), et du panneau « Méthode de la
  session » (FR-017c).
- `MethodRegistry` liste les méthodes disponibles à la création, chacune dans sa dernière
  version (`GET /api/methods`, FR-017d). Les anciennes versions restent connues pour les
  sessions qui les utilisent, mais ne sont plus proposées.

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
| criteria | valeurs par clé de critère, dans `FeatureCriterionValue` | Voir ci-dessous |
| markedForReview | booléen | Marque « à revoir » posée par l'animateur (FR-006a). Faux par défaut. Sans effet sur le score ni le tri |
| reviewReason | texte (≤ 200 car.), facultatif | Motif de la marque « à revoir ». Vidé quand la marque est retirée |
| deletedAt | horodatage, facultatif | Suppression douce, pour conserver l'historique |
| version | entier | Verrouillage optimiste |

**FeatureCriterionValue** : (`featureId`, `criterionKey`, `value`), clé primaire
(`featureId`, `criterionKey`). `criterionKey` est une clé de critère de la méthode de la
session. `value` est un entier ≥ 1, dont l'appartenance à l'échelle est vérifiée à
l'écriture. Un critère non renseigné n'a pas de ligne.

**Valeurs calculées** (jamais stockées, calculées par le domaine à partir de la méthode) :
- `complete` : vrai si la méthode déclare la fonctionnalité calculable. En WSJF : les
  quatre critères sont renseignés **et** appartiennent à l'échelle courante.
- `outOfScale` : la liste des critères renseignés mais hors de l'échelle courante. Ils
  sont affichés « **hors échelle** » (FR-011). C'est un état calculé, distinct de la
  marque « à revoir » (`markedForReview`).
- **Retrait automatique de la marque « à revoir »** : à la révélation d'un tour, la marque
  de chaque fonctionnalité du tour est retirée (FR-006a).
- `computed` : les valeurs calculées de la méthode, par clé, en fractions exactes,
  seulement si `complete`. Chacune est affichée selon son `display`. En WSJF : `cod` =
  bv + tc + rrOe, et `wsjf` = cod / js, affiché avec 2 décimales.
- `rank` : la position après le tri décrit ci-dessous.

**Tri** (FR-014) : les fonctionnalités complètes d'abord, dans l'ordre de `compare` de la
méthode (en WSJF : WSJF décroissant, puis CoD décroissant), puis par `externalId`
croissant sans tenir compte de la casse. Viennent ensuite les fonctionnalités incomplètes
ou hors échelle, par `externalId` croissant. La marque « à revoir » ne change pas le tri.

## VotingRound (Tour de vote)

> **Revu le 2026-10-15** (spec, User Story 2, réalisée en dernier) : le vote se fait **par
> classement**, sur l'écran de « Prioriser par classement ». Un tour porte sur une
> sélection de **critères** et de **fonctionnalités**, et chaque membre envoie son vote
> en une fois. Les tables `voting_round`, `round_feature`, `vote` et `vote_criterion_value`
> existent depuis `V1__init.sql` ; une migration dédiée à ce parcours
> (`V<n>__round_criteria_and_ballots.sql`) ajoute `round_criterion` et `round_ballot`.

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

**RoundCriterion** : (`roundId`, `criterionKey`, `position`), clé primaire (`roundId`,
`criterionKey`). Critères de la méthode évalués dans le tour (au moins un, FR-018), dans
l'ordre de la définition de la méthode. Une clé inconnue de la méthode est refusée
(`UNKNOWN_CRITERION`).

**Règles** :
- Une fonctionnalité ne peut appartenir qu'à **un seul tour `OPEN`** à la fois. La règle
  est vérifiée sous verrou sur la session (research, R7 : verrou par session).
- `OPEN → REVEALED` est la seule transition possible. Elle est réservée à l'animateur et
  porte sur toutes les fonctionnalités du tour à la fois (FR-020).
- Un tour `REVEALED` est immuable.
- Une relance (FR-022) reprend par défaut les critères du tour précédent ; l'animateur
  peut les changer.

## RoundBallot (Vote envoyé)

| Champ | Type | Règles |
|-------|------|--------|
| roundId, participantId | UUID | Clé primaire (`roundId`, `participantId`) |
| submittedAt | horodatage | Date du dernier envoi |

Un `RoundBallot` existe dès qu'un membre a envoyé son vote (« Envoyer mon vote », FR-019) :
c'est lui qui dit qu'un membre **a voté**. Un nouvel envoi, tant que le tour est `OPEN`,
**remplace** en une transaction toutes les lignes `Vote` de ce membre pour ce tour et met à
jour `submittedAt`. Après la révélation, l'envoi est refusé (`ROUND_REVEALED`).

## Vote (Vote)

| Champ | Type | Règles |
|-------|------|--------|
| id | UUID | |
| roundId, featureId, participantId | UUID | Unique sur (`roundId`, `featureId`, `participantId`). Une ligne par fonctionnalité du tour à chaque envoi |
| criteria | valeurs par clé de critère, dans `VoteCriterionValue` | Seulement les critères du tour (`RoundCriterion`), sinon `UNKNOWN_CRITERION`. Chaque valeur doit appartenir à l'échelle courante de la session. Critère absent = « sans avis » : fonctionnalité laissée non classée pour ce critère (FR-019) |
| updatedAt | horodatage | |

**VoteCriterionValue** : (`voteId`, `criterionKey`, `value`), clé primaire (`voteId`,
`criterionKey`), mêmes règles que `FeatureCriterionValue`.

Le serveur ne stocke **que des valeurs** : le classement (niveaux, ordre) est une aide de
saisie du front, reconstruite à partir des valeurs envoyées quand le membre reprend son
vote (« Modifier mon vote », groupement par valeur décroissante, comme FR-015a).

**Règles de visibilité** (FR-019, FR-019a, SC-004), appliquées par le serveur à chaque
`sessionState` envoyé, connexion par connexion, ainsi qu'aux réponses REST et aux exports :
- Tant que le tour est `OPEN`, chacun ne voit que ses propres valeurs (`myVotes`). Les
  autres membres voient seulement, pour chaque membre, s'il **a voté** (`RoundBallot`
  présent, FR-019).
- Tant que le tour est `OPEN`, un participant non animateur voit les fonctionnalités du tour
  sans critères (y compris ceux hors du tour), sans valeurs calculées, ni votes des tours
  précédents. Elles portent le marqueur `votingInProgress = true` et sont placées en fin
  de tableau. L'animateur, lui, voit les valeurs retenues.
- Une fois le tour `REVEALED`, tout le monde voit tous les votes, ainsi que le minimum et le
  maximum de chaque **critère du tour**, calculés sur les seules valeurs données : une
  valeur « sans avis » est ignorée, et un critère sans aucune valeur a un minimum et un
  maximum vides. Le domaine calcule aussi, par critère du tour, l'**écart important**
  (maximum moins minimum strictement supérieur à 3, FR-020) et la **valeur unanime**
  (identique chez tous ceux qui ont donné une valeur pour ce critère, vide si elles diffèrent
  ou s'il n'y en a aucune), qui préremplit le consensus (FR-021). Les membres sans
  `RoundBallot` sont signalés « n'a pas voté ». Ce sont les participants inscrits dans la
  session au moment de la révélation, animateur compris.
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
| field | texte, facultatif | Clé du critère modifié pour `VALUE_CHANGE` (en WSJF : `bv`, `tc`, `rrOe` ou `js`) |
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

## RankingRoom (Salle de classement collaboratif, en mémoire, FR-015b et FR-015c)

Jamais enregistrée : une salle par session, dans la mémoire du webservice, du premier brouillon
diffusé par l'animateur (`updateRankingDraft`) à sa fermeture. Elle n'incrémente pas
`session.version` et n'écrit rien dans `change_log`. Un redémarrage du webservice la ferme ; les
valeurs retenues, elles, sont toujours écrites par `updateFeature` à « Terminer ».

| Champ | Type | Règles |
|-------|------|--------|
| facilitatorId | UUID | Le participant qui a ouvert la salle |
| live | booléen | Faux pendant la pause de la diffusion : les membres gardent le dernier brouillon diffusé |
| draft | objet | `criterionKeys` (choisis, au moins un), `criterionKey` (en cours, parmi eux), `levels` (du plus fort au plus faible, jamais vides), `unranked`, `values` (fonctionnalités classées seulement, dans l'échelle). Une fonctionnalité au plus une fois, jamais d'un tour ouvert ; une fonctionnalité supprimée entre-temps en sort |
| opinions | liste | Un avis au plus par membre, fonctionnalité et critère : `AGREE`, `RAISE` ou `LOWER`, avec un commentaire facultatif de 140 caractères au plus. Seulement sur une fonctionnalité et un critère du brouillon ; un brouillon qui les retire retire leurs avis |
| spotlightFeatureId | UUID ou vide | La carte en discussion, une à la fois, dans le brouillon |

Fermeture : `endRanking` (`SAVED` ou `CANCELLED`), dernière connexion d'animateur fermée
(`FACILITATOR_LEFT`), transmission du rôle (`FACILITATOR_CHANGED`) ou clôture de la session
(`SESSION_CLOSED`).

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
| Clé de critère connue de la méthode de la session | FR-017b | Domaine (`MethodDefinition`), `error UNKNOWN_CRITERION` |
| Critère ∈ valeurs de l'échelle (entier ≥ 1) | FR-009, FR-010 | Domaine (`Scale.accepts`), puis contrainte `CHECK ≥ 1` en base |
| Diviseur jamais nul (JS en WSJF) | Spec, FR-010 | Garanti par la plus petite valeur de l'échelle, qui vaut 1 |
| `externalId` unique par session | FR-006 | Domaine, puis index unique `lower(external_id)` |
| Pseudo unique par session | FR-003 | Domaine, puis index unique `lower(pseudo)` |
| Nom de session unique | FR-001a | Service (création et `updateSettings`), puis index unique sur `name_key` ; `409` à la création, `error SESSION_NAME_TAKEN` au renommage |
| Un seul animateur par session | FR-002a | Service, sous transaction |
| Un seul tour ouvert à la fois par session (donc une fonctionnalité dans un seul tour ouvert) | FR-018 | Service, sous verrou sur la session, `error ROUND_OPEN` |
| Écritures interdites en `CLOSED` | FR-026 | Service |
| Seul l'animateur modifie les valeurs retenues, l'échelle et le statut, et pilote les tours | FR-004, FR-021 | Contrôle d'accès dans l'API, via le jeton d'animation |
