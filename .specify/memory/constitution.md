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
- L'accès DOIT être authentifié. Une gestion fine des rôles n'est ajoutée que lorsqu'une
  spec le demande.

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

## Workflow de développement

- **Flux Spec Kit** : `/speckit-specify` → (`/speckit-clarify`) → `/speckit-plan` →
  `/speckit-tasks` → (`/speckit-analyze`) → `/speckit-implement`. Pas d'implémentation
  sans spec ni plan.
- **Constitution Check** : chaque `plan.md` DOIT vérifier sa conformité aux principes I à
  IV avant la phase de conception, puis de nouveau après.
- **Branches et PR** : une branche par fonctionnalité, et merge via pull request
  uniquement.
- **Quality gates avant merge** : tests verts (Principe II), relecture d'au moins une
  autre personne, et aucune régression sur l'explicabilité du score (Principe I).

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

**Version**: 1.0.0 | **Ratified**: 2026-10-11 | **Last Amended**: 2026-10-11
