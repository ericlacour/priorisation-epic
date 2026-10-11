# Quickstart : validation de la feature 001 (session de priorisation WSJF)

Ce guide sert à **valider** la feature de bout en bout. Les détails de l'API sont dans
[contracts/openapi.yaml](./contracts/openapi.yaml), les formats de fichiers dans
[contracts/file-formats.md](./contracts/file-formats.md) et le modèle de données dans
[data-model.md](./data-model.md).

## Prérequis

- JDK 25 (Temurin), Node.js 22 LTS et npm.
- Docker, qui fait tourner Testcontainers et sert à construire l'image.
- Facultatif : un cluster Kubernetes local (kind ou minikube) avec `kubectl` et
  `kustomize`, pour valider le déploiement en pod.

## Lancer en local

```bash
# Base PostgreSQL locale
docker run -d --name wsjf-db -e POSTGRES_DB=wsjf -e POSTGRES_USER=wsjf \
  -e POSTGRES_PASSWORD=wsjf -p 5432:5432 postgres:17

# Back-end (profil dev : Flyway applique les migrations au démarrage)
cd backend && ./mvnw spring-boot:run -Dspring-boot.run.profiles=dev

# Front-end (serveur de dev, avec un proxy de /api vers :8080)
cd frontend && npm ci && npm start          # http://localhost:4200
```

## Lancer les contrôles qualité (identiques à la CI)

```bash
cd backend  && ./mvnw verify                # unitaires, propriétés jqwik, ArchUnit, Testcontainers, JaCoCo ≥ 90 % sur domain
cd frontend && npm run lint && npm test     # Vitest
cd frontend && npx playwright test          # e2e multi-navigateurs (back et front lancés)
docker build -t priorisation-epic:dev .     # image unique
```

**Résultat attendu** : tout passe au vert. `./mvnw verify` échoue si le paquet `domain`
dépend de Spring ou de JPA (règle ArchUnit), ou si la couverture du domaine passe sous 90 %.

## Scénarios de validation (à dérouler à la main ou par les tests e2e)

| # | Parcours | Étapes | Résultat attendu |
|---|----------|--------|------------------|
| V1 | US1 : saisie directe | Créer une session « Démo » avec le pseudo « anim ». Ajouter F-1 (8, 5, 3, 4) et F-2 (2, 2, 2, 3) | F-1 : CoD 16, WSJF 4,00, rang 1. F-2 : WSJF 2,00. Le détail affiche « CoD = 8 + 5 + 3 = 16 ; WSJF = 16 / 4 = 4,00 » |
| V2 | US1 : recalcul | Passer le JS de F-1 à 10 | F-1 passe à 1,60 et F-2 passe en tête, sans rechargement |
| V3 | US1 : validation | Saisir JS = 0, puis 11, puis 2,5 | Les trois saisies sont refusées avec « … entier entre 1 et 10 » |
| V4 | US2 : rejoindre | Ouvrir le lien d'invitation dans deux autres navigateurs (« alice », « bob ») | Ils apparaissent dans la liste des participants chez tous |
| V5 | US2 : masquage | Ouvrir un tour sur F-1 et F-2. Alice vote | Bob et l'animateur voient « alice : 1/2 » sans valeurs. Chez Alice et Bob, F-1 et F-2 sont « vote en cours », sans valeurs ni WSJF |
| V6 | US2 : révélation | Révéler | Les votes, le minimum et le maximum s'affichent chez tous. Bob apparaît « n'a pas voté » |
| V7 | US2 : consensus et relance | Fixer les valeurs de F-1, puis relancer un tour sur F-2 seule | F-1 est mise à jour et retriée. Le tour 2 ne contient que F-2, et le tour 1 reste consultable |
| V8 | Rôle animateur | Ouvrir le lien d'animation dans un autre navigateur. Transmettre le rôle à Alice | Le nouveau poste a les droits d'animateur. Après la transmission, Alice est animatrice et l'ancien lien est refusé (403) |
| V9 | US3 : import | Télécharger le modèle, le remplir avec 20 lignes dont 2 invalides, puis l'importer | L'aperçu montre 18 lignes valides et 2 rejetées avec leur motif. Après confirmation, 18 fonctionnalités sont créées. Un fichier sans en-tête « Titre » est refusé en entier |
| V10 | US3 : échelle | Passer en Fibonacci avec la borne 13, alors que des valeurs 4 et 10 existent | Un avertissement liste les valeurs impactées. Après confirmation, elles sont marquées « à revoir » et la fonctionnalité sort du calcul |
| V11 | US4 : exports | Exporter en CSV, puis copier pour Confluence et coller dans une page | Le CSV s'ouvre dans Excel FR avec accents et virgules corrects. Le tableau collé dans Confluence est conforme |
| V12 | US4 : aller-retour | Exporter en JSON, puis réimporter dans une nouvelle session | Fonctionnalités, échelle et scores identiques |
| V13 | US5 : consultation | Clôturer, puis rouvrir depuis la liste des sessions | La session est en lecture seule, et l'historique montre les auteurs et les dates. L'animateur peut la rouvrir avec son lien |
| V14 | Concurrence | Modifier le BV de F-1 dans deux onglets d'animateur | Le second est prévenu (409) et voit la valeur actuelle avant de confirmer |

## Valider le déploiement en pod

```bash
kubectl apply -k deploy/k8s/overlays/local
kubectl rollout status deploy/priorisation-epic
kubectl port-forward svc/priorisation-epic 8080:80
curl -s localhost:8080/actuator/health/readiness   # {"status":"UP"}
```

**Résultat attendu** : le pod tourne en non-root, avec un système de fichiers en lecture
seule. Les sondes de disponibilité (readiness) et de vie (liveness) sont `UP`. Avec deux
réplicas, une modification faite sur un pod est notifiée aux clients de l'autre pod
(diffusion `LISTEN/NOTIFY`).

## Valider l'outillage de sécurité (constitution)

| Outil | Vérification | Résultat attendu |
|-------|--------------|------------------|
| **Dependabot** | Onglet *Insights → Dependency graph → Dependabot* | Les écosystèmes `maven`, `npm`, `docker` et `github-actions` sont surveillés, et des PR de mise à jour apparaissent |
| **CodeQL** | Ouvrir une PR | Le contrôle « CodeQL » s'exécute pour `java-kotlin`, `javascript-typescript` et `actions` |
| **Gitleaks** | Ouvrir une PR de test contenant un faux secret, par exemple une clé AWS d'exemple | Le contrôle « Gitleaks » échoue. Fermer la PR sans la merger |
| **Protection de branche** | *Settings → Branches → main* | CI, CodeQL et Gitleaks sont des contrôles obligatoires avant le merge |
