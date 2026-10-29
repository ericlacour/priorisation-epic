# Maquettes : session de priorisation WSJF

Maquettes cliquables des 15 écrans de la feature 001. Les écrans 4 et 4 quinquies ont un sélecteur « État simulé » (préparation, en cours, tour ouvert, tour révélé, clôturée) et simulent une fenêtre de 1280 × 560. Ouvrir `index.html` dans un navigateur.
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
| Sigles WSJF | Définition au survol, au focus ou au toucher. Lien « Comprendre le WSJF » au-dessus du tableau, qui ouvre un panneau avec toutes les définitions. Le panneau de vote n'affiche que le sigle et le nom complet (FR-016a) |
| Tableau, tour en cours, révélation | Tiennent dans 1280 × 720 sans défilement de la page ; seules les listes défilent, en-têtes et actions restent visibles (FR-014a) |
| À revoir / hors échelle | « À revoir » : marque posée par l'animateur avec un motif, sans effet sur le classement, retirée à la révélation (FR-006a). « Hors échelle » : état calculé quand une valeur sort de l'échelle (FR-011) |
| Descriptif | Clic sur l'identifiant : panneau de détail avec descriptif, valeurs et calcul (FR-016b) |
| Méthode | Choisie à la création (WSJF seule en V1, par défaut), puis figée. Consultable en lecture seule par tous dans le panneau « Méthode de la session ». Pas d'édition de méthode à l'écran en V1 (FR-017c, FR-017d) |
| Saisie par classement | Écran « Prioriser par classement » ouvert depuis le tableau : choix des critères et des fonctionnalités, puis un classement par critère (glisser-déposer par la poignée ou clavier, égalités, « Non classées »). Les valeurs actuelles sont gardées ; une valeur n'est proposée qu'à une fonctionnalité déplacée, ou à tous les niveaux quand la valeur du premier niveau est saisie (valeur juste inférieure de l'échelle à chaque niveau), et reste modifiable. Enregistrement à la fin seulement, confirmé par le serveur ; un refus garde l'écran ouvert. Repris pour le vote des tours (FR-015a, retours du 2026-10-15) |
| Barres de l'écran de session | Décision du 2026-10-16 : une barre de session (marque réduite, nom, statut, « Comprendre le WSJF » ; à droite « Participants », « Tours révélés », « Exporter », « Liens », thème) et une barre d'actions (saisie, préparation, tours, cycle de vie). Ensemble, au plus 105 px de haut. Action indisponible : désactivée à sa place, avec une infobulle. Messages en superposition. Un seul tour ouvert à la fois ; clôture confirmée ; sous 1280 px, la barre d'actions peut passer sur deux lignes (FR-004, FR-014c, FR-018) |
| Téléphone | Lecture seule en V1. Saisir, voter et animer demandent un ordinateur (spec, « Hors périmètre ») |

## Classement collaboratif (2026-10-29)

`classement-collaboratif.html` : maquette cliquable de la priorisation par classement
partagée entre l'animateur et les personnes connectées. Les écrans partagent le même état
(un avis donné dans la vue participant apparaît chez l'animateur).

| Écran | Rôle | Statut | Idée principale |
|-------|------|--------|-----------------|
| A. Atelier en direct | Animateur | Retenu (FR-015b, FR-015c) | Le classement est diffusé en direct (pause possible). Chaque carte montre ses compteurs ✓ ↑ ↓ et le nombre d'avis commentés. À droite : la carte en discussion avec ses avis, puis les cartes que la salle voudrait monter ou descendre, avec les commentaires. « Mettre en discussion » et « Effacer les avis » depuis la liste des avis (dans l'application, pas de menu ⋯ par carte ; la bascule « Diffusé en direct » est à côté de la valeur du premier niveau). Cartes en grille par niveau, valeur du niveau en grand à gauche |
| B. Suivre et donner son avis | Participant | Retenu (FR-015b, FR-015c) | Suit l'écran de l'animateur (ou parcourt librement). Un avis par carte : ✓ d'accord, ↑ je monterais, ↓ je descendrais ; une bulle propose un commentaire, jamais obligatoire. « Vos avis » pour commenter ou retirer |
| C. Tour masqué : suivi | Animateur | Mis de côté | Piste pour le vote masqué, à revoir plus tard |
| D. Voter par classement | Participant | Mis de côté | Idem |
| E. Révélation et accord | Tous | Mis de côté | Idem |

Décision du 2026-10-29 : garder un échange simple. Les quatre réactions (dont « Question »),
les propositions de déplacement, la main levée, le minuteur, le sondage d'accord et le fil de
la séance, présents dans la première version de la maquette, sont abandonnés. Pas d'avis sur
téléphone en V1 (lecture seule).

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

## Barres de l'écran de session (T097a, 2026-10-16)

Mesures des écrans 4 et 4 quinquies dans Chromium, fenêtre de 1280 × 560 :

| Mesure | Valeur |
|--------|--------|
| Barre de session | 52 px, une ligne, nom de la session tronqué |
| Barre d'actions | 46 px, une ligne, dans les six états |
| Les deux barres | 98 px (budget : 105 px) |
| Fonctionnalités entièrement visibles | 16 (exigence : 15) |
| Place libre dans la barre d'actions de l'animateur | 60 px dans l'état le plus chargé (tour ouvert, animateur qui a voté : « Modifier mon vote » et « Révéler »), plus de 130 px ailleurs |

Choix de détail faits dans la maquette :

- Les lignes du tableau font 25 px, comme dans l'application. « Modifier » est un petit bouton de 21 px.
- L'avancement du tour tient dans une puce : « Tour 2 · 3/5 votes ». Le détail par membre (« a voté », « n'a pas encore voté ») est dans le menu « Participants », avec « Transmettre le rôle » (désactivé pour un membre hors ligne).
- Après la révélation, la zone des tours affiche « Tour 2 révélé » et « Résultats et consensus », jusqu'à l'ouverture du tour suivant.
- « Clôturer la session » est désactivé pendant un tour ouvert (refus `ROUND_OPEN`), avec une infobulle.
- « Échelle » est désactivé pendant un tour ouvert, « Ouvrir un tour de vote » en préparation et pendant un tour.
- Le participant voit, à la place des actions, un bandeau d'état de même hauteur, avec « Voter », « Modifier mon vote » ou « Voir les résultats ».
- Pendant un tour, chez le participant, les fonctionnalités du tour passent en fin de liste, masquées, et les rangs des autres se suivent.
- Le message superposé (case « Message superposé ») couvre le haut du tableau sans le décaler.
- Sur téléphone, les outils passent sur une deuxième ligne, et la barre d'actions devient le bandeau « Lecture seule ».
- « Transmettre le rôle » (menu « Participants ») ouvre une confirmation qui nomme le bénéficiaire. Après validation, l'ancien animateur voit « Vous avez transmis le rôle d'animateur à alice. Vous êtes maintenant participant. ». Chez le participant, le bouton « Simuler : eric me transmet le rôle » ouvre la fenêtre « Vous êtes maintenant animateur », avec le nouveau lien d'animation, « Copier » et « Compris » (FR-002a).

