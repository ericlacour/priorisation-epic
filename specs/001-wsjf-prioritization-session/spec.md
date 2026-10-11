# Feature Specification: Session de priorisation WSJF

**Feature Branch**: `claude/compassionate-clarke-fqqtbd`

**Created**: 2026-10-11

**Status**: Draft

**Input**: User description: "une équipe composé d'un animateur et d'utilisateurs (Product Owner, Product Management, Architecte). L'animateur peut préparer la session , il y indique les fonctionnalités à prioriser soit en les saisissant manuellement soit en important un fichier Excel. Une fonctionnalité est composée des champs suivants : identifiant, titre, description, Valeur métier (BV) , criticité temporelle (TC) , réduction risque ou opportunité (RR ou OE), taille du taille (JS)  l'animateur invite ensuite les utilisateurs à le rejoindre pour prioriser les fonctionnalités. La priorisation se fait à l'aide de la méthode WSJF (aujourd'hui une seule méthode; mais elle doit pouvoir être modifiable). Soit chaque participant remplit pour chaque fonctionnalité chaque critère du WSJF (BV,TC,RR/OE,JS) de façon masqué, puis l'animateur révèle les critères saisies par chacun et on se met d'accord pour un critère commun (on peut le faire plusieurs fois si l'équipe n'est pas d'accord). Si l'équipe  est déjà d'accord , la saisie par participant est optionnelle : on va directement saisir pour chaque fonctionnalité les critères du WSJF.  le WSJF est calculé de la sorte WSJ=COST OF DELAY/JS et COST OF DELAY=BV+TC+RR. le JS ne peut être nul, chaque composant est saisie avec une valeur de 1 à 10, l'animateur peut changer ces valeurs si besoin (de 1 à 20 , de 1 à 50...). On affiche donc les fonctionnalités avec chacune de ces valeurs et on calcule le WSJF que l'on affiche et que l'on tri par ordre décroissant du WSJF. Toute modification de BV,TC,RR/OE,JS  entraine la mise à jour de COST OF DELAY , WSJF et du tri du tableau. Les données du tableau sont exportables (format Confluence ou format csv). On peut revenir sur les données d'une session pour revisualiser les fonctionnalités de cette session."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Prioriser des fonctionnalités en saisie directe (Priority: P1)

L'animateur crée une session en indiquant son pseudo, lui donne un nom, puis saisit à la
main les fonctionnalités à prioriser (identifiant, titre, description). Avec l'équipe, il
renseigne directement, pour chaque fonctionnalité, les valeurs retenues pour BV, TC, RR/OE
et JS. Le tableau affiche, pour chaque fonctionnalité, ces quatre valeurs, le Cost of Delay
(CoD = BV + TC + RR/OE) et le WSJF (CoD / JS), trié par WSJF décroissant. Chaque
modification d'une valeur recalcule immédiatement le CoD, le WSJF et le tri.

**Why this priority**: c'est le cœur du produit. Une équipe déjà d'accord sur ses valeurs
obtient un classement WSJF fiable et explicable sans aucune autre fonctionnalité.

**Independent Test**: créer une session, saisir 3 fonctionnalités et leurs valeurs, puis
vérifier les CoD, les WSJF et l'ordre du tableau, y compris après modification d'une valeur.

**Acceptance Scenarios**:

1. **Given** une session vide, **When** l'animateur ajoute une fonctionnalité « F-1 » avec
   BV = 8, TC = 5, RR/OE = 3, JS = 4, **Then** le tableau affiche CoD = 16 et WSJF = 4,00.
2. **Given** F-1 (WSJF 4,00) et F-2 (BV 2, TC 2, RR/OE 2, JS 3, WSJF 2,00), **When**
   l'animateur passe le JS de F-1 à 10, **Then** le WSJF de F-1 devient 1,60 et F-2 passe
   en tête du tableau.
