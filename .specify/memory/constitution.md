# Priorisation Epic Constitution

## Core Principles

### I. Score transparent et explicable

Chaque priorité affichée DOIT pouvoir être expliquée à l'utilisateur.

- Les critères, leurs poids et la formule de calcul DOIVENT être visibles dans l'application
  pour tout epic classé.
- Pour un epic donné, l'utilisateur DOIT pouvoir voir la contribution de chaque critère à
  son score final.
- Aucun facteur caché, aucun ajustement manuel non tracé et aucun calcul opaque (boîte
  noire, heuristique non documentée) ne sont autorisés à modifier un classement.
- Toute modification de la méthode de scoring (ajout ou suppression d'un critère,
  changement de poids ou de formule) DOIT être documentée et visible des utilisateurs.

**Rationale** : un classement n'est utile que si l'équipe lui fait confiance. Une priorité
qu'on ne peut pas expliquer sera contestée ou ignorée.

### II. Logique de priorisation testée

La logique métier DOIT être couverte par des tests automatisés avant d'être mergée.

- Le calcul des scores, le tri, la gestion des égalités et la validation des saisies
  DOIVENT avoir des tests unitaires.
- Les cas limites DOIVENT être testés : valeurs manquantes, nulles ou extrêmes, égalités
  de score, liste vide.
- La logique de scoring DOIT être isolée de l'interface et du stockage pour pouvoir être
  testée sans navigateur ni base de données.
- Un bug de calcul corrigé DOIT être accompagné d'un test qui le reproduit.
- La CI DOIT exécuter les tests ; une PR dont les tests échouent ne peut pas être mergée.

**Rationale** : une erreur dans le score fausse silencieusement les décisions de l'équipe.
Les tests sont le filet de sécurité du cœur du produit.

### III. Conçu pour le travail en équipe

L'outil sert une équipe qui partage les mêmes epics et le même classement.

- Les données (epics, critères, évaluations) DOIVENT être persistées côté serveur et
  partagées entre les membres de l'équipe. Aucune donnée de référence ne vit uniquement
  dans le navigateur d'un utilisateur.
- Chaque modification d'une évaluation ou d'un paramètre de scoring DOIT enregistrer son
  auteur et sa date.
- Les modifications concurrentes NE DOIVENT PAS s'écraser silencieusement : un conflit
  DOIT être détecté puis signalé ou résolu explicitement.
- **Version 1 : identification par pseudo.** Un utilisateur entre dans l'application en
  saisissant un pseudo. Il n'y a ni mot de passe, ni authentification, ni gestion des
  comptes ou des rôles. Le pseudo DOIT être demandé avant toute modification et sert
  d'auteur dans l'historique des modifications.
- Le pseudo est déclaratif : il identifie un auteur sans le prouver. Aucune
  fonctionnalité de la version 1 NE DOIT dépendre d'une identité vérifiée.
- L'authentification et la gestion des utilisateurs sont hors périmètre de la version 1.
  Pour les ajouter, il faut d'abord amender cette constitution.

**Rationale** : la priorisation est une décision collective. L'équipe doit travailler sur
une source de vérité unique et savoir qui a changé quoi.

### IV. Application web centrée sur l'usage

Le produit est une application web. Chaque fonctionnalité part d'un besoin utilisateur.

- Chaque fonctionnalité DOIT partir d'une spec qui décrit des parcours utilisateur
  testables indépendamment, priorisés (P1, P2…).
- Les écrans principaux (liste priorisée, saisie d'une évaluation) DOIVENT rester
  utilisables sur les navigateurs récents du marché, au clavier et sur un écran de
  portable.
- Les messages d'erreur DOIVENT dire à l'utilisateur ce qui s'est passé et comment
  corriger sa saisie.

**Rationale** : un outil de priorisation n'a de valeur que s'il est utilisé en atelier,
rapidement et sans friction.

### V. Produit en français

Tout ce que lisent les utilisateurs et l'équipe produit est rédigé en français.

- L'interface (libellés, messages, aide, e-mails éventuels) DOIT être en français.
- Les specs, plans, tâches et la documentation utilisateur DOIVENT être rédigés en
  français.
- Les formats affichés DOIVENT suivre les conventions françaises : virgule décimale,
  dates JJ/MM/AAAA.
- Les identifiants de code (variables, fonctions, tables) PEUVENT rester en anglais. Ils
  DOIVENT alors suivre une convention unique, fixée dans le premier `plan.md`.
- Les **contrats techniques d'échange** (OpenAPI, AsyncAPI, JSON Schema et leurs
  exemples, dans `contract/` comme dans leur conception sous `specs/*/contracts/`)
  PEUVENT être rédigés entièrement en anglais, descriptions comprises. Cela les garde
  alignés avec les autres projets de l'équipe (planning-poker). Les textes qu'ils
  contiennent et qui s'affichent aux utilisateurs restent en français.
