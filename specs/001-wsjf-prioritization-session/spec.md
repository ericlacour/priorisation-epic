# Feature Specification: Session de priorisation WSJF

**Feature Branch**: `claude/compassionate-clarke-fqqtbd`

**Created**: 2026-10-11

**Status**: Draft

**Input**: User description: "une équipe composé d'un animateur et d'utilisateurs (Product Owner, Product Management, Architecte). L'animateur peut préparer la session , il y indique les fonctionnalités à prioriser soit en les saisissant manuellement soit en important un fichier Excel. Une fonctionnalité est composée des champs suivants : identifiant, titre, description, Valeur métier (BV) , criticité temporelle (TC) , réduction risque ou opportunité (RR ou OE), taille du taille (JS)  l'animateur invite ensuite les utilisateurs à le rejoindre pour prioriser les fonctionnalités. La priorisation se fait à l'aide de la méthode WSJF (aujourd'hui une seule méthode; mais elle doit pouvoir être modifiable). Soit chaque participant remplit pour chaque fonctionnalité chaque critère du WSJF (BV,TC,RR/OE,JS) de façon masqué, puis l'animateur révèle les critères saisies par chacun et on se met d'accord pour un critère commun (on peut le faire plusieurs fois si l'équipe n'est pas d'accord). Si l'équipe  est déjà d'accord , la saisie par participant est optionnelle : on va directement saisir pour chaque fonctionnalité les critères du WSJF.  le WSJF est calculé de la sorte WSJ=COST OF DELAY/JS et COST OF DELAY=BV+TC+RR. le JS ne peut être nul, chaque composant est saisie avec une valeur de 1 à 10, l'animateur peut changer ces valeurs si besoin (de 1 à 20 , de 1 à 50...). On affiche donc les fonctionnalités avec chacune de ces valeurs et on calcule le WSJF que l'on affiche et que l'on tri par ordre décroissant du WSJF. Toute modification de BV,TC,RR/OE,JS  entraine la mise à jour de COST OF DELAY , WSJF et du tri du tableau. Les données du tableau sont exportables (format Confluence ou format csv). On peut revenir sur les données d'une session pour revisualiser les fonctionnalités de cette session."

## Clarifications

### Session 2026-10-11

