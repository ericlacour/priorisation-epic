# Maquettes : session de priorisation WSJF

Maquettes cliquables des 9 écrans de la feature 001. Ouvrir `index.html` dans un navigateur.
La barre du haut permet de basculer entre ordinateur et téléphone, et entre thème clair et
thème sombre. Chaque écran rappelle les exigences de la spec qu'il illustre.

Les données sont fictives. Ce sont des maquettes : elles ne sont pas le code de
l'application.

## Décisions issues des maquettes

| Sujet | Décision |
|-------|----------|
| Saisie d'un vote | Saisie directe du nombre, contrôlée : entier, dans l'échelle, dans la suite en Fibonacci (FR-019) |
| Écart important | Signalé quand le maximum moins le minimum est strictement supérieur à 3 (FR-020) |
| Retri du tableau | Quand l'animateur valide la ligne, pas à chaque frappe (FR-015) |
| Consensus | Champs vides, sauf pour un critère où tous les votants ont saisi la même valeur (FR-021) |
| Téléphone | Lecture seule en V1. Saisir, voter et animer demandent un ordinateur (spec, « Hors périmètre ») |

## Charte

Les couleurs suivent la demande : un rouge vif en couleur principale, et un gris anthracite
au lieu du noir, plus lisible. La structure (jetons, rayons, espacements, typographie
système) reprend celle de planning-poker.

| Jeton | Clair | Sombre | Usage |
|-------|-------|--------|-------|
| `primary` | `#E2001A` | `#FF6B76` | Boutons principaux, rang 1, onglet actif |
| `primary-ink` | `#C8001A` | `#FF808A` | Texte rouge (WSJF, liens) |
| `fg` | `#2F3338` | `#ECEDEF` | Texte principal (anthracite, pas de noir) |
| `muted` | `#6B7079` | `#A3A8B0` | Texte secondaire |
| `bg` / `surface` | `#F7F5F3` / `#FFFFFF` | `#16181C` / `#1F2227` | Fonds |
| `success` / `warning` / `danger` | `#16754F` / `#8A560C` / `#A11423` | `#42C58E` / `#E3A94B` / `#FF8A80` | États |

Les contrastes vérifiés sont tous au moins AA :

| Combinaison | Contraste |
|-------------|-----------|
| Blanc sur `#E2001A` | 4,9:1 |
| `#2F3338` sur blanc | 12,7:1 |
| `#6B7079` sur blanc | 5,0:1 |
| `#FF6B76` sur `#16181C` | 6,1:1 |

## Écrans

| # | Écran | Exigences illustrées |
|---|-------|----------------------|
| 1 | Accueil : sessions, créer, créer depuis un export JSON | FR-001, FR-024, FR-026 |
| 2 | Session créée : lien d'invitation et lien d'animation privé | FR-002 |
| 3 | Rejoindre : pseudo déjà utilisé | FR-002, FR-003, reprise du pseudo |
| 4 | Tableau, vue animateur, session en préparation | US1, FR-004, FR-005, FR-014 à FR-016, FR-018, FR-021, FR-027 |
| 5 | Tour en cours, vue participant | US2, FR-019, FR-019a, SC-004 |
| 6 | Révélation et consensus | FR-020 à FR-022 |
| 7 | Import avec aperçu | FR-007, FR-007a, FR-008 |
| 8 | Réglage de l'échelle | FR-009 à FR-011 |
| 9 | Exports et historique | FR-023 à FR-025 |
