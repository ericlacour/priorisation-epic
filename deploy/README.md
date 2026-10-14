# Déploiement

L'application est hébergée sur **Render** et sa base sur **Neon** (décision R11 de
[`research.md`](../specs/001-wsjf-prioritization-session/research.md)).

| Élément | Service | Adresse actuelle |
|---------|---------|------------------|
| Front Angular | Render, Static Site `priorisation-epic-app` | https://priorisation-epic-app.onrender.com (celle à donner aux participants) |
| Webservice | Render, Web Service Docker `priorisation-epic-api` | https://priorisation-epic.onrender.com |
| Base PostgreSQL 17 | Neon, projet `priorisation-epic`, AWS Europe (Frankfurt) | Adresse directe, sans `-pooler` |

Le webservice a gardé l'adresse `priorisation-epic.onrender.com` de sa création : Render fixe
l'adresse `*.onrender.com` d'un service quand il le crée, et un changement de nom ne la modifie
pas.

[`render.yaml`](render.yaml) décrit les deux services Render. Il sert à les recréer à
l'identique ; les services actuels ont été créés à la main avec les mêmes réglages.

## Règles d'usage

- **Pas de données confidentielles** tant que l'application est sur Neon : le site est public,
  sans authentification, et les données sont chez un fournisseur tiers.
- **Sauvegardes** : l'offre gratuite de Neon ne restaure que les **6 dernières heures**. Une fois
  l'export livré (user story 4), faire un export JSON après chaque atelier important. D'ici là,
  garder une copie des valeurs de son côté.
