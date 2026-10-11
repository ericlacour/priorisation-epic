# Contrat : flux d'événements temps réel (SSE)

**Endpoint** : `GET /api/sessions/{inviteCode}/events` (`text/event-stream`)

Voir [research.md](../research.md), section R3.

## Principe

Les événements sont des **notifications sans données métier**. Quand le client en reçoit
un, il relit `GET /api/sessions/{inviteCode}` (ou `/rounds`, `/history`). Cette relecture
lui renvoie sa vue, filtrée selon son rôle. **Aucun vote, aucune valeur et aucun score ne
transite par le flux.** C'est ce qui garantit SC-004.

## Format

```text
event: session-changed
id: 42
data: {"version":42,"kind":"FEATURE_UPDATED","featureId":"…"}
```

| Champ `data` | Type | Description |
|--------------|------|-------------|
| `version` | entier | Compteur croissant par session. Le client ignore tout événement d'une version inférieure ou égale à celle qu'il a déjà relue |
| `kind` | enum | Voir la liste ci-dessous |
| `featureId` / `roundId` / `participantId` | UUID, facultatif | Indique ce qui a changé, pour cibler la relecture |

## Types (`kind`)

| kind | Déclencheur |
|------|-------------|
| `FEATURE_CREATED`, `FEATURE_UPDATED`, `FEATURE_DELETED`, `FEATURES_IMPORTED` | Modification de la liste ou des valeurs retenues (FR-015) |
| `SETTINGS_CHANGED` | Changement de nom ou d'échelle |
| `STATUS_CHANGED` | Démarrage, clôture ou réouverture |
| `PARTICIPANT_JOINED`, `PARTICIPANT_PRESENCE` | Arrivée ou départ d'un participant (FR-005) |
| `ROUND_OPENED`, `ROUND_PROGRESS`, `ROUND_REVEALED` | Cycle de vie d'un tour. `ROUND_PROGRESS` signale seulement qu'un participant a avancé son vote |
| `FACILITATOR_CHANGED` | Transmission du rôle d'animateur. Le bénéficiaire appelle `/facilitator/handover` |

## Reconnexion et présence

- Le serveur envoie un commentaire `: ping` toutes les 15 secondes, pour garder la
  connexion ouverte à travers l'Ingress.
- À la reconnexion, le navigateur renvoie automatiquement `Last-Event-ID`, et le client
  relit sa vue complète, sans chercher à rejouer les événements manqués.
- Un participant est considéré en ligne tant qu'il a au moins un flux SSE ouvert. Cette
  information met à jour `lastSeenAt`.

## Diffusion entre plusieurs pods

Après chaque transaction validée (`AFTER_COMMIT`), le pod émetteur exécute
`NOTIFY session_events, '<inviteCode>:<json>'`. Chaque pod écoute ce canal avec `LISTEN` et
retransmet l'événement à ses propres clients SSE abonnés à la session.

## Performance attendue

Le délai entre le commit d'une modification et la relecture terminée chez tous les clients
connectés doit rester **inférieur à 2 secondes** (SC-002). Il est mesuré par un test e2e
Playwright avec trois contextes de navigateur.
