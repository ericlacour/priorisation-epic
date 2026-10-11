# Research : Session de priorisation WSJF

**Feature** : `001-wsjf-prioritization-session` | **Date** : 2026-10-11 | **Plan** : [plan.md](./plan.md)

Ce document tranche les inconnues du contexte technique. Les choix imposés par l'utilisateur
sont : back Java, front Angular, PostgreSQL, déploiement en pod (Kubernetes). Chaque décision
suit le format Décision / Justification / Alternatives écartées.

## R1. Versions du socle

- **Décision** : Java 25 (LTS), Spring Boot 4.0.x, Angular 21.x, TypeScript fourni par
  Angular, PostgreSQL 17. Build back avec Maven (wrapper `mvnw`), build front avec npm et
  Angular CLI. On prend la dernière version patch au démarrage du projet.
- **Justification** : ce sont les dernières LTS ou versions stables majeures à la date du
  plan, avec Dependabot pour les tenir à jour. Angular 21 fournit Vitest et le mode
  « zoneless » par défaut, ce qui simplifie les tests et le rendu.
- **Alternatives écartées** : Java 21 avec Spring Boot 3.5 (fonctionne, mais on démarrerait
  avec une génération de retard) ; Gradle (aucun avantage ici, Maven est plus répandu en
  entreprise et mieux couvert par Dependabot).

## R2. Interprétation de « Pod » et forme du déploiement

- **Décision** : une **image de conteneur unique** (Spring Boot sert l'API et les fichiers
  statiques du build Angular), déployée sur Kubernetes : Deployment, Service, Ingress
  interne, ConfigMap, Secret, avec des manifestes Kustomize. PostgreSQL est fourni par
  l'infrastructure (instance managée ou opérateur existant), pas par ces manifestes. Le
  conteneur tourne en non-root, avec un système de fichiers en lecture seule, ce qui le
  rend compatible avec OpenShift.
- **Justification** : une seule image signifie un seul artefact à construire, scanner et
  déployer. Il n'y a pas de configuration CORS (même origine), et le flux temps réel ne
  traverse pas de reverse proxy intermédiaire. L'application n'a qu'une dizaine
  d'utilisateurs simultanés par session : la séparer en deux services n'apporte rien.
- **Alternatives écartées** : deux images, une nginx pour le front et une pour le back
  (plus d'artefacts, CORS ou proxy à configurer) ; Helm (inutile pour un seul
  déploiement, Kustomize suffit).