## Accueil (écran 1, revue du 2026-10-17)

- Sur ordinateur, la page ne défile pas : la création de session est à gauche (380 px au plus), la liste des sessions à droite. Seule la liste défile, avec l'en-tête du tableau figé (FR-026a).
- Les filtres sont au-dessus de la liste, sur deux lignes : « Nom » et « Animateur » côte à côte, puis les cases du statut. Le compteur « n sessions sur N » est à droite du titre « Sessions » (FR-026b).
- « Nom » filtre à chaque frappe et surligne le passage trouvé. « Animateur » propose les animateurs existants et refuse un pseudo inconnu par un message sous le champ.
- La colonne de boutons « Rejoindre » / « Consulter » de l'ancienne maquette n'est pas reprise : le nom de la session est le lien.
- Sous 900 px, les deux blocs s'empilent (création d'abord) et la page défile ; sur téléphone, la liste garde le tableau, qui défile en largeur.

## Écrans

| # | Écran | Exigences illustrées |
|---|-------|----------------------|
| 1 | Accueil sans défilement : créer une session (à gauche), liste des sessions filtrable par nom, animateur et statut (à droite) (refait le 2026-10-17) | FR-001, FR-017d, FR-026, FR-026a, FR-026b |
| 2 | Session créée : lien d'invitation et lien d'animation privé | FR-002 |
| 3 | Rejoindre : pseudo déjà utilisé | FR-002, FR-003, reprise du pseudo |
| 4 | Tableau, vue animateur, avec les deux barres dans chaque état (refait le 2026-10-16, T097a) | FR-004, FR-014c, FR-018, US1, FR-004, FR-005, FR-014 à FR-016, FR-018, FR-021, FR-027 |
| 4 bis | Ouvrir un tour : choix des fonctionnalités *(à refaire : choix des critères et des fonctionnalités, comme l'écran 4 sexies, revue du 2026-10-15)* | FR-018 |
| 4 ter | Descriptif d'une fonctionnalité (panneau ouvert au clic sur l'identifiant) | FR-016, FR-016b |
| 4 quater | Méthode de la session, en lecture seule | FR-017a, FR-017c |
| 4 quinquies | Tableau, vue participant, avec les deux barres dans chaque état (refait le 2026-10-16, T097a) | FR-014a, FR-014b, FR-014c, FR-015 |
| 4 sexies | Prioriser par classement : choix des critères et des fonctionnalités | FR-015a |
| 4 septies | Prioriser par classement : classement et valeurs d'un critère | FR-015a |
| 5 | Tour en cours, vue participant *(à refaire : vote par classement sur l'écran 4 septies, départ « Non classées », « Envoyer mon vote », revue du 2026-10-15)* | US2, FR-019, FR-019a, SC-004 |
| 6 | Révélation et consensus *(à ajuster : seulement les critères du tour, revue du 2026-10-15)* | FR-020 à FR-022 |
| 7 | Import avec aperçu | FR-007, FR-007a, FR-008 |
| 8 | Réglage de l'échelle | FR-009 à FR-011 |
| 9 | Exports et tours révélés | FR-022 à FR-024 |