- **Avant une mise à jour** : vérifier dans *Security → Dependabot alerts* et *Security → Code
  scanning* qu'aucune alerte haute ou critique n'est ouverte (voir le
  [README racine](../README.md#règles), section « Sécurité du dépôt »).
- **Mettre à jour en dehors des ateliers** : un redéploiement coupe les connexions en cours.

## Offres gratuites et mises en veille

| | Limites | Mise en veille |
|---|---|---|
| Neon | 0,5 Go par projet, 100 heures de calcul par mois, restauration sur 6 heures | Après 5 minutes sans requête ; réveil automatique en moins d'une seconde à la connexion suivante |
| Render (Web Service) | 512 Mo de mémoire | Après environ 15 minutes sans trafic ; réveil en une minute environ. Le front affiche l'écran « réveil du service » pendant ce temps |
| Render (Static Site) | — | Aucune |

Pendant un atelier, le `heartbeat` WebSocket garde l'API éveillée. Le pool de connexions valide
chaque connexion avant usage, ce qui couvre la mise en veille de Neon.

## 1. Créer la base sur Neon

1. Créer un compte sur https://neon.com (GitHub, Google ou e-mail, sans carte bancaire).
2. Créer le projet :
   - **Project name** : `priorisation-epic` ;
   - **Postgres version** : **17** ;
   - **Region** : **AWS Europe Central 1 (Frankfurt)**, comme l'API.
3. Récupérer la chaîne de connexion : bouton **Connect**, **désactiver « Connection pooling »**
   (adresse directe, sans `-pooler` : Flyway et les requêtes préparées de Hibernate fonctionnent
   sans précaution, et l'application a son propre pool de 5 connexions).
4. Retirer `&channel_binding=require` à la fin de la chaîne : le pilote JDBC ne connaît pas ce
   paramètre sous ce nom. Il reste par exemple :

   ```
   postgresql://neondb_owner:MOTDEPASSE@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```

5. La garder dans un gestionnaire de mots de passe. **Elle ne va jamais dans le dépôt** (Gitleaks
   et la push protection la bloquent ; un secret poussé se révoque).

Les tables sont créées par les migrations Flyway au premier démarrage de l'API.

## 2. Créer les services sur Render

### Avec le blueprint

Dans Render : **New + → Blueprint**, choisir le dépôt, branche `main`, et indiquer
`deploy/render.yaml` comme chemin du blueprint. Render demande alors les trois variables
`sync: false` :

| Variable | Service | Valeur |
|----------|---------|--------|
| `DATABASE_URL` | API | La chaîne Neon de l'étape 1 |
| `ALLOWED_ORIGINS` | API | L'adresse du front, sans `/` final |
| `API_BASE_URL` | Front | L'adresse de l'API, en `https://`, sans `/` final |

Les adresses ne sont connues qu'après la création : si l'une n'est pas celle prévue, corriger
les variables comme à l'étape 3.

### À la main

**Web Service** (**New + → Web Service**) :

| Champ | Valeur |
|-------|--------|
| Language | **Docker** |
| Branch | `main` |
| Region | Frankfurt (EU Central) |
| Root Directory | `backend` (*Dockerfile Path* et *Docker Build Context Directory* : valeurs par défaut) |
| Instance Type | Free |
| Environment | `DATABASE_URL` et `ALLOWED_ORIGINS` (ne pas définir `PORT`, fourni par Render) |
| Advanced → Health Check Path | `/api/health` |
| Advanced → Auto-Deploy | Off |

`PROXY_SECRET` ne sert que si Cloudflare est placé devant l'API ; sans lui, l'adresse du client
est lue dans `X-Forwarded-For`, posé par Render.

**Static Site** (**New + → Static Site**) :

| Champ | Valeur |
|-------|--------|
| Branch | `main` |
| Root Directory | `frontend` |
| Build Command | `npm ci && npm run build` |
| Publish Directory | `dist/frontend/browser` (relatif à `frontend`) |
| Environment | `API_BASE_URL` et `NODE_VERSION` = `24.15.0` |
| Redirects/Rewrites | Source `/*`, Destination `/index.html`, Action **Rewrite** |
| Headers (chemin `/*`) | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` |

Sans la règle *Rewrite*, recharger une page `/s/…` renvoie une erreur 404. Sans `API_BASE_URL`
en HTTPS, le build échoue volontairement.

## 3. Relier le front et l'API

Chaque service doit connaître l'adresse exacte de l'autre :

- API → **Environment** → `ALLOWED_ORIGINS` = adresse du front, puis **Save, rebuild and
  deploy** ;
- Front → **Environment** → `API_BASE_URL` = adresse de l'API, puis **Manual Deploy → Clear build
  cache & deploy** (la valeur est figée au build dans `config.json` et dans la CSP).

`ALLOWED_ORIGINS` accepte plusieurs origines séparées par des virgules ; un `*` ou un chemin
empêche l'API de démarrer.

## 4. Vérifier

1. `https://priorisation-epic.onrender.com/api/health` répond `UP`.
2. Le front s'ouvre ; après une période d'inactivité, l'écran « réveil du service » s'affiche
   puis l'application répond.
3. Créer une session, l'ouvrir dans un second navigateur : une modification apparaît des deux
   côtés sans recharger.
4. Recharger une page `/s/…` (F5) : la session se réaffiche.

| Symptôme (console du navigateur ou journaux Render) | Cause |
|---|---|
| Erreur CORS ou WebSocket refusé | `ALLOWED_ORIGINS` ne correspond pas exactement à l'adresse du front |
| `Refused to connect` (Content Security Policy) | `API_BASE_URL` ne correspond pas à l'adresse de l'API ; redéployer le front après correction |
| `DATABASE_URL invalide` au démarrage de l'API | Chaîne mal copiée |
| Échec de connexion à la base | Adresse avec `-pooler`, ou `sslmode=require` absent |
| 404 en rechargeant une page `/s/…` | Règle *Rewrite* absente |

## 5. Mettre à jour

Après un merge sur `main`, en dehors des ateliers : **Manual Deploy → Deploy latest commit**,
d'abord sur l'API (les migrations Flyway s'appliquent à son démarrage), puis sur le front.

Le déploiement automatique sur une étiquette `v*` (`deploy/render-deploy.sh` et
`.github/workflows/deploy.yml`, tâche T062) n'est pas encore en place ; aucun secret GitHub n'est
donc nécessaire pour l'instant.

## Secret exposé

Si la chaîne Neon a fuité : dans Neon, **Roles → Reset password**, puis mettre la nouvelle
chaîne dans `DATABASE_URL` de l'API (**Save, rebuild and deploy**).

## Changer d'hébergement

L'image est compatible OpenShift et toute la configuration passe par des variables
d'environnement : une migration ne touche que `deploy/`. Pour la base, exporter les données de
Neon (`pg_dump`), les restaurer chez la nouvelle cible, puis changer `DATABASE_URL`.
