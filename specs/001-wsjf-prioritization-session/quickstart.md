# Quickstart : validation de la feature 001 (session de priorisation WSJF)

Ce guide sert à **valider** la feature de bout en bout. Les échanges sont décrits dans
[contracts/openapi.yaml](./contracts/openapi.yaml) (REST) et
[contracts/asyncapi.yaml](./contracts/asyncapi.yaml) (WebSocket), puis transcrits dans
`contract/`. Les formats de fichiers sont dans
[contracts/file-formats.md](./contracts/file-formats.md) et le modèle de données dans
[data-model.md](./data-model.md). L'organisation reprend celle de `ericlacour/planning-poker`.

## Prérequis

- JDK 25 (Temurin), Node.js ≥ 24.15 et npm 11.
- Docker, pour Testcontainers et pour construire l'image.

## Lancer en local

```bash
# Base PostgreSQL locale
docker run -d --name wsjf-db -e POSTGRES_DB=wsjf -e POSTGRES_USER=wsjf \
  -e POSTGRES_PASSWORD=wsjf -p 5432:5432 postgres:17

# Webservice (Flyway applique les migrations au démarrage)
cd backend
DATABASE_URL=postgresql://wsjf:wsjf@localhost:5432/wsjf ALLOWED_ORIGINS=http://localhost:4200 ./mvnw spring-boot:run

# Front (écrit config.json en mode dev, puis lance ng serve)
cd frontend && npm ci && npm start          # http://localhost:4200
```

## Lancer les contrôles qualité (identiques à la CI)

```bash
cd contract && npm ci && npm run validate && npm test   # contrat OpenAPI, AsyncAPI, schémas, exemples et règles de masquage
cd backend  && ./mvnw -B verify                          # unitaires, jqwik, ArchUnit, WebSocket, Testcontainers, JaCoCo ≥ 90 % sur domain
cd backend  && docker build -t priorisation-epic-api:ci . \
  && docker run --rm -d --name api --read-only --tmpfs /tmp -u 54321:0 \
       -e PORT=9090 -e DATABASE_URL=… -p 9090:9090 priorisation-epic-api:ci \
  && curl -sf localhost:9090/api/health                  # image compatible OpenShift
cd frontend && npm test && npm run e2e                   # Vitest, e2e Playwright contre un faux socket (avec axe-core)
cd frontend && npm run e2e:journeys                      # parcours V1 à V14 contre le vrai webservice
bash deploy/render-deploy.test.sh                        # script de déploiement Render
```

**Résultat attendu** : tout passe au vert. `./mvnw verify` échoue si `domain` dépend
d'autre chose que du JDK, ou si `application` dépend d'un adaptateur (règles ArchUnit).
Il échoue aussi si la couverture de `domain` passe sous 90 %. `npm run validate` échoue
si un exemple de `sessionState` montre un vote d'un autre participant pendant un tour
ouvert.

## Scénarios de validation (parcours `e2e-journeys`)