- **Hypothèse** : l'Ingress n'est exposé que sur le réseau interne de l'entreprise, ce qui
  découle de la spec (pas d'authentification, toutes les sessions visibles). Une
  NetworkPolicy limite l'accès à la base au seul pod applicatif.

## R3. Temps réel (FR-015, SC-002 : moins de 2 s)

- **Décision** : **Server-Sent Events (SSE)** du serveur vers les navigateurs, et REST pour
  toutes les actions. Les événements SSE ne transportent **aucune donnée métier** : ils
  annoncent seulement « la session X a changé, version N, type d'événement ». Le client
  relit alors sa vue de la session par REST, et cette vue est filtrée côté serveur selon
  son rôle (masquage FR-019 et FR-019a). Pour que plusieurs pods puissent tourner, la
  diffusion entre pods passe par `LISTEN/NOTIFY` de PostgreSQL.
- **Justification** :
  - Comme aucune donnée ne circule dans le flux, une donnée masquée ne peut pas fuiter
    (SC-004). Le serveur reste la seule autorité sur ce que chaque rôle peut voir.
  - SSE fonctionne en HTTP standard (Ingress, proxys), avec reconnexion automatique dans
    le navigateur.
  - `LISTEN/NOTIFY` évite d'ajouter un broker (Redis, Kafka) pour une charge minime.
- **Alternatives écartées** :
  - WebSocket et STOMP : bidirectionnel inutile ici, plus de configuration côté Ingress.
  - Pousser l'état complet par événement : il faudrait filtrer chaque message par
    destinataire, avec un risque de fuite.
  - Polling : moins réactif, et plus de charge.

## R4. Identification sans authentification (constitution III, FR-002, FR-002a)

- **Décision** :
  - **Lien d'invitation** : `/s/{inviteCode}`, un code aléatoire de 128 bits encodé en
    base64url.
  - **Lien d'animation** : `/s/{inviteCode}/animer#{animationToken}`, un jeton aléatoire
    de 256 bits placé dans le fragment de l'URL, donc jamais envoyé dans les journaux du
    serveur ou de l'Ingress. La base ne stocke que son empreinte SHA-256.
  - **Jeton de participant** : en rejoignant la session (pseudo), le navigateur reçoit un
    jeton aléatoire conservé dans `localStorage` et envoyé dans l'en-tête
    `X-Participant-Token`. Il permet de reprendre sa place après un rechargement de page.
    Il ne prouve pas l'identité.
  - **Transmission du rôle** : un nouveau jeton d'animation est généré pour le
    bénéficiaire, et l'ancien est invalidé (son empreinte est remplacée).
- **Justification** : c'est conforme à la constitution (ni mot de passe ni compte), tout en
  évitant qu'un participant prenne le rôle d'animateur par erreur. Le fragment `#` garde le
  secret hors des journaux.
- **Alternatives écartées** : un rôle lié au pseudo (option A refusée en clarification) ;
  un cookie de session serveur (aucun intérêt sans compte, et plus fragile quand plusieurs
  pods tournent).

## R5. Calcul du score et précision (FR-012 à FR-014, constitution I et II)

- **Décision** :
  - Le module de domaine est en Java pur, sans Spring : `PrioritizationMethod`, avec
    `WsjfMethod` comme seule implémentation en v1.
  - Le CoD et le JS sont des entiers. Le WSJF est représenté comme une fraction exacte
    (`cod/js`). Le tri compare les fractions par produit croisé (`cod1*js2` contre
    `cod2*js1`), donc sans arrondi.
  - L'affichage arrondit à 2 décimales (au plus proche, la moitié vers le haut) avec une
    virgule décimale.
  - En cas d'égalité, la fonctionnalité au CoD le plus élevé passe devant, puis on
    départage par identifiant, en ordre alphabétique insensible à la casse.
  - Les fonctionnalités incomplètes, ou dont une valeur est hors échelle, sont placées en
    fin de tableau.
- **Justification** : le tri est exact et reproductible, quel que soit l'arrondi (FR-013),
  ce qui permet de tester des propriétés de façon exhaustive. Une interface de méthode
  permet d'ajouter d'autres méthodes plus tard (FR-017, Q1 : A) sans rien configurer en v1.
- **Alternatives écartées** : `double` (erreurs d'arrondi aux égalités) ; `BigDecimal` avec
  division (oblige à choisir une précision arbitraire).
- **Où se fait le calcul** : seulement côté serveur. Le front affiche ce que l'API renvoie,
  y compris le détail du calcul (FR-016), pour garantir une seule source de vérité.

## R6. Échelles (FR-009 à FR-011)

- **Décision** : `Scale` est un objet valeur du domaine, avec un type (`CONTINUOUS` ou
  `FIBONACCI`) et une borne.
  - En continu, les valeurs autorisées vont de 1 à la borne. La borne va de 2 à 100, et
    vaut 10 par défaut.
  - En Fibonacci, les valeurs autorisées sont celles de {1, 2, 3, 5, 8, 13, 20, 40, 100}
    qui ne dépassent pas la borne. La borne fait partie de cette suite et vaut 20 par
    défaut.
  - Une valeur « à revoir » n'est **pas stockée comme un état** : elle est **déduite** en
    comparant la valeur à l'échelle courante.
- **Justification** : comme rien n'est stocké, il n'y a pas d'état à resynchroniser. Un
  changement d'échelle ne fait que valider puis enregistrer la nouvelle échelle, et le
  serveur renvoie la liste des valeurs impactées pour l'avertissement (FR-011).
- **Alternatives écartées** : un drapeau `needsReview` par valeur (risque de désaccord entre
  le drapeau et l'échelle).

## R7. Modifications concurrentes (cas limite « Modifications simultanées »)

- **Décision** : verrouillage optimiste avec une colonne `version` (JPA `@Version`) sur
  Feature et Session. Chaque écriture envoie la version lue. En cas de conflit, l'API
  répond `409 Conflict` avec la valeur actuelle, et l'interface la montre avant de
  confirmer ou d'annuler. L'ouverture et la révélation d'un tour verrouillent la ligne de
  la session (`SELECT … FOR UPDATE`), ce qui garantit qu'une fonctionnalité n'est que dans
  un seul tour ouvert à la fois (FR-018).
- **Justification** : la contention est faible (un seul animateur écrit les valeurs
  retenues) ; le verrouillage optimiste suffit et respecte la constitution III, qui
  interdit l'écrasement silencieux.

## R8. Historique (FR-025, constitution III)

- **Décision** : une table d'audit applicative, `change_log`, alimentée par les services
  métier dans la même transaction que la modification. Elle enregistre l'auteur (pseudo),
  la date, le type d'entité, l'identifiant, l'action, le champ, l'ancienne et la nouvelle
  valeur (en JSON).
- **Alternatives écartées** : Hibernate Envers (historique trop technique, sans pseudo
  d'auteur naturel) ; des triggers SQL (l'auteur est difficile à transmettre, et c'est plus
  dur à tester).

## R9. Import et export (FR-007, FR-007a, FR-008, FR-023, FR-024, constitution VI)

- **Excel** : Apache POI (XSSF), première feuille, en-têtes imposés comparés sans tenir
  compte de la casse ni des espaces. Le fichier est limité à 5 Mo et 1 000 lignes. Le
  modèle `modele-import.xlsx` est généré à la demande par le serveur.
- **CSV** : Apache Commons CSV, encodé en UTF-8 avec BOM et séparé par `;`, pour s'ouvrir
  directement dans un Excel configuré en français. Les décimales utilisent la virgule.
  L'import accepte `;` ou `,`, détecté sur la ligne d'en-tête.
- **Confluence** : deux sorties pour le même tableau :
  - un tableau HTML copié dans le presse-papiers (bouton « Copier pour Confluence »), qui
    se colle directement dans l'éditeur Confluence Cloud ou Data Center ;
  - un fichier texte au format *wiki markup* (`||en-tête||` et `|cellule|`), pour
    l'insertion « Markup » ou les instances plus anciennes.
- **JSON** : Jackson, avec un format versionné (`formatVersion: 1`). Il contient la
  méthode, la version de la méthode, l'échelle, les fonctionnalités, les tours et les
  votes. Un test d'aller-retour vérifie qu'export puis import redonnent des données et
  des scores identiques (SC-008).
- **Aperçu avant import (FR-008)** : l'import se fait en deux temps. `POST …/imports`
  analyse le fichier et renvoie un aperçu avec un `previewId` conservé 15 minutes en base.
  `POST …/imports/{previewId}/confirm` applique ensuite les lignes valides dans une seule
  transaction. Rien n'est écrit avant la confirmation.

## R10. Persistance

- **Décision** : Spring Data JPA (Hibernate) et migrations Flyway versionnées
  (`V1__init.sql` …). Les clés sont des UUID. Une contrainte d'unicité porte sur
  `(session_id, lower(external_id))` et une autre sur `(session_id, lower(pseudo))`. Des
  contraintes `CHECK` imposent `value >= 1` sur les critères.
- **Justification** : le schéma est versionné par migrations, comme l'exige la
  constitution (contraintes techniques), et les règles d'unicité de la spec sont appliquées
  par la base elle-même.

## R11. Langue, textes et conventions (constitution V)

- **Décision** :
  - Les **identifiants de code sont en anglais**, partout (Java, TypeScript, SQL, JSON).
    Les termes métier gardent leur sigle (`bv`, `tc`, `rrOe`, `js`, `cod`, `wsjf`). Cette
    convention est fixée ici, comme l'exige le principe V.
  - Les **textes d'interface** sont centralisés dans un seul catalogue,
    `frontend/src/app/i18n/messages.fr.ts`.
  - Les **messages d'erreur métier** du back sont renvoyés dans un *Problem Details*
    (RFC 9457) dont le champ `detail` est en français. Ces messages sont centralisés dans
    `messages.properties`.
  - La locale Angular est `fr-FR`, ce qui donne la virgule décimale et les dates au format
    JJ/MM/AAAA.
- **Alternatives écartées** : `@angular/localize`, qui impose un build par langue et n'a
  pas d'intérêt avec une seule langue ; Transloco (une dépendance de plus pour le même
  résultat).

## R12. Stratégie de tests (constitution II)

- **Domaine** : JUnit 5, AssertJ, et jqwik pour les tests de propriétés : tri total,
  cohérence du produit croisé, aller-retour d'export, validation d'échelle.
- **Back** : Spring Boot Test, MockMvc, et Testcontainers avec PostgreSQL 17 pour les tests
  d'intégration et de contrat REST. ArchUnit vérifie que le paquet `domain` ne dépend ni
  de Spring, ni de JPA, ni de l'API.
- **Front** : Vitest (exécuteur par défaut d'Angular 21) avec Angular Testing Library.
- **Bout en bout** : Playwright, avec plusieurs contextes de navigateur (un animateur et
  deux participants) pour vérifier le masquage (SC-004) et la propagation en moins de 2 s
  (SC-002).
- **Couverture** : JaCoCo, avec un seuil de 90 % de lignes sur le paquet `domain`.

## R13. Outillage de sécurité et CI (constitution, contraintes techniques)

- **Dependabot** (`.github/dependabot.yml`) : écosystèmes `maven` (`/backend`), `npm`
  (`/frontend`), `docker` (`/`) et `github-actions` (`/`), avec une fréquence
  hebdomadaire et des mises à jour mineures et patch regroupées.
- **CodeQL** (`.github/workflows/codeql.yml`) : langages `java-kotlin`,
  `javascript-typescript` et `actions`, sur chaque PR, sur `main` et une fois par semaine.
- **Gitleaks** (`.github/workflows/gitleaks.yml`) : sur chaque PR et sur `main`, avec un
  fichier `.gitleaks.toml` qui étend la configuration par défaut.
- **CI** (`.github/workflows/ci.yml`) : build et tests du back (avec Testcontainers), du
  front, de l'image Docker et des tests e2e Playwright.
- **Protection de branche** : CI, CodeQL et Gitleaks sont des contrôles obligatoires pour
  merger. Ce réglage se fait dans GitHub et sera documenté dans le quickstart.

## R14. Observabilité et exploitation

- **Décision** : Spring Boot Actuator (sondes `liveness` et `readiness` pour Kubernetes),
  journaux JSON structurés (fonction native de Spring Boot), et métriques Micrometer
  exposées au format Prometheus. Le jeton d'animation, le jeton de participant et le code
  d'invitation ne sont **jamais** journalisés.
- **Justification** : c'est le minimum pour faire tourner un pod (sondes, journaux
  exploitables), sans dépendre d'un outil d'observabilité en particulier.
