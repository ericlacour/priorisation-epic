# Idées d'évolution (à maturer)

Pistes pour enrichir ou compléter l'application, recueillies le 2026-10-30 après une revue de
la feature 001 (jusqu'à la PR #32). Rien ici n'est décidé : chaque idée retenue passera par sa
propre spécification (`/speckit-specify`), et certaines demanderont un amendement de la
constitution.

Les idées déjà écartées lors du classement collaboratif (minuteur, main levée, sondage
d'accord, fil de la séance) ne sont pas reprises.

## État de départ

- **Réalisé** : sessions WSJF avec lien d'animation et lien d'invitation, saisie directe,
  « Prioriser par classement », classement collaboratif (diffusion, avis ✓ ↑ ↓ avec
  commentaire, mise en discussion, « Accord trouvé »), import Excel, CSV et JSON avec
  aperçu, exports Confluence, CSV et JSON, échelle, marque « à revoir », accueil filtré.
- **Enregistré mais non affiché** : l'historique des modifications de valeurs (FR-025).
- **Maquettes seulement** : l'assistant IA (FR-014d) et « Importer depuis Jira ».
- **Non commencé** : le vote masqué (User Story 2, tâches T064 à T083b), dont la
  transmission du rôle d'animateur.
- **Keycloak** : connexion envisagée, absente du code et de la spec sur `main`, qui prévoient
  encore une identification par pseudo seul. Voir la section B, à maturer.

## A. Valoriser ce qui existe déjà (peu de développement)

### A1. « Pourquoi ce rang a bougé ? »

Dans le panneau de détail d'une fonctionnalité, un onglet « Historique » affiche les
modifications déjà enregistrées par FR-025, par exemple « TC : 5 → 13, par Marie, le 12/11
à 14:32 ».

*Cas concret* : le lendemain de l'atelier, un PO voit son épic passer de la 3ᵉ à la
9ᵉ place. Il comprend seul pourquoi, sans écrire à l'animateur.

### A2. Garder la raison d'un « Accord trouvé »

Aujourd'hui, avis et commentaires disparaissent à la fin du classement. Au clic sur
« Accord trouvé », l'animateur peut écrire une phrase de décision, par exemple « JS ramené
à 8 : le module d'auth est réutilisé ». Elle est conservée et reprise dans l'export
Confluence.

*Cas concret* : trois mois plus tard, en revue de PI, on retrouve pourquoi le JS avait été
baissé.

### A3. Préparer le PI suivant à partir d'une session

Sur une session clôturée, « Préparer la session suivante » crée « PI 29 » avec les
fonctionnalités non retenues. Les valeurs sont conservées et le TC est marqué « à revoir »
par défaut, puisque l'urgence change d'un PI à l'autre.

*Cas concret* : l'animateur ne ressaisit plus et ne réimporte plus 30 épics à chaque PI.

### A4. Graphique valeur / effort

Une vue en nuage de points : CoD en ordonnée, JS en abscisse, avec le quadrant « forte
valeur, faible effort » mis en évidence. Un clic sur un point ouvre le détail.

*Cas concret* : le RTE montre en un coup d'œil au comité de pilotage les trois « quick
wins » et les deux épics coûteux à faible valeur.

### A5. Ligne de capacité

L'animateur saisit une capacité (par exemple 60 points de JS). Le tableau trace une ligne
« au-dessus : rentre dans le PI » en cumulant les JS par ordre de WSJF.

*Cas concret* : le débat porte sur « l'épic n°12 doit-il passer au-dessus de la ligne ? »
plutôt que sur « est-il 7ᵉ ou 8ᵉ ? ».

*À trancher* : la spec range la capacité dans le SAFe avancé, hors V1.

## B. Keycloak (à maturer)

Prérequis à clarifier avant toute spec : version et hébergement de Keycloak, realm et
clients (front public, webservice), rôles et groupes, sort du pseudo et du lien d'animation
(remplacés, ou conservés pour les invités sans compte), et amendement de la constitution
(principe III, « pas d'authentification »).

### B1. « Mes sessions » et l'animateur lié au compte

Le lien d'animation secret disparaît. On peut désigner des co-animateurs, et l'accueil
affiche d'abord mes sessions, puis celles de mon équipe.

*Cas concret* : l'animateur tombe malade, et un co-animateur reprend la session sans qu'on
se fasse passer un lien par messagerie.

### B2. Sessions privées par équipe (groupes Keycloak)

Aujourd'hui, toutes les sessions sont visibles par tous, ce qui est accepté en V1. Avec les
groupes Keycloak, une session est rattachée à une équipe ou à un ART.

*Cas concret* : l'ART « Paiement » ne voit plus les arbitrages de l'ART « Logistique ».

### B3. Administration des méthodes

La spec cite l'authentification comme prérequis des « méthodes configurables par modèle ».
Un rôle Keycloak (par exemple `admin-methodes`) ouvre un écran de création de méthodes à
partir de modèles de calcul testés.

*Cas concret* : un « WSJF pondéré » où le TC compte double, sans développement.

### Questions ouvertes

- Un invité sans compte (prestataire, partenaire) peut-il encore rejoindre une session ?
- Que deviennent les sessions existantes, créées sans compte : rattachées à qui ?
- Le pseudo vient-il du profil Keycloak (nom, prénom) ou reste-t-il libre ?
- Qui peut rouvrir une session clôturée : l'animateur, ses co-animateurs, l'équipe ?

## C. Rendre l'IA vraiment utile (au-delà du chat)

### C1. Contrôle avant l'atelier

« Vérifier la session » signale par exemple :

- « EP-14 et EP-22 semblent décrire la même chose » ;
- « EP-08 n'a pas de critère d'acceptation : le JS sera difficile à estimer » ;
- « 4 épics n'ont pas de description ».

*Cas concret* : l'animateur corrige la veille au lieu de le découvrir pendant l'atelier.

### C2. Ordre de discussion suggéré

Pendant le classement collaboratif, l'IA (ou une simple règle) propose de mettre en
discussion d'abord les cartes où les avis sont les plus divisés, par exemple
3 « je monterais » contre 3 « je descendrais ».

### C3. Compte-rendu automatique

À « Terminer », l'IA résume la séance : décisions, valeurs changées et pourquoi, points
restés « à revoir ». Le texte est prêt à coller dans Confluence, au même format que
l'export existant.

### C4. Points de comparaison pour le JS

« Des épics semblables dans les sessions PI 26 à 28 avaient un JS de 5 à 8 », avec des liens
vers ces épics. Cela réduit l'ancrage sur une valeur au hasard.

## D. Expérience de séance

### D1. Mode projection et QR code

Un affichage pour le vidéoprojecteur : grandes polices, uniquement le classement en direct
et la carte en discussion, et un QR code « Rejoindre » pour suivre depuis un téléphone.
Utile pour les ateliers mixtes, en salle et à distance.

### D2. Donner son avis depuis un téléphone

Le téléphone est aujourd'hui en lecture seule. Les trois boutons ✓ ↑ ↓ y tiennent, ce qui
permet aux participants en salle sans ordinateur de réagir.

### D3. Avis préparés à l'avance

Avant l'atelier, chacun donne ses avis sur les cartes à son rythme. Le jour J, l'animateur
voit immédiatement où sont les désaccords, et l'atelier se concentre sur eux.

## E. Intégrations

### E1. Jira dans les deux sens

- Import par JQL, par exemple
  `project = PAY AND type = Epic AND fixVersion = "PI 29"` (le bouton existe déjà, désactivé).
- Un clic sur l'identifiant ouvre le ticket Jira.
- À la clôture, le WSJF et le rang sont écrits dans un champ personnalisé Jira, ce qui permet
  de trier le backlog Jira par WSJF.

### E2. Annonce dans Teams ou Slack

« La session PI 29 démarre », avec le lien d'invitation, puis le compte-rendu à la clôture.
Les notifications sont aujourd'hui hors périmètre V1.

## Priorités proposées

| Ordre | Idées | Pourquoi |
|---|---|---|
| 1 | A1 historique visible, A2 raison de l'accord | Données ou flux déjà là ; la traçabilité des arbitrages manque le plus |
| 2 | A3 PI suivant, A4 graphique valeur / effort | Gain immédiat pour l'animateur et le comité de pilotage |
| 3 | B1, B2 Keycloak (après maturation) | Débloque la confidentialité et les méthodes configurables (B3) |
| 4 | E1 import Jira par JQL, C1 et C3 IA | Fait passer l'IA d'une démonstration à un vrai service |
| — | Vote masqué (US2) | À trancher : le terminer ou le retirer, puisqu'il est marqué « bonus » |