| # | Parcours | Étapes | Résultat attendu |
|---|----------|--------|------------------|
| V1 | US1 : saisie directe | Créer une session « Démo » avec le pseudo « anim ». Ajouter F-1 (8, 5, 3, 4) et F-2 (2, 2, 2, 3) | F-1 : CoD 16, WSJF 4,00, rang 1. F-2 : WSJF 2,00. Le détail affiche « CoD = 8 + 5 + 3 = 16 ; WSJF = 16 / 4 = 4,00 » |
| V2 | US1 : recalcul | Passer le JS de F-1 à 10 | F-1 passe à 1,60 et F-2 passe en tête, sans rechargement |
| V3 | US1 : validation | Saisir JS = 0, puis 11, puis 2,5 | Les trois saisies sont refusées avec « … entier entre 1 et 10 » |
| V4 | US2 : rejoindre | Ouvrir le lien d'invitation dans deux autres navigateurs (« alice », « bob ») | Ils apparaissent en ligne chez tous |
| V5 | US2 : masquage | Ouvrir un tour sur F-1 et F-2. Alice vote | Bob et l'animateur voient qu'Alice a noté 1 fonctionnalité sur 2, sans valeurs. Chez Alice et Bob, F-1 et F-2 sont « vote en cours », sans valeurs ni WSJF |
| V6 | US2 : révélation | Révéler | Les votes, le minimum et le maximum s'affichent chez tous. Bob apparaît « n'a pas voté » |
| V7 | US2 : consensus et relance | Fixer les valeurs de F-1, puis relancer un tour sur F-2 seule | F-1 est mise à jour et retriée. Le tour 2 ne contient que F-2, et le tour 1 reste consultable |
| V8 | Rôle animateur | Ouvrir le lien d'animation dans un autre navigateur. Transmettre le rôle à Alice | Le nouveau poste a les droits d'animateur. Après la transmission, Alice reçoit son lien, et l'ancien jeton ne donne plus de droits (`error FORBIDDEN`) |
| V9 | US3 : import | Télécharger le modèle, le remplir avec 20 lignes dont 2 invalides, puis l'importer | L'aperçu montre 18 lignes valides et 2 rejetées avec leur motif. Après confirmation, 18 fonctionnalités apparaissent chez tous. Un fichier sans en-tête « Titre » est refusé en entier |
| V10 | US3 : échelle | Passer en Fibonacci avec la borne 13, alors que des valeurs 4 et 10 existent | Un avertissement liste les valeurs impactées (`SCALE_IMPACT`). Après confirmation, elles sont marquées « à revoir » et la fonctionnalité sort du calcul |
| V11 | US4 : exports | Exporter en CSV, puis copier pour Confluence et coller dans une page | Le CSV s'ouvre dans Excel FR avec accents et virgules corrects. Le tableau collé dans Confluence est conforme |
| V12 | US4 : aller-retour | Exporter en JSON, puis réimporter dans une nouvelle session | Fonctionnalités, échelle et scores identiques |
| V13 | US5 : consultation | Clôturer, puis rouvrir depuis la liste des sessions | La session est en lecture seule, et l'historique montre les auteurs et les dates. L'animateur peut la rouvrir avec son lien |
| V14 | Concurrence | Modifier le BV de F-1 dans deux onglets d'animateur | Le second reçoit `STALE_VERSION` et voit la valeur actuelle avant de confirmer |
| V15 | Reconnexion | Couper puis rétablir le réseau d'un participant | Il se reconnecte automatiquement et retrouve son état et ses votes |

## Valider le déploiement sur Render (V1 temporaire, comme planning-poker)

1. Dans Render, faire **New → Blueprint**, choisir le dépôt `ericlacour/priorisation-epic`
   et le fichier `deploy/render.yaml`. Le blueprint crée l'API (Docker), le site statique
   et la base Postgres.
2. Renseigner `API_BASE_URL` sur le front et `ALLOWED_ORIGINS` sur l'API. `DATABASE_URL`
   est reliée automatiquement à la base par le blueprint.
3. Créer les secrets et variables GitHub du déploiement : `RENDER_DEPLOY_HOOK_BACKEND`,
   `RENDER_DEPLOY_HOOK_FRONTEND`, `RENDER_API_KEY`, `RENDER_BACKEND_SERVICE_ID` et
   `RENDER_FRONTEND_SERVICE_ID`. Les détails sont dans `deploy/README.md`.
4. Vérifier que la CI de `main` est verte, puis poser une étiquette `v0.1` sur la tête de
   `main`, en dehors d'un atelier.

**Résultat attendu** : `https://<api>.onrender.com/api/health` répond `{"status":"UP"}`.
Une session créée existe toujours après un redéploiement, puisqu'elle est en base. Après
15 minutes d'inactivité, le premier accès affiche l'écran de réveil, puis l'application
répond.

**Base de données** : le plan Free de Render Postgres **expire au bout de 30 jours**.
Avant d'y mettre des données réelles, il faut passer à un plan payant ou pointer
`DATABASE_URL` vers une base externe sans expiration. Voir [research.md](./research.md),
section R11.

## Valider l'outillage de sécurité (constitution)

| Outil | Vérification | Résultat attendu |
|-------|--------------|------------------|
| **Dependabot** | *Insights → Dependency graph → Dependabot* | `npm` (frontend, contract), `maven`, `docker` et `github-actions` sont surveillés tous les mois. Les mises à jour de sécurité sont activées dans les réglages du dépôt |
| **CodeQL** | Ouvrir une PR | Le contrôle « CodeQL » s'exécute pour `java-kotlin`, `javascript-typescript` et `actions` |
| **Gitleaks** | Ouvrir une PR de test contenant un faux secret, par exemple une clé AWS d'exemple | Le contrôle « Gitleaks » échoue. Fermer la PR sans la merger |
| **Protection de branche** | *Settings → Branches → main* | CI, CodeQL et Gitleaks sont des contrôles obligatoires avant le merge |