3. **Given** une fonctionnalité dont le JS n'est pas encore renseigné, **When** le tableau
   s'affiche, **Then** son CoD et son WSJF apparaissent comme « non calculé » et elle est
   placée après toutes les fonctionnalités complètes.
4. **Given** l'échelle par défaut 1 à 10, **When** l'utilisateur saisit 0, 11 ou une valeur
   non entière, **Then** la saisie est refusée avec un message indiquant les valeurs
   autorisées.
5. **Given** une fonctionnalité du tableau, **When** l'utilisateur consulte son détail,
   **Then** il voit le calcul complet, par exemple « CoD = 8 + 5 + 3 = 16 ;
   WSJF = 16 / 4 = 4,00 ».

---

### User Story 2 - Évaluation individuelle masquée puis consensus (Priority: P2)

L'animateur invite les participants (Product Owner, Product Management, Architecte…) à
rejoindre la session. Chaque participant entre avec un pseudo et saisit, pour chaque
fonctionnalité, ses propres valeurs BV, TC, RR/OE et JS, sans voir celles des autres.
L'animateur voit qui a déjà voté, sans voir les valeurs. Quand il le décide, il révèle les
valeurs de chacun pour une fonctionnalité. L'équipe en discute et fixe une valeur commune
par critère. Si l'équipe n'est pas d'accord, l'animateur relance un nouveau tour de vote
masqué sur cette fonctionnalité, autant de fois que nécessaire.

**Why this priority**: le vote masqué évite l'effet d'ancrage et fait apparaître les
désaccords. Il apporte une forte valeur, mais la session reste utilisable sans lui
(User Story 1).

**Independent Test**: avec un animateur et deux participants sur des postes différents,
faire voter les participants sur une fonctionnalité, vérifier qu'aucun ne voit les valeurs
des autres avant la révélation, révéler, fixer les valeurs communes et vérifier la mise à
jour du tableau.

**Acceptance Scenarios**:

1. **Given** une session préparée, **When** l'animateur partage le lien d'invitation et
   qu'un participant l'ouvre puis saisit son pseudo, **Then** le participant rejoint la
   session et apparaît dans la liste des participants de l'animateur.
2. **Given** un tour de vote ouvert sur F-1, **When** un participant enregistre ses valeurs,
   **Then** les autres participants et l'animateur voient qu'il a voté, mais pas ses valeurs.
3. **Given** des votes enregistrés sur F-1, **When** l'animateur révèle le tour, **Then**
   tous les membres voient, pour chaque participant et chaque critère, la valeur saisie,
   ainsi que le minimum et le maximum de chaque critère.
4. **Given** un tour révélé, **When** les valeurs communes sont saisies, **Then** elles
   deviennent les valeurs de F-1 dans le tableau, qui se recalcule et se retrie.
5. **Given** un tour révélé sans accord, **When** l'animateur lance un nouveau tour, **Then**
   les participants votent à nouveau en masqué et les votes du tour précédent restent
   consultables dans l'historique de F-1.
6. **Given** un participant qui n'a pas voté, **When** l'animateur révèle le tour, **Then**
   la révélation a lieu et ce participant apparaît comme « n'a pas voté ».

---

### User Story 3 - Préparer la session par import Excel et régler l'échelle (Priority: P3)

Avant la séance, l'animateur importe un fichier Excel contenant les fonctionnalités à
prioriser au lieu de les saisir une à une. Il peut aussi modifier l'échelle des valeurs
(par exemple de 1 à 20 ou de 1 à 50 au lieu de 1 à 10).

**Why this priority**: l'import fait gagner du temps sur des listes longues, et l'échelle
réglable adapte l'outil aux habitudes de l'équipe. La saisie manuelle et l'échelle par
défaut couvrent déjà le besoin minimal.

**Independent Test**: importer un fichier Excel de 20 lignes dont 2 invalides, vérifier
l'aperçu, confirmer, puis vérifier les 18 fonctionnalités créées. Changer l'échelle en 1 à
20 et vérifier qu'une valeur de 15 est acceptée.

**Acceptance Scenarios**:

