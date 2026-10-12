# priorisation epic

Application web pour prioriser les fonctionnalités d'une équipe avec la méthode WSJF.
La spécification se trouve dans [`specs/001-wsjf-prioritization-session/`](specs/001-wsjf-prioritization-session/).

## Sécurité du dépôt

Le dépôt applique l'outillage de sécurité exigé par la constitution
([`.specify/memory/constitution.md`](.specify/memory/constitution.md)) :

| Outil | Fichiers | Quand |
|-------|----------|-------|
| **Dependabot** | [`.github/dependabot.yml`](.github/dependabot.yml) | Une fois par mois, 7 jours après la sortie d'une version, pour `frontend/`, `contract/` (npm), `backend/` (Maven et Docker) et les GitHub Actions |
| **CodeQL** | [`.github/workflows/codeql.yml`](.github/workflows/codeql.yml) | Sur chaque PR, sur `main` et chaque lundi, pour Java, JavaScript/TypeScript et les workflows GitHub Actions |
| **Gitleaks** | [`.github/workflows/gitleaks.yml`](.github/workflows/gitleaks.yml), [`.gitleaks.toml`](.gitleaks.toml), [`.gitleaksignore`](.gitleaksignore) | Sur chaque PR et sur `main` |

Tant que `backend/`, `frontend/` et `contract/` n'existent pas, CodeQL n'analyse que les
workflows, et Dependabot ne suit que les GitHub Actions.

### Réglages GitHub à activer à la main

Dans *Settings* du dépôt :

1. **Code security → Dependabot** : activer *Dependabot alerts* et *Dependabot security
   updates*.
2. **Code security → Code scanning** : laisser *CodeQL analysis* en configuration
   avancée (le workflow `codeql.yml`). Si la configuration par défaut est activée, la
   désactiver, sinon les deux entrent en conflit.
3. **Branches → règle de protection de `main`** :
   - exiger une pull request avec au moins une relecture ;
   - exiger que les contrôles passent avant le merge : `Analyze (actions)`,
     `Analyze (java-kotlin)`, `Analyze (javascript-typescript)` et `Gitleaks`, puis les
     jobs de CI (`ci.yml`) quand ils existeront ;
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