- Q: Les valeurs des critères sont-elles des entiers continus ou la suite de Fibonacci ? → A: L'animateur choisit pour chaque session : entiers continus ou suite de Fibonacci.
- Q: Un tour de vote masqué porte-t-il sur une fonctionnalité, toutes, ou une sélection ? → A: L'animateur choisit les fonctionnalités incluses dans un tour (une, plusieurs ou toutes), révèle le tour entier, puis peut relancer un tour sur les seules fonctionnalités en désaccord.
- Q: Comment l'application sait-elle qui est l'animateur, sans authentification ? → A: Un lien d'animation privé, distinct du lien d'invitation, donne seul les droits d'animateur ; l'animateur peut transmettre son rôle à un participant pendant la session.
- Q: Pendant un tour masqué, les participants voient-ils les valeurs déjà retenues des fonctionnalités du tour ? → A: Non : valeurs retenues, CoD et WSJF des fonctionnalités du tour sont masqués pour les participants jusqu'à la révélation ; le reste du tableau reste visible.
- Q: Comment l'outil reconnaît-il les colonnes du fichier Excel importé ? → A: Noms de colonnes imposés (Identifiant, Titre, Description, BV, TC, RR/OE, JS), modèle vierge téléchargeable ; un fichier sans ces en-têtes est refusé.
- Q (maquettes) : comment saisir un vote quand la borne de l'échelle est grande (jusqu'à 100) ? → A: Saisie directe du nombre, avec contrôle (entier, dans l'échelle).
- Q (maquettes) : quand un critère est-il signalé « écart important » à la révélation ? → A: Quand le maximum moins le minimum est strictement supérieur à 3.
- Q (maquettes) : quand le tableau se retrie-t-il pendant la saisie de l'animateur ? → A: Quand il valide la ligne, pas à chaque frappe.
- Q (maquettes) : que contiennent les champs de consensus au départ ? → A: Ils sont vides, sauf pour un critère où tous les votants ont saisi la même valeur.
- Q (maquettes) : la saisie est-elle possible sur téléphone en V1 ? → A: Non : lecture seule sur téléphone, saisie sur ordinateur.
- Q : l'animateur peut-il saisir directement les valeurs d'une fonctionnalité qui est dans un tour ouvert ? → A: Non. C'est refusé tant que le tour n'est pas révélé ; titre et description restent modifiables.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Prioriser des fonctionnalités en saisie directe (Priority: P1)

L'animateur crée une session en indiquant son pseudo, lui donne un nom, puis saisit à la
main les fonctionnalités à prioriser (identifiant, titre, description). Avec l'équipe, il
fixe directement, pour chaque fonctionnalité, les valeurs retenues pour BV, TC, RR/OE
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
4. **Given** l'échelle par défaut 1 à 10, **When** l'animateur ou un participant saisit 0, 11 ou une valeur
   non entière, **Then** la saisie est refusée avec un message indiquant les valeurs
   autorisées.
5. **Given** une fonctionnalité du tableau, **When** l'utilisateur consulte son détail,
   **Then** il voit le calcul complet, par exemple « CoD = 8 + 5 + 3 = 16 ;
   WSJF = 16 / 4 = 4,00 ».

---

### User Story 2 - Évaluation individuelle masquée puis consensus (Priority: P2)

L'animateur invite les participants (Product Owner, Product Management, Architecte…) à
rejoindre la session. Il ouvre un tour de vote masqué sur les fonctionnalités de son
choix : une seule, plusieurs ou toutes. Chaque participant entre avec un pseudo et saisit,
pour chaque fonctionnalité du tour, ses propres valeurs BV, TC, RR/OE et JS, sans voir
celles des autres. L'animateur voit qui a déjà voté, sans voir les valeurs. Quand il le
décide, il révèle le tour entier. L'équipe discute fonctionnalité par fonctionnalité et
fixe une valeur commune par critère. Si l'équipe n'est pas d'accord sur certaines
fonctionnalités, l'animateur relance un nouveau tour masqué sur ces seules
fonctionnalités, autant de fois que nécessaire.

**Why this priority**: le vote masqué évite l'effet d'ancrage et fait apparaître les
désaccords. Il apporte une forte valeur, mais la session reste utilisable sans lui
(User Story 1).

**Independent Test**: avec un animateur et deux participants sur des postes différents,
faire voter les participants sur une fonctionnalité, vérifier qu'aucun ne voit les valeurs
des autres avant la révélation, révéler, fixer les valeurs communes et vérifier la mise à
jour du tableau.

**Acceptance Scenarios**:

0. **Given** une session en préparation, **When** l'animateur tente d'ouvrir un tour,
   **Then** l'action est refusée avec le message « Démarrez la session pour ouvrir un tour
   de vote ». **When** il démarre la session, **Then** il peut ouvrir un tour.
1. **Given** une session préparée, **When** l'animateur partage le lien d'invitation et
   qu'un participant l'ouvre puis saisit son pseudo, **Then** le participant rejoint la
   session et apparaît dans la liste des participants de l'animateur.
2. **Given** un tour de vote ouvert sur F-1, **When** un participant enregistre ses valeurs,
   **Then** les autres participants et l'animateur voient qu'il a voté, mais pas ses valeurs.
2a. **Given** F-1 a déjà des valeurs retenues (WSJF 4,00) et un tour est ouvert sur F-1
   seule, **When** un participant consulte le tableau, **Then** F-1 apparaît « vote en
   cours », sans valeurs, sans CoD et sans WSJF, alors que F-2 reste entièrement visible.
3. **Given** des votes enregistrés sur F-1, **When** l'animateur révèle le tour, **Then**
   tous les membres voient, pour chaque participant et chaque critère, la valeur saisie,
   ainsi que le minimum et le maximum de chaque critère.
4. **Given** un tour révélé, **When** l'animateur saisit les valeurs communes, **Then** elles
   deviennent les valeurs de F-1 dans le tableau, qui se recalcule et se retrie.
5. **Given** un tour révélé sans accord, **When** l'animateur lance un nouveau tour, **Then**
   les participants votent à nouveau en masqué et les votes du tour précédent restent
   consultables dans l'historique de F-1.
6. **Given** un participant qui n'a pas voté, **When** l'animateur révèle le tour, **Then**
   la révélation a lieu et ce participant apparaît comme « n'a pas voté ».
7. **Given** un tour ouvert sur F-1, F-2 et F-3, **When** l'animateur le révèle, **Then** les
   votes des trois fonctionnalités deviennent visibles en même temps. **When** l'équipe
   s'accorde sur F-1 et F-3 mais pas sur F-2, **Then** l'animateur saisit les valeurs
   communes de F-1 et F-3 et lance un nouveau tour sur F-2 seule.

---

### User Story 3 - Préparer la session par import Excel et régler l'échelle (Priority: P3)

Avant la séance, l'animateur importe un fichier Excel contenant les fonctionnalités à
prioriser au lieu de les saisir une à une. Il choisit aussi le type d'échelle (entiers
continus ou suite de Fibonacci) et sa borne supérieure (par exemple de 1 à 20 ou de 1 à
50 au lieu de 1 à 10).