1. **Given** un fichier Excel avec les colonnes identifiant, titre, description (et
   optionnellement BV, TC, RR/OE, JS), **When** l'animateur l'importe, **Then** un aperçu
   liste les lignes valides et les lignes rejetées avec, pour chacune, le motif du rejet.
2. **Given** l'aperçu d'import, **When** l'animateur confirme, **Then** seules les lignes
   valides sont ajoutées et un récapitulatif indique le nombre de lignes importées et
   rejetées. **When** il annule, **Then** rien n'est importé.
3. **Given** une ligne dont l'identifiant existe déjà dans la session, **When** le fichier
   est importé, **Then** cette ligne est rejetée avec le motif « identifiant déjà utilisé ».
4. **Given** une session à l'échelle 1 à 10, **When** l'animateur choisit l'échelle 1 à 20,
   **Then** les valeurs de 1 à 20 sont acceptées pour tous les critères.
5. **Given** des valeurs déjà saisies, **When** l'animateur réduit l'échelle de 1–20 à
   1–10, **Then** il est prévenu des valeurs devenues hors échelle. S'il confirme, ces
   valeurs sont signalées « à revoir » et la fonctionnalité concernée sort du calcul
   jusqu'à correction.

---

### User Story 4 - Exporter le tableau (Priority: P4)

Un membre de la session exporte le tableau priorisé pour le partager : au format
Confluence pour le coller dans une page, ou au format CSV pour l'ouvrir dans un tableur.
Un export JSON complet sert à sauvegarder la session et à la réimporter.

**Why this priority**: l'export diffuse le résultat hors de l'outil. Il arrive en fin de
séance, une fois le classement établi.

**Independent Test**: exporter une session de 5 fonctionnalités dans chaque format, puis
vérifier que le contenu et l'ordre correspondent au tableau affiché. Réimporter l'export
JSON dans une nouvelle session et vérifier que les valeurs et scores sont identiques.

**Acceptance Scenarios**:

1. **Given** un tableau priorisé, **When** l'utilisateur exporte au format Confluence,
   **Then** il obtient un tableau qui, collé dans une page Confluence, s'affiche avec les
   colonnes rang, identifiant, titre, description, BV, TC, RR/OE, JS, CoD et WSJF, dans
   l'ordre du tableau.
2. **Given** un tableau priorisé, **When** l'utilisateur exporte en CSV, **Then** le fichier
   contient les mêmes colonnes et lignes, et s'ouvre correctement (accents, séparateurs,
   décimales) dans un tableur configuré en français.
3. **Given** une session exportée en JSON, **When** cet export est réimporté dans une
   nouvelle session, **Then** les fonctionnalités, valeurs, échelle et scores sont
   identiques.

---

### User Story 5 - Revoir une session passée (Priority: P5)

Après la séance, un membre de l'équipe retrouve une session passée et revoit ses
fonctionnalités, leurs valeurs, leur classement et l'historique des tours de vote.

**Why this priority**: la consultation a posteriori justifie les décisions prises, mais
n'est pas nécessaire au déroulement d'une séance.

**Independent Test**: clôturer une session, la rouvrir depuis la liste des sessions, et
vérifier que le tableau et l'historique sont identiques à ceux de la fin de séance.

**Acceptance Scenarios**:

1. **Given** plusieurs sessions existantes, **When** un utilisateur ouvre la liste des
   sessions, **Then** il voit pour chacune le nom, l'animateur, la date et le statut
   (en préparation, en cours, clôturée), triées de la plus récente à la plus ancienne.
2. **Given** une session clôturée, **When** un utilisateur l'ouvre, **Then** il voit le
   tableau final en lecture seule, ainsi que l'historique des votes et des modifications.
3. **Given** une session clôturée, **When** son animateur la rouvre, **Then** elle repasse
   au statut « en cours » et redevient modifiable.

---

### Edge Cases

