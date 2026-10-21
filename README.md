# priorisation epic

Application web pour prioriser les fonctionnalités d'une équipe avec la méthode WSJF.
La spécification se trouve dans [`specs/001-wsjf-prioritization-session/`](specs/001-wsjf-prioritization-session/).

## Organisation du dépôt

| Dossier | Contenu |
|---------|---------|
| `contract/` | Contrat d'échange front / webservice : OpenAPI, AsyncAPI, schémas JSON et exemples. Scripts `npm run validate` et `npm test` |
| `backend/` | Webservice Java 25 / Spring Boot 4.1, en architecture hexagonale (`domain`, `application`, `adapter`, `config`), Maven (`./mvnw verify`) |
| `frontend/` | Front Angular 22 (`npm start`, `npm test`, `npm run lint`, `npm run e2e`) |
| `deploy/` | Blueprint et mode d'emploi du déploiement |
| `.github/` | CI et outillage de sécurité |
| `specs/` | Spécification, plan et tâches de la feature 001 |

Prérequis : JDK 25 (Temurin), Node.js ≥ 24.15 et Docker (base locale et Testcontainers).

### Lancer en local

```bash
# Base PostgreSQL 17
docker run -d --name wsjf-db -e POSTGRES_DB=wsjf -e POSTGRES_USER=wsjf \
  -e POSTGRES_PASSWORD=wsjf -p 5432:5432 postgres:17

# Webservice sur http://localhost:8080 (Flyway applique les migrations au démarrage)
(cd backend && DATABASE_URL=postgresql://wsjf:wsjf@localhost:5432/wsjf \
  ALLOWED_ORIGINS=http://localhost:4200 ./mvnw spring-boot:run)

# Front sur http://localhost:4200 (écrit config.json en mode dev, puis lance ng serve)
(cd frontend && npm ci && npm start)
```

### Vérifications avant un push

```bash
(cd backend && ./mvnw -B verify)                 # Spotless, Error Prone, tests, JaCoCo
(cd frontend && npm ci && npm run lint && npm run format:check && npm test)
(cd contract && npm ci && npm run format:check && npm run validate && npm test)
```

### Tests de bout en bout

```bash
# e2e Playwright contre un faux socket (Chromium, Firefox, WebKit, axe-core, accessibilité)
(cd frontend && npm run build:e2e && npm run e2e)

# Parcours du quickstart contre le vrai webservice : jar construit, base PostgreSQL désignée par DATABASE_URL
(cd backend && ./mvnw -B -DskipTests package)
(cd frontend && API_BASE_URL=http://127.0.0.1:4310 npm run build:e2e \
  && DATABASE_URL=postgresql://wsjf:wsjf@localhost:5432/wsjf npm run e2e:journeys)

# Test de charge (SC-002, SC-005) : 10 participants, 50 fonctionnalités
node deploy/load-test.mjs --url http://localhost:8080
```

Sans navigateurs Playwright installés, `PLAYWRIGHT_CHROMIUM_PATH` désigne un Chromium existant.
La validation complète de la feature est décrite dans
[`quickstart.md`](specs/001-wsjf-prioritization-session/quickstart.md).

### Déploiement

Le front est un site statique Render, le webservice une image Docker sur Render et la base est sur
Neon. La mise en place, les mises à jour, les règles d'usage et le test de charge sont dans
[`deploy/README.md`](deploy/README.md).

`./mvnw spotless:apply` reformate le Java. Une dérogation Error Prone se fait au cas par cas avec
`@SuppressWarnings("NomDeLaVérification")` et un commentaire qui explique pourquoi.

### Base de données et configuration du webservice

| Variable | Rôle |
|----------|------|
| `PORT` | Port HTTP (8080 par défaut) |
| `DATABASE_URL` | Base PostgreSQL 17 au format `postgresql://utilisateur:motdepasse@hôte[:port]/base?sslmode=require` (celui de Neon). `DatabaseUrlConfig` la convertit en URL JDBC ; sans elle, `SPRING_DATASOURCE_*` s'applique |
| `ALLOWED_ORIGINS` | Origines `http(s)://hôte[:port]` du front, séparées par des virgules, pour CORS et le WebSocket. Aucune par défaut ; un joker `*` ou un chemin empêche le démarrage |

Le schéma est créé par les migrations Flyway (`backend/src/main/resources/db/migration/`).
Les tests qui démarrent l'application utilisent PostgreSQL 17 par Testcontainers (Docker
requis). Sans Docker, `TEST_DATABASE_URL` (même format que `DATABASE_URL`) désigne une base
PostgreSQL jetable : `TEST_DATABASE_URL=postgresql://postgres@localhost:5433/pe ./mvnw verify`.