- Tous les textes de l'interface DOIVENT être centralisés, et non dispersés en dur dans le
  code, pour pouvoir être relus et corrigés en un seul endroit.

**Rationale** : l'outil sert une équipe francophone en atelier. Une interface ou une
documentation mélangeant les langues ralentit l'usage et nuit à la compréhension du score.

### VI. Données portables

Les données de l'équipe lui appartiennent et DOIVENT pouvoir sortir de l'outil, puis y
revenir, sans perte.

- Les epics, critères, poids et évaluations DOIVENT être exportables en CSV et en JSON.
- L'export JSON DOIT contenir assez d'informations pour recalculer chaque score à
  l'identique, ce qui inclut la méthode de scoring (voir Principe I).
- L'import CSV et JSON DOIT valider les données et signaler précisément les lignes
  rejetées, sans rien importer partiellement en silence.
- Un export suivi d'un import DOIT redonner les mêmes **données de priorisation**
  (fonctionnalités, critères, valeurs, échelle, méthode) et les mêmes scores. Ce test
  d'aller-retour est obligatoire (voir Principe II). Les traces d'atelier (tours de vote
  et votes) sont exportées, mais n'ont pas à être réimportées.
- Les formats d'export sont documentés et versionnés. Une rupture de format DOIT être
  annoncée et accompagnée d'une conversion des anciens fichiers.

**Rationale** : l'équipe doit pouvoir analyser ses données dans d'autres outils, les
sauvegarder et changer d'outil sans dépendre de celui-ci.

## Contraintes techniques

- **Architecture** : application web client/serveur, avec la logique de scoring dans un
  module de domaine indépendant de l'interface, de l'API et de la persistance
  (voir Principe II).
- **Stack** : choisie et justifiée dans le `plan.md` de la première fonctionnalité, puis
  réutilisée. Tout nouveau framework, langage ou base de données DOIT être justifié dans
  la section « Complexity Tracking » du plan.
- **Données** : stockage persistant partagé, avec un schéma versionné par migrations.
  Aucune donnée réelle ni aucun secret n'est commité dans le dépôt.
- **Sécurité** : les secrets passent par des variables d'environnement, et toutes les
  entrées utilisateur sont validées côté serveur.
- **Outillage de sécurité du dépôt** : trois outils DOIVENT être actifs sur le dépôt
  GitHub.
  - **Dependabot** : alertes de sécurité et PR de mise à jour des dépendances, pour
    chaque écosystème utilisé (paquets applicatifs et GitHub Actions).
  - **CodeQL** : analyse statique du code sur chaque pull request et sur la branche
    principale, pour chaque langage du projet.
  - **Gitleaks** : détection de secrets sur chaque pull request et sur la branche
    principale.
- Une alerte Dependabot ou CodeQL de sévérité haute ou critique DOIT être corrigée, ou
  sa dérogation justifiée par écrit, avant le merge ou la release suivante. Un secret
  détecté par Gitleaks DOIT être révoqué puis retiré du dépôt.

## Workflow de développement

- **Flux Spec Kit** : `/speckit-specify` → (`/speckit-clarify`) → `/speckit-plan` →
  `/speckit-tasks` → (`/speckit-analyze`) → `/speckit-implement`. Pas d'implémentation
  sans spec ni plan.
- **Constitution Check** : chaque `plan.md` DOIT vérifier sa conformité aux principes I à
  VI avant la phase de conception, puis de nouveau après.
- **Branches et PR** : une branche par fonctionnalité, et merge via pull request
  uniquement.
- **Quality gates avant merge** : tests verts (Principe II), relecture d'au moins une
  autre personne, aucune régression sur l'explicabilité du score (Principe I), et
  analyses CodeQL et Gitleaks au vert (voir Contraintes techniques).

## Governance

- Cette constitution prévaut sur toute autre pratique ou convention du projet. En cas de
  conflit, la constitution s'applique.
- **Amendements** : proposés par pull request qui modifie ce fichier via
  `/speckit-constitution`. La PR explique le changement, son impact sur les specs et plans
  existants, et l'éventuel plan de migration.
- **Versioning** (SemVer) :
  - MAJOR : suppression ou redéfinition incompatible d'un principe.
  - MINOR : ajout d'un principe ou d'une section, ou extension substantielle des règles.
  - PATCH : clarification, reformulation ou correction sans effet sur les règles.
- **Conformité** : toute relecture de PR vérifie le respect des principes. Une dérogation
  DOIT être justifiée par écrit dans le plan concerné (« Complexity Tracking »).

**Version**: 2.2.0 | **Ratified**: 2026-10-11 | **Last Amended**: 2026-10-11