- **JS nul ou absent** : 0 est hors de toute échelle et donc refusé. Tant que le JS n'est
  pas saisi, le WSJF n'est pas calculé (jamais de division par zéro).
- **Égalité de WSJF** : à WSJF égal, la fonctionnalité au CoD le plus élevé passe devant ;
  à CoD égal aussi, l'ordre alphabétique de l'identifiant départage. Cette règle est
  affichée dans l'aide du tableau.
- **Modifications simultanées** : si deux personnes modifient la même valeur en même temps,
  la seconde est prévenue que la valeur a changé et voit la nouvelle valeur avant de
  confirmer ou d'annuler sa propre saisie.
- **Pseudo déjà utilisé** dans la session : l'utilisateur est invité à en choisir un autre.
- **Participant qui quitte la session** pendant un vote : ses votes déjà enregistrés sont
  conservés, et il peut revenir avec le même pseudo.
- **Fonctionnalité supprimée** pendant la préparation : elle disparaît du tableau. Une fois
  la session en cours, la suppression demande une confirmation et reste tracée dans
  l'historique.
- **Fichier d'import** vide, illisible, au mauvais format ou sans colonne obligatoire :
  l'import est refusé avec un message qui indique la cause et le format attendu.
- **Import de valeurs de critères hors échelle** : la ligne est importée sans ces valeurs,
  et l'aperçu le signale.
- **Session sans aucune fonctionnalité complète** : le tableau affiche les fonctionnalités
  « non calculé » et l'export reste possible.

## Requirements *(mandatory)*

### Functional Requirements

**Sessions et participants**

- **FR-001**: Le système DOIT permettre à toute personne, après saisie d'un pseudo, de créer
  une session nommée dont elle devient l'animateur.
- **FR-002**: Le système DOIT fournir à l'animateur un lien d'invitation à la session.
  Toute personne qui ouvre ce lien et saisit un pseudo devient participant.
- **FR-003**: Le système NE DOIT PAS exiger de mot de passe ni de compte. Un pseudo est
  unique au sein d'une session.
- **FR-004**: Une session DOIT avoir l'un des statuts « en préparation », « en cours » ou
  « clôturée ». Seul l'animateur DOIT pouvoir en changer le statut.
- **FR-005**: Le système DOIT afficher, pour tous les membres, la liste des participants
  présents dans la session.

**Fonctionnalités**

- **FR-006**: L'animateur DOIT pouvoir ajouter, modifier et supprimer des fonctionnalités.
  Une fonctionnalité comporte un identifiant (obligatoire, unique dans la session), un
  titre (obligatoire), une description (facultative) et les critères BV, TC, RR/OE et JS.
- **FR-007**: L'animateur DOIT pouvoir importer des fonctionnalités depuis un fichier Excel
  (.xlsx), un fichier CSV ou un export JSON de l'outil. Les colonnes identifiant et titre
  sont obligatoires ; description, BV, TC, RR/OE et JS sont facultatives.
- **FR-008**: Avant tout import, le système DOIT afficher un aperçu des lignes valides et
  des lignes rejetées avec leur motif. Il n'importe rien sans confirmation de l'animateur
  et affiche ensuite le nombre de lignes importées et rejetées.

**Échelle et calcul WSJF**

- **FR-009**: Chaque critère (BV, TC, RR/OE, JS) DOIT être une valeur entière comprise dans
  l'échelle de la session : de 1 à 10 par défaut.
- **FR-010**: L'animateur DOIT pouvoir changer la borne supérieure de l'échelle (par
  exemple 20 ou 50). La borne inférieure reste 1, ce qui garantit un JS jamais nul.
- **FR-011**: Lorsqu'un changement d'échelle rend des valeurs existantes hors échelle, le
  système DOIT prévenir l'animateur avant d'appliquer le changement. S'il confirme, ces
  valeurs sont marquées « à revoir » et la fonctionnalité concernée est exclue du calcul
  jusqu'à correction.
- **FR-012**: Pour chaque fonctionnalité dont les quatre critères sont renseignés, le
  système DOIT calculer CoD = BV + TC + RR/OE et WSJF = CoD / JS.