### Intégration continue

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) lance, sur `main` et sur chaque PR :
`contract` (format, validation, tests), `backend` (`./mvnw verify` avec un service
PostgreSQL 17, puis l'image Docker, démarrée sous un UID arbitraire en lecture seule hors
`/tmp`, avec des journaux JSON), `frontend` (lint, format, tests avec seuils de couverture,
builds, e2e Playwright sur Chromium, Firefox et WebKit) et `journeys` (parcours du quickstart
contre le vrai webservice, sur les trois navigateurs).

### Sessions Claude Code dans le cloud

Le hook `SessionStart` ([`.claude/settings.json`](.claude/settings.json),
[`.claude/hooks/session-start.sh`](.claude/hooks/session-start.sh)) prépare la session : il installe
Temurin 25 et Node 24 s'ils manquent, lance `./mvnw dependency:go-offline` dans `backend/` et
`npm ci` dans `frontend/` et `contract/` (les dossiers absents sont ignorés). Il ne tourne que dans
le cloud (`CLAUDE_CODE_REMOTE=true`) et reste exécutable à la main.

## Sécurité du dépôt

Le dépôt applique l'outillage de sécurité exigé par la constitution
([`.specify/memory/constitution.md`](.specify/memory/constitution.md)) :

| Outil | Fichiers | Quand |
|-------|----------|-------|
| **Dependabot** | [`.github/dependabot.yml`](.github/dependabot.yml) | Une fois par mois, 7 jours après la sortie d'une version, pour `frontend/`, `contract/` (npm), `backend/` (Maven et Docker) et les GitHub Actions |
| **CodeQL** | [`.github/workflows/codeql.yml`](.github/workflows/codeql.yml) | Sur chaque PR, sur `main` et chaque lundi, pour Java, JavaScript/TypeScript et les workflows GitHub Actions |
| **Gitleaks** | [`.github/workflows/gitleaks.yml`](.github/workflows/gitleaks.yml), [`.gitleaks.toml`](.gitleaks.toml), [`.gitleaksignore`](.gitleaksignore) | Sur chaque PR et sur `main` |
| **Secret scanning et push protection** | Réglage GitHub | À chaque push : GitHub refuse un push qui contient un secret reconnu |
| **Dependency Review** | [`.github/workflows/dependency-review.yml`](.github/workflows/dependency-review.yml) | Sur chaque PR : bloque l'ajout d'une dépendance avec une vulnérabilité haute ou critique |
| **actionlint** | [`.github/workflows/actionlint.yml`](.github/workflows/actionlint.yml) | Sur chaque PR et sur `main` : vérifie les workflows GitHub Actions |

### Réglages GitHub à activer à la main

Dans *Settings* du dépôt, menu **Advanced Security** (anciennement *Code security*) :

1. **Dependabot** : activer *Dependabot alerts* et *Dependabot security updates*.
2. **Code scanning** : laisser *CodeQL analysis* en configuration avancée (le workflow
   `codeql.yml`). Si la configuration par défaut est activée, la désactiver, sinon les
   deux entrent en conflit.
3. **Secret Protection** (ou *Secret scanning*) : l'activer, puis activer **Push
   protection**. En cas de faux positif, GitHub propose de débloquer le push avec une
   raison ; un vrai secret, lui, se révoque.
4. **Branches → règle de protection de `main`** :
   - exiger une pull request avec au moins une relecture ;
   - exiger que les contrôles passent avant le merge : `Analyze (actions)`,
     `Analyze (java-kotlin)`, `Analyze (javascript-typescript)`, `Gitleaks`,
     `Dependency Review` et `actionlint`, puis les jobs de CI (`ci.yml`) quand ils
     existeront ;
   - exiger que la branche soit à jour avec `main`.

### Règles

- **Avant une release** (étiquette `v*`) : vérifier dans *Security → Dependabot alerts* et
  *Security → Code scanning* qu'aucune alerte de sévérité haute ou critique n'est ouverte.
  Sinon, corriger, ou justifier la dérogation par écrit dans la PR ou l'issue
  correspondante.
- **Secret détecté par Gitleaks** : le révoquer d'abord, puis le retirer du dépôt.
  Seuls les **faux positifs vérifiés** vont dans `.gitleaksignore`, un par un, avec un
  commentaire qui explique pourquoi ce n'est pas un secret.
- Les exemples du contrat (`contract/examples/`) ne contiennent que des jetons factices :
  c'est la seule exception déclarée dans `.gitleaks.toml`.