**Why this priority**: l'import fait gagner du temps sur des listes longues, et l'échelle
réglable adapte l'outil aux habitudes de l'équipe. La saisie manuelle et l'échelle par
défaut couvrent déjà le besoin minimal.

**Independent Test**: importer un fichier Excel de 20 lignes dont 2 invalides, vérifier
l'aperçu, confirmer, puis vérifier les 18 fonctionnalités créées. Changer l'échelle en 1 à
20 et vérifier qu'une valeur de 15 est acceptée. Passer en suite de Fibonacci jusqu'à 20
et vérifier que 13 est accepté et que 10 est refusé.

**Acceptance Scenarios**:

1. **Given** un fichier Excel reprenant les en-têtes du modèle (Identifiant, Titre,
   Description, et facultativement BV, TC, RR/OE, JS), **When** l'animateur l'importe, **Then** un aperçu
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
6. **Given** une session en entiers continus de 1 à 10, **When** l'animateur choisit la
   suite de Fibonacci avec la borne 13, **Then** seules les valeurs 1, 2, 3, 5, 8 et 13
   sont proposées et acceptées. Les valeurs déjà saisies qui ne font pas partie de la
   suite (par exemple 4 ou 10) sont traitées comme au scénario 5.

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
3. **Given** une session exportée en JSON, **When** l'animateur crée une nouvelle session
   à partir de cet export, **Then** les fonctionnalités, valeurs, échelle, scores, tours
   et votes sont identiques.

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
3. **Given** une session clôturée, **When** son animateur l'ouvre via son lien d'animation
   et la rouvre, **Then** elle repasse au statut « en cours » et redevient modifiable.

---

### Edge Cases

- **JS nul ou absent** : 0 est hors de toute échelle et donc refusé. Tant que le JS n'est
  pas saisi, le WSJF n'est pas calculé (jamais de division par zéro).
- **Égalité de WSJF** : à WSJF égal, la fonctionnalité au CoD le plus élevé passe devant ;
  à CoD égal aussi, l'ordre alphabétique de l'identifiant départage. Cette règle est
  affichée dans l'aide du tableau.
