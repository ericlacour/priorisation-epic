# Contrat d'échange front / webservice

Ce dossier est la **source de vérité** de tous les échanges entre le front Angular et le webservice Java. Aucun champ ne circule s'il n'est pas décrit ici. Le contrat ne fait qu'évoluer par ajout.

Les documents de conception de la feature (`specs/001-wsjf-prioritization-session/contracts/`) décrivent la surface complète de la V1 ; ce dossier la reçoit tâche par tâche, avec ses schémas et ses exemples.

## Contenu

| Chemin                         | Rôle                                                                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openapi.yaml`                 | OpenAPI 3.2.0 : les endpoints REST et leurs erreurs `application/problem+json`.                                                                                 |
| `asyncapi.yaml`                | AsyncAPI 3.1.0 : le WebSocket brut `/ws/sessions/{sessionId}`, ses messages, la poignée de main et les codes de fermeture (`x-close-codes`).                    |
| `schemas/`                     | Les charges utiles en JSON Schema 2020-12, chacune définie **une seule fois**, avec un `$id` égal au nom du fichier. Les deux documents y renvoient par `$ref`. |
| `examples/<schéma>/<cas>.json` | Les exemples. Le nom du dossier désigne le schéma visé : `examples/error/stale-version.json` est validé contre `schemas/error.json`.                            |
| `scripts/validate.mjs`         | Le script de validation (voir ci-dessous).                                                                                                                      |
| `scripts/validate.test.mjs`    | Les tests du script : chacun fausse une copie du contrat et vérifie que l'erreur est détectée.                                                                  |
| `redocly.yaml`                 | Les règles de lint d'`openapi.yaml`.                                                                                                                            |

## Schémas communs

`problem`, `hello`, `heartbeat`, `tick`, `error`, `health-response`, `criteria`, `criterion-key`, `scale`, `exact-value`, `method-definition`, `score` et `feature`. Le contrat ne liste jamais les critères d'une méthode (FR-017a, FR-017b) : `criteria` est une table de valeurs indexée par les clés que `methodDefinition` déclare.

## Valider le contrat

Avec Node.js ≥ 24.15 :

```bash
npm ci
npm run validate   # valide le contrat
npm test           # teste le validateur
npm run format:check
```

`npm run validate` vérifie que :

- `openapi.yaml` est valide selon OpenAPI 3.2 (Redocly) et `asyncapi.yaml` selon AsyncAPI 3.1 ;
- tous les `$ref` sont résolus ;
- la surface reste dans ce que la spec prévoit : une opération ou un message hors liste est refusé, `GET /api/health` et les messages `hello`, `heartbeat`, `tick` et `error` sont obligatoires, et chaque message a exactement une opération, dans le bon sens ;
- chaque schéma référencé par un document a au moins un exemple dans `examples/<schéma>/` ;
- chaque exemple est valide contre son schéma ;
- chaque réponse d'erreur REST nommée (`BadRequest`, `SessionNotFound`…) a un exemple `examples/problem/<nom-en-kebab>*.json`.

Les règles métier sur `sessionState` qu'un JSON Schema ne sait pas exprimer se branchent dans `SESSION_STATE_RULES` (`scripts/validate.mjs`).

## Ajouter un message ou un endpoint

1. Écrire `schemas/<nom-en-kebab>.json` (`$id` égal au nom du fichier).
2. Ajouter au moins un exemple dans `examples/<nom-en-kebab>/`.
3. Référencer le schéma dans `asyncapi.yaml` ou `openapi.yaml`.
4. `npm run validate && npm test`.

## Parcours déjà décrits

- **Prioriser en saisie directe (US1)** : `POST /api/sessions`, `GET /api/sessions/{sessionId}`, `POST /api/sessions/{sessionId}/participants` et `GET /api/methods` (schémas `create-session-*`, `join-session-*`, `method-list`, `session-summary`) ; messages WebSocket `addFeature`, `updateFeature`, `deleteFeature` et `sessionState` (schémas `add-feature`, `update-feature`, `delete-feature`, `session-state`).
- **Importer et régler l'échelle (US3)** : `POST /api/sessions/{sessionId}/imports` (aperçu, rien n'est écrit), `POST /api/sessions/{sessionId}/imports/{previewId}/confirm` et `GET /api/import-template.xlsx` (schémas `import-preview`, `import-result`) ; message WebSocket `updateSettings` (schéma `update-settings`), refusé par `error SCALE_IMPACT` avec `impactedValues` tant qu'il n'est pas confirmé.
- `sessionState.me.role` vaut `FACILITATOR` quand la connexion détient les droits d'animateur (jeton d'animation valide), `PARTICIPANT` sinon.
- Aucun schéma ne nomme un critère d'une méthode : `validate.mjs` le vérifie (`bv`, `tc`, `rrOe`, `js`, `cod`, `wsjf` n'apparaissent que dans les exemples).