- **FR-013**: Le WSJF DOIT être affiché avec deux décimales et une virgule décimale. Le
  tri utilise la valeur exacte, non arrondie.
- **FR-014**: Le tableau DOIT afficher, pour chaque fonctionnalité, son rang, son
  identifiant, son titre, BV, TC, RR/OE, JS, CoD et WSJF. Il est trié par WSJF décroissant,
  puis selon la règle d'égalité définie dans les Edge Cases. Les fonctionnalités
  incomplètes apparaissent en fin de tableau.
- **FR-015**: Toute modification de BV, TC, RR/OE ou JS DOIT mettre à jour le CoD, le WSJF
  et le tri, sans rechargement et pour tous les membres connectés à la session.
- **FR-016**: Pour chaque fonctionnalité, le système DOIT pouvoir afficher le détail du
  calcul avec les valeurs réelles (voir User Story 1, scénario 5), ainsi que la formule et
  l'échelle utilisées.
- **FR-017**: La méthode de priorisation DOIT être identifiée explicitement pour chaque
  session. En v1, seule la méthode WSJF existe, et sa formule et ses critères ne sont pas
  modifiables par l'utilisateur. D'autres méthodes (RICE, MoSCoW…) pourront être ajoutées
  dans une version ultérieure. La méthode choisie pour une session ne change pas quand une
  autre méthode est ajoutée à l'outil.

**Vote masqué et consensus**

- **FR-018**: L'animateur DOIT pouvoir ouvrir un tour de vote masqué sur une
  fonctionnalité. Le vote masqué est facultatif : les valeurs peuvent toujours être saisies
  directement.
- **FR-019**: Pendant un tour ouvert, chaque participant DOIT pouvoir saisir et modifier ses
  propres valeurs pour les quatre critères. Personne, y compris l'animateur, ne voit les
  valeurs des autres avant la révélation. Tous voient qui a voté.
- **FR-020**: L'animateur DOIT pouvoir révéler un tour à tout moment. Après révélation, les
  valeurs de chaque participant, ainsi que le minimum et le maximum par critère, sont
  visibles par tous, et le tour n'accepte plus de vote.