- **Modifications simultanées** : si la même valeur est modifiée deux fois en même temps
  (par exemple par l'animateur depuis deux onglets), la seconde modification est prévenue que la valeur a changé et voit la nouvelle valeur avant de
  confirmer ou d'annuler sa propre saisie.
- **Pseudo déjà utilisé** dans la session : l'utilisateur est invité à en choisir un autre.
- **Lien d'animation perdu** : l'animateur ne peut plus reprendre la main depuis un autre
  poste. S'il est encore connecté quelque part, il peut retrouver le lien ou transmettre
  son rôle. Sinon, la session reste consultable et votable, mais ses actions d'animation
  sont bloquées. Aucune procédure de récupération n'est prévue en v1.
- **Quelqu'un ouvre le lien d'invitation avec le pseudo de l'animateur** : le pseudo est
  déjà utilisé, donc il est refusé. Même sans cela, aucun droit d'animateur ne serait
  accordé sans le lien d'animation.
- **Participant qui quitte la session** pendant un vote : ses votes déjà enregistrés sont
  conservés. Il revient à sa place, avec ses votes, en rouvrant la session **depuis le
  même navigateur**. Depuis un autre poste, il ne peut reprendre **son pseudo** qu'après
  **10 minutes d'absence** (aucune connexion ouverte), comme dans planning-poker. Il
  retrouve alors sa place et ses votes, et l'ancien navigateur perd l'accès à ce pseudo.
  Avant ces 10 minutes, le pseudo est refusé comme « déjà utilisé ». Le rôle d'animateur
  n'est pas concerné : il reste attaché au lien d'animation.
- **Fonctionnalité supprimée** pendant la préparation : elle disparaît du tableau. Une fois
  la session en cours, la suppression demande une confirmation.
- **Fichier d'import** vide, illisible, au mauvais format ou sans les en-têtes
  « Identifiant » et « Titre » : l'import est refusé avec un message qui indique la cause,
  liste les en-têtes attendus et propose le modèle à télécharger.
- **Valeur hors suite de Fibonacci** (par exemple 4 sur une échelle Fibonacci) : la saisie
  est refusée, et le message liste les valeurs autorisées.
- **Import de valeurs de critères hors échelle** : la ligne est importée sans ces valeurs,
  et l'aperçu le signale.
- **Session sans aucune fonctionnalité complète** : le tableau affiche les fonctionnalités
  « non calculé » et l'export reste possible.

## Requirements *(mandatory)*

### Functional Requirements

**Sessions et participants**

- **FR-001**: Le système DOIT permettre à toute personne, après saisie d'un pseudo, de créer
  une session nommée dont elle devient l'animateur.
- **FR-002**: À la création, le système DOIT fournir deux liens distincts :
  - un **lien d'invitation**, à partager : toute personne qui l'ouvre et saisit un pseudo
    devient participant ;
  - un **lien d'animation privé**, réservé à l'animateur : c'est le seul moyen d'obtenir
    les droits d'animateur, depuis n'importe quel poste ou navigateur.
  Le pseudo seul ne donne jamais les droits d'animateur. Le lien d'animation reste
  consultable par l'animateur dans la session.
- **FR-002a**: L'animateur DOIT pouvoir transmettre son rôle à un participant présent dans
  la session, c'est-à-dire **connecté au moment de la transmission**. Une transmission
  vers un participant hors ligne est refusée, avec le message « Ce participant n'est pas
  connecté : il ne pourrait pas recevoir son lien d'animation ». Le participant choisi devient animateur, l'ancien animateur devient simple
  participant, un nouveau lien d'animation est remis au nouvel animateur, et l'ancien lien
  cesse de donner les droits d'animateur. Il y a toujours exactement un animateur par
  session.
- **FR-003**: Le système NE DOIT PAS exiger de mot de passe ni de compte. Un pseudo est
  unique au sein d'une session.
- **FR-004**: Une session DOIT avoir l'un des statuts « en préparation », « en cours » ou
  « clôturée ». Seul l'animateur DOIT pouvoir en changer le statut. Effet de chaque
  statut :
  - **en préparation** : l'animateur saisit, importe et règle l'échelle. Les participants
    peuvent rejoindre et voir le tableau, mais **aucun tour de vote** ne peut être ouvert ;
  - **en cours** : tout est permis, y compris les tours de vote. L'import et le changement
    d'échelle restent possibles ;
  - **clôturée** : lecture seule, sauf la réouverture par l'animateur.
- **FR-005**: Le système DOIT afficher, pour tous les membres, la liste des participants
  présents dans la session.

**Fonctionnalités**

- **FR-006**: L'animateur DOIT pouvoir ajouter, modifier et supprimer des fonctionnalités.
  Une fonctionnalité comporte un identifiant (obligatoire, unique dans la session), un
  titre (obligatoire), une description (facultative) et les critères BV, TC, RR/OE et JS.
  Seul l'animateur modifie les valeurs retenues des fonctionnalités, en saisie directe
  comme après un vote. Les participants ne saisissent que leurs propres votes.
- **FR-007**: L'animateur DOIT pouvoir importer des fonctionnalités depuis un fichier Excel
  (.xlsx), un fichier CSV ou un export JSON de l'outil. Pour Excel et CSV, les en-têtes
  de colonnes sont imposés : « Identifiant », « Titre », « Description », « BV », « TC »,
  « RR/OE » et « JS ». « Identifiant » et « Titre » sont obligatoires, les autres colonnes
  sont facultatives. La casse et les espaces autour des en-têtes sont ignorés, et les
  colonnes inconnues aussi. Un fichier sans les colonnes obligatoires est refusé en entier,
  avec un message qui liste les en-têtes attendus. Il n'y a pas d'association manuelle des
  colonnes en v1.
- **FR-007a**: Le système DOIT proposer au téléchargement un modèle Excel vierge, qui
  contient exactement ces en-têtes et une ligne d'exemple.
- **FR-008**: Avant tout import, le système DOIT afficher un aperçu des lignes valides et
  des lignes rejetées avec leur motif. Il n'importe rien sans confirmation de l'animateur
  et affiche ensuite le nombre de lignes importées et rejetées.

**Échelle et calcul WSJF**

- **FR-009**: Chaque session DOIT avoir une échelle, définie par un type et une borne
  supérieure. Chaque critère (BV, TC, RR/OE, JS) DOIT être une valeur autorisée par cette
  échelle. Par défaut, l'échelle est en entiers continus de 1 à 10.
- **FR-010**: L'animateur DOIT pouvoir choisir, pour chaque session, le type d'échelle et
  sa borne supérieure :
  - **Entiers continus** : tout entier de 1 à la borne (par exemple 10, 20 ou 50).
  - **Suite de Fibonacci** : les valeurs 1, 2, 3, 5, 8, 13, 20, 40 et 100 qui ne
    dépassent pas la borne. La borne est l'une de ces valeurs, 20 par défaut.
  La plus petite valeur est 1 dans les deux cas, ce qui garantit un JS jamais nul.
- **FR-011**: Lorsqu'un changement de type ou de borne d'échelle rend des valeurs existantes hors échelle, le
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
  et le tri, sans rechargement et pour tous les membres connectés à la session. Le
  recalcul et le retri ont lieu quand l'animateur **valide la ligne** (« Enregistrer »),
  pas à chaque chiffre tapé : la ligne en cours de saisie ne change pas de place.
- **FR-016**: Pour chaque fonctionnalité, le système DOIT pouvoir afficher le détail du
  calcul avec les valeurs réelles (voir User Story 1, scénario 5), ainsi que la formule et
  l'échelle utilisées.
- **FR-017**: La méthode de priorisation DOIT être identifiée explicitement pour chaque
  session. En v1, seule la méthode WSJF existe, et sa formule et ses critères ne sont pas
  modifiables par l'utilisateur. D'autres méthodes (RICE, MoSCoW…) pourront être ajoutées
  dans une version ultérieure. La méthode choisie pour une session ne change pas quand une
  autre méthode est ajoutée à l'outil.

**Vote masqué et consensus**

- **FR-018**: L'animateur DOIT pouvoir ouvrir un tour de vote masqué en choisissant les
  fonctionnalités qu'il inclut : une, plusieurs ou toutes celles de la session. Une
  fonctionnalité ne peut appartenir qu'à un seul tour ouvert à la fois. Un tour ne peut
  être ouvert que si la session est **en cours** (FR-004). Le vote masqué est facultatif :
  les valeurs peuvent toujours être saisies directement, **sauf pour une fonctionnalité qui
  est dans un tour ouvert**. Tant que ce tour n'est pas révélé, ses valeurs retenues ne
  peuvent être ni modifiées ni supprimées, avec le message « Cette fonctionnalité est en
  cours de vote : révélez le tour avant de modifier ses valeurs ». Son titre et sa
  description restent modifiables.
- **FR-019**: Pendant un tour ouvert, chaque participant DOIT pouvoir saisir et modifier ses
  propres valeurs pour les quatre critères de chaque fonctionnalité du tour, par **saisie
  directe** d'un nombre. La saisie est contrôlée : une valeur qui n'est pas un entier, qui
  sort de l'échelle ou, en Fibonacci, qui n'appartient pas à la suite est refusée avec un
  message qui donne les valeurs autorisées (FR-027). Personne, y
  compris l'animateur, ne voit les valeurs des autres avant la révélation. Tous voient,
  pour chaque participant, combien de fonctionnalités du tour il a déjà notées.
- **FR-019a**: Pendant un tour ouvert, pour éviter l'effet d'ancrage, le système DOIT
  masquer aux participants, pour les seules fonctionnalités du tour, les valeurs retenues
  (BV, TC, RR/OE, JS), le CoD, le WSJF et les votes des tours précédents. Ces
  fonctionnalités restent listées dans le tableau, marquées « vote en cours ». Les autres
  fonctionnalités restent entièrement visibles. Tout redevient visible à la révélation.
  L'animateur, lui, continue de tout voir sauf les votes du tour en cours.
- **FR-020**: L'animateur DOIT pouvoir révéler un tour à tout moment. La révélation porte
  sur toutes les fonctionnalités du tour à la fois. Après révélation, pour chaque
  fonctionnalité du tour, les valeurs de chaque participant ainsi que le minimum et le
  maximum par critère sont visibles par tous, et le tour n'accepte plus de vote. Un
  critère est signalé **« écart important »** quand l'écart entre le maximum et le minimum
  est **strictement supérieur à 3**.
- **FR-021**: Après révélation, seul l'animateur DOIT pouvoir saisir les valeurs communes
  retenues par l'équipe. Elles deviennent les valeurs de la fonctionnalité (voir FR-006).
  Les champs de consensus sont **vides** au départ. Seul un critère pour lequel **tous
  les votants** ont saisi la même valeur est prérempli avec cette valeur. Les participants
  qui n'ont pas voté ne comptent pas.
- **FR-022**: Après révélation, l'animateur DOIT pouvoir lancer un nouveau tour sur une
  sélection des fonctionnalités du tour précédent (typiquement celles sans accord), sans
  limite de nombre de tours. Les tours précédents restent consultables, fonctionnalité par
  fonctionnalité.

**Export, historique et consultation**

- **FR-023**: Tout membre DOIT pouvoir exporter le tableau dans l'ordre affiché au format
  Confluence (tableau à coller dans une page) et au format CSV (encodage compatible avec
  les accents et un tableur français).
- **FR-024**: Tout membre DOIT pouvoir exporter les votes des tours révélés en CSV
  (constitution VI), et la session complète en JSON
  (fonctionnalités, valeurs, échelle, méthode, tours de vote). Une **nouvelle session
  créée à partir d'un export JSON** DOIT redonner les mêmes données (fonctionnalités,
  valeurs, échelle, méthode, tours de vote et votes) et donc les mêmes scores. Les votes
  sont rattachés aux pseudos, recréés comme participants hors ligne. Importer un JSON
  dans une session existante n'ajoute que les fonctionnalités. Le CSV tableau exporté
  puis réimporté dans une session vide de même échelle redonne les mêmes fonctionnalités
  et les mêmes scores.
- **FR-025**: Le système DOIT conserver, pour chaque **modification d'une valeur retenue**
  (BV, TC, RR/OE ou JS d'une fonctionnalité existante) et pour chaque **changement
  d'échelle**, le pseudo de son auteur, sa date, l'ancienne et la nouvelle valeur. Cet
  historique est consultable. Les autres opérations ne sont pas tracées dans
  l'historique, pour rester simple : création, modification du titre ou de la
  description, suppression, import, changement de statut, transmission du rôle. Les votes
  gardent leur auteur et leur date dans les tours de vote (constitution III).
- **FR-026**: Le système DOIT conserver les sessions et proposer une liste de toutes les
  sessions, visible par toute personne ayant accès à l'outil, permettant de les ouvrir.
  Une session clôturée est consultable en lecture seule, et son animateur peut la
  rouvrir.
- **FR-027**: Les messages d'erreur DOIVENT indiquer ce qui ne va pas et comment corriger
  (par exemple : « Le JS doit être un nombre entier entre 1 et 10 »).

### Key Entities *(include if feature involves data)*

- **Session** : une séance de priorisation. Elle a un nom, un animateur (pseudo), un lien
  d'invitation, un lien d'animation privé, un
  statut, une date de création, une méthode (WSJF) et une échelle (type : entiers continus
  ou Fibonacci ; borne supérieure).
  Elle contient des fonctionnalités et des participants.
- **Participant** : une personne identifiée par un pseudo dans une session, avec un rôle
  « animateur » ou « participant ». Le rôle métier (PO, PM, Architecte) peut être indiqué
  à titre informatif.
- **Fonctionnalité** : un élément à prioriser. Elle a un identifiant, un titre, une
  description et les valeurs retenues pour BV, TC, RR/OE et JS. Le CoD, le WSJF et le
  rang sont toujours calculés à partir de ces valeurs, jamais saisis.
- **Tour de vote** : une évaluation masquée portant sur une ou plusieurs fonctionnalités
  choisies par l'animateur. Il a un numéro d'ordre, un statut (ouvert, révélé), la liste
  de ses fonctionnalités et des votes.
- **Vote** : les valeurs BV, TC, RR/OE et JS saisies par un participant pour une
  fonctionnalité dans un tour.
- **Entrée d'historique** : une modification de valeur retenue ou d'échelle (FR-025). Elle
  a un auteur (pseudo), une date, l'élément modifié, l'ancienne et la nouvelle valeur.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un animateur prépare une session de 20 fonctionnalités par import en moins
  de 5 minutes.
- **SC-002**: Après une modification de valeur, le tableau recalculé et retrié est visible
  par tous les membres connectés en moins de 2 secondes.
- **SC-003**: Pour 100 % des fonctionnalités complètes, le CoD et le WSJF affichés
  correspondent au calcul manuel à partir des valeurs affichées.
- **SC-004**: Aucune valeur de vote, ni aucune valeur retenue d'une fonctionnalité en cours
  de vote (FR-019a), n'est visible d'un participant avant la révélation,
  dans 100 % des cas testés.
- **SC-005**: Avec 10 participants connectés et 50 fonctionnalités, chaque modification est
  visible par tous en moins de 2 secondes, et l'ouverture de la session prend moins de
  3 secondes. Au-delà, jusqu'à 100 fonctionnalités, la session reste utilisable sans
  garantie de performance.
- **SC-006**: 90 % des participants rejoignent une session et enregistrent leur premier
  vote sans aide (mesuré par observation en atelier, pas par un test automatique).
- **SC-007**: Un tableau exporté au format Confluence s'affiche correctement dans une page
  Confluence sans retouche, et un export CSV s'ouvre dans un tableur français sans
  problème d'accents ni de décimales.
- **SC-008**: Un export JSON réimporté redonne des données et des scores identiques dans
  100 % des cas testés.

## Assumptions

- Conformément à la constitution, les utilisateurs s'identifient par un simple pseudo, sans
  authentification. Le rôle « animateur » appartient d'abord au créateur de la session.
  Il est rattaché au lien d'animation privé, pas au pseudo, et peut être transmis.
- Le lien d'animation n'est pas une authentification : quiconque l'obtient devient
  animateur. Sa protection repose sur la discrétion de l'animateur.
- Les participants participent en même temps, chacun depuis son propre poste, et voient
  les changements des autres en direct.
- La suite de Fibonacci utilisée est la variante SAFe (1, 2, 3, 5, 8, 13, 20, 40, 100).
  Lors de la saisie, l'interface propose les valeurs autorisées par l'échelle.
- RR et OE forment un seul critère, « RR/OE » : réduction de risque ou opportunité.
- L'animateur peut lui aussi voter lors des tours masqués.
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
- Seul l'animateur modifie les valeurs retenues (saisie directe ou consensus). Les
  participants voient le tableau en direct et votent lors des tours masqués.
- Toutes les sessions sont visibles par toute personne ayant accès à l'outil : la v1 ne
  prévoit aucune confidentialité entre équipes.
- **Exposition publique acceptée pendant la V1 temporaire** : l'application est accessible
  depuis Internet (hébergement Render) et ses données sont chez un fournisseur tiers
  (base Neon). Ce choix est accepté tant que dure cette solution temporaire. **Consigne :
  ne pas saisir de données confidentielles tant que l'application est sur Neon.**
- Les sessions sont conservées sans limite de durée en v1. Leur suppression n'est pas
  prévue dans cette fonctionnalité.
- L'interface, les exports et les messages sont en français (principe V de la
  constitution).