- **FR-021**: Après révélation, les valeurs communes retenues DOIVENT pouvoir être
  saisies. Elles deviennent les valeurs de la fonctionnalité.
  [NEEDS CLARIFICATION: qui saisit les valeurs communes après discussion ? L'animateur
  seul, ou n'importe quel membre de la session ?]
- **FR-022**: L'animateur DOIT pouvoir lancer un nouveau tour de vote sur une
  fonctionnalité déjà votée, sans limite de nombre. Les tours précédents restent
  consultables.

**Export, historique et consultation**

- **FR-023**: Tout membre DOIT pouvoir exporter le tableau dans l'ordre affiché au format
  Confluence (tableau à coller dans une page) et au format CSV (encodage compatible avec
  les accents et un tableur français).
- **FR-024**: Tout membre DOIT pouvoir exporter la session complète en JSON
  (fonctionnalités, valeurs, échelle, méthode, tours de vote). Un export suivi d'un
  réimport DOIT redonner les mêmes données et les mêmes scores.
- **FR-025**: Le système DOIT conserver, pour chaque modification de valeur, de
  fonctionnalité ou d'échelle, le pseudo de son auteur, sa date et l'ancienne et la
  nouvelle valeur. Cet historique est consultable.
- **FR-026**: Le système DOIT conserver les sessions et proposer une liste des sessions
  permettant de les rouvrir. Une session clôturée est consultable en lecture seule, et
  son animateur peut la rouvrir.
  [NEEDS CLARIFICATION: qui peut voir la liste des sessions et y accéder ? Toute personne
  ayant accès à l'outil, ou seulement les personnes ayant le lien de la session ?]
- **FR-027**: Les messages d'erreur DOIVENT indiquer ce qui ne va pas et comment corriger
  (par exemple : « Le JS doit être un nombre entier entre 1 et 10 »).

### Key Entities *(include if feature involves data)*

- **Session** : une séance de priorisation. Elle a un nom, un animateur (pseudo), un
  statut, une date de création, une méthode (WSJF) et une échelle (borne supérieure).
  Elle contient des fonctionnalités et des participants.
- **Participant** : une personne identifiée par un pseudo dans une session, avec un rôle
  « animateur » ou « participant ». Le rôle métier (PO, PM, Architecte) peut être indiqué
  à titre informatif.
- **Fonctionnalité** : un élément à prioriser. Elle a un identifiant, un titre, une
  description et les valeurs retenues pour BV, TC, RR/OE et JS. Le CoD, le WSJF et le
  rang sont toujours calculés à partir de ces valeurs, jamais saisis.
- **Tour de vote** : une évaluation masquée d'une fonctionnalité. Il a un numéro d'ordre,
  un statut (ouvert, révélé) et des votes.
- **Vote** : les valeurs BV, TC, RR/OE et JS saisies par un participant dans un tour.
- **Entrée d'historique** : une modification tracée. Elle a un auteur (pseudo), une date,
  l'élément modifié et l'ancienne et la nouvelle valeur.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un animateur prépare une session de 20 fonctionnalités par import en moins
  de 5 minutes.
- **SC-002**: Après une modification de valeur, le tableau recalculé et retrié est visible
  par tous les membres connectés en moins de 2 secondes.
- **SC-003**: Pour 100 % des fonctionnalités complètes, le CoD et le WSJF affichés
  correspondent au calcul manuel à partir des valeurs affichées.
- **SC-004**: Aucune valeur de vote n'est visible d'un autre membre avant la révélation,
  dans 100 % des cas testés.
- **SC-005**: Une session de 10 participants et 50 fonctionnalités se déroule sans
  ralentissement perceptible.
- **SC-006**: 90 % des participants rejoignent une session et enregistrent leur premier
  vote sans aide.
- **SC-007**: Un tableau exporté au format Confluence s'affiche correctement dans une page
  Confluence sans retouche, et un export CSV s'ouvre dans un tableur français sans
  problème d'accents ni de décimales.
- **SC-008**: Un export JSON réimporté redonne des données et des scores identiques dans
  100 % des cas testés.

## Assumptions

- Conformément à la constitution, les utilisateurs s'identifient par un simple pseudo, sans
  authentification. Le rôle « animateur » appartient au créateur de la session.
- Les participants participent en même temps, chacun depuis son propre poste, et voient
  les changements des autres en direct.
- Les valeurs des critères sont des nombres entiers (pas de suite de Fibonacci en v1). La
  borne inférieure de l'échelle est toujours 1.
- RR et OE forment un seul critère, « RR/OE » : réduction de risque ou opportunité.
- L'animateur peut lui aussi voter lors des tours masqués.
- La révélation se fait fonctionnalité par fonctionnalité.
- Les valeurs communes ne sont pas calculées automatiquement à partir des votes (pas de
  moyenne imposée) : elles résultent de la discussion de l'équipe.
- Le « format Confluence » désigne un tableau qui se colle directement dans une page
  Confluence. Aucune publication automatique vers Confluence n'est prévue.
- L'import Excel lit la première feuille du classeur, avec une ligne d'en-tête.
- En plus des formats demandés (import Excel, export Confluence et CSV), l'import CSV et
  JSON et l'export JSON sont inclus pour respecter le principe VI de la constitution
  (Données portables).
- « La méthode doit pouvoir être modifiable » signifie que d'autres méthodes pourront être
  ajoutées plus tard. En v1, la méthode WSJF est figée et aucune configuration de formule
  n'est proposée.
- Les sessions sont conservées sans limite de durée en v1. Leur suppression n'est pas
  prévue dans cette fonctionnalité.
- L'interface, les exports et les messages sont en français (principe V de la
  constitution).