### Hors périmètre de la version 1

Les sujets suivants ne seront **pas** gérés dans la première version de l'application.
Chacun demandera sa propre spec, et, pour certains, un amendement de la constitution :

- **Authentification** : pas de compte ni de mot de passe. L'identification se fait par
  pseudo, plus le lien d'animation (FR-002, constitution III).
- **Gestion des équipes** liées au projet ou aux fonctionnalités : pas de notion
  d'équipe, de rattachement d'une fonctionnalité à une équipe, ni de droits par équipe.
- **Connexion à Jira** : pas d'import ni de synchronisation depuis ou vers Jira. Les
  fonctionnalités se saisissent à la main ou s'importent par fichier (FR-007).
- **Connexion à Confluence** : pas de publication automatique. L'export « format
  Confluence » (FR-023), un tableau à copier-coller ou du *wiki markup*, reste dans le
  périmètre.
- **IA / LLM** : aucune suggestion de valeurs, d'estimation ni d'analyse automatique.
- **Notifications** : ni e-mail, ni message, ni alerte en dehors de l'application. La
  mise à jour en direct du tableau pendant une session (FR-015) n'est pas une
  notification et reste dans le périmètre.
- **Pondérations WSJF personnalisées** : la formule est fixe, CoD = BV + TC + RR/OE et
  WSJF = CoD / JS, sans poids par critère (FR-017).
- **Autres méthodes de scoring** (RICE, MoSCoW…) : seule la méthode WSJF existe. Le
  modèle permet d'en ajouter plus tard (FR-017).
- **Fonctionnalités avancées de SAFe** : pas de gestion des PI, des ART, des
  dépendances, de la capacité ou des objectifs de PI.
- **Saisie sur téléphone** : sur un écran de téléphone (moins de 600 px de large), la
  session est consultable en lecture seule : tableau, résultats, historique et exports.
  Saisir, voter et animer demandent un écran d'ordinateur, et un message l'indique
  (« Pour voter ou modifier, utilisez un ordinateur »).
