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
- Q : peut-on changer l'échelle pendant un tour de vote ouvert ? → A: Non. C'est refusé tant qu'un tour est ouvert.
- Q : faut-il afficher l'historique des modifications de valeurs ? → A: Non, il ne sert pas. Les modifications restent enregistrées (constitution III) mais ne sont pas affichées en V1.
- Q : comment consulter le descriptif d'une fonctionnalité sans surcharger l'écran ? → A: Clic sur l'identifiant, qui ouvre un panneau de détail (descriptif, valeurs, calcul).
- Q : l'écran du tableau de l'animateur peut-il obliger à faire défiler la page ? → A: Non. Il tient dans une fenêtre de 1280 × 720 ; seule la liste des fonctionnalités défile. Même règle pour les écrans du tour en cours et de la révélation.
- Q : comment indiquer qu'une fonctionnalité est « à revoir » ? → A: Marque posée par l'animateur, avec un motif facultatif, sans effet sur le classement, pour la reprendre lors d'un prochain tour. Les valeurs sorties de l'échelle sont signalées séparément « hors échelle » (calculé).
- Q : un participant peut-il ne pas noter un critère lors d'un tour (il ne sait pas, ou ce n'est pas son domaine, par exemple le JS) ? → A: Oui. Un critère laissé vide vaut « sans avis ». Il est ignoré dans le minimum, le maximum, l'écart important et le préremplissage du consensus.
- Q : si une nouvelle méthode de calcul arrive, avec d'autres champs que BV, TC, RR/OE, JS, CoD et WSJF, comment l'ajouter facilement ? → A: Chaque méthode est décrite par une définition unique : ses critères saisis, ses valeurs calculées, sa formule et son tri. Le tableau, la saisie, les votes, l'import, les exports et l'historique se construisent à partir de cette définition. Ajouter une méthode revient à écrire sa définition et son calcul, sans toucher au reste de l'application.
- Q : peut-on créer ou modifier une méthode et ses champs depuis un écran ? → A: Pas en V1. Chaque membre peut consulter la méthode de la session en lecture seule, et l'animateur choisit la méthode à la création parmi celles disponibles (WSJF seule en V1). Un écran de méthodes configurables par modèle est noté comme évolution future.
- Q : faut-il une case « Je ne sais pas » pour distinguer un « sans avis » volontaire d'un critère pas encore rempli ? → A: Non. Le champ vide suffit, et la fonctionnalité est évaluée même si le participant n'a pas renseigné tous les critères : son vote est complet, sans avertissement.

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
8. **Given** un tour ouvert sur F-1, **When** alice saisit BV, TC et RR/OE mais laisse JS
   vide, et que l'animateur saisit les quatre critères avec JS = 4, **Then** alice compte
   comme ayant noté F-1. À la révélation, son JS apparaît « sans avis », le minimum et le
   maximum du JS valent 4, et le JS retenu est prérempli à 4.

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
   valeurs sont signalées « hors échelle » et la fonctionnalité concernée sort du calcul
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
3. **Given** une session exportée en JSON, **When** l'animateur importe cet export dans une
   nouvelle session encore vide, **Then** les fonctionnalités, valeurs, échelle et scores
   sont identiques. Les tours et les votes ne sont pas réimportés.

---

### User Story 5 - Revoir une session passée (Priority: P5)

Après la séance, un membre de l'équipe retrouve une session passée et revoit ses
fonctionnalités, leurs valeurs, leur classement et l'historique des tours de vote.

**Why this priority**: la consultation a posteriori justifie les décisions prises, mais
n'est pas nécessaire au déroulement d'une séance.

**Independent Test**: clôturer une session, la rouvrir depuis la liste des sessions, et
vérifier que le tableau et les tours révélés sont identiques à ceux de la fin de séance.

**Acceptance Scenarios**:

1. **Given** plusieurs sessions existantes, **When** un utilisateur ouvre la liste des
   sessions, **Then** il voit pour chacune le nom, l'animateur, la date et le statut
   (en préparation, en cours, clôturée), triées de la plus récente à la plus ancienne.
2. **Given** une session clôturée, **When** un utilisateur l'ouvre, **Then** il voit le
   tableau final en lecture seule, ainsi que les tours révélés et leurs votes.
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
  une session nommée dont elle devient l'animateur. Le formulaire de création propose la
  **méthode de priorisation** (FR-017d).
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
  présents dans la session. Elle s'ouvre à la demande, par un bouton « Participants (n) »
  en haut à droite du tableau (retour d'usage du 2026-10-14).

**Fonctionnalités**

- **FR-006**: L'animateur DOIT pouvoir ajouter, modifier et supprimer des fonctionnalités.
  Une fonctionnalité comporte un identifiant (obligatoire, unique dans la session), un
  titre (obligatoire), une description (facultative) et les critères BV, TC, RR/OE et JS.
  Seul l'animateur modifie les valeurs retenues des fonctionnalités, en saisie directe
  comme après un vote. Les participants ne saisissent que leurs propres votes.
- **FR-006a**: L'animateur DOIT pouvoir **marquer une fonctionnalité « à revoir »**, avec un
  motif facultatif (200 caractères au plus, par exemple « descriptif à compléter »), et
  retirer cette marque. La marque est un **rappel** : elle ne change ni le calcul, ni le
  WSJF, ni le rang, ni le tri. Elle est visible par tous (badge « à revoir » dans le
  tableau, motif au survol et dans le panneau de détail). Elle sert à **reprendre la
  fonctionnalité lors d'un prochain tour** : à l'ouverture d'un tour, une sélection rapide
  « À revoir » coche les fonctionnalités marquées. La marque est **retirée
  automatiquement à la révélation** d'un tour qui inclut la fonctionnalité, ou à la main
  par l'animateur. On peut la poser ou la retirer même pendant un tour ouvert. Elle ne doit
  pas être confondue avec l'état « **hors échelle** » (FR-011), calculé automatiquement.
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
  valeurs sont signalées « **hors échelle** » (état calculé) et la fonctionnalité concernée est exclue du calcul
  jusqu'à correction. **Le changement d'échelle est refusé tant qu'un tour de vote est
  ouvert**, avec le message « Un tour de vote est en cours : révélez-le avant de changer
  l'échelle ». Changer le nom de la session reste possible.
- **FR-012**: Pour chaque fonctionnalité dont les quatre critères sont renseignés, le
  système DOIT calculer CoD = BV + TC + RR/OE et WSJF = CoD / JS.
- **FR-013**: Le WSJF DOIT être affiché avec deux décimales et une virgule décimale. Le
  tri utilise la valeur exacte, non arrondie.
- **FR-014**: Le tableau DOIT afficher, pour chaque fonctionnalité, son rang, son
  identifiant, son titre, BV, TC, RR/OE, JS, CoD et WSJF. Il est trié par WSJF décroissant,
  puis selon la règle d'égalité définie dans les Edge Cases. Les fonctionnalités
  incomplètes apparaissent en fin de tableau.
- **FR-014a**: Sur un écran d'ordinateur (fenêtre d'au moins 1280 × 720), l'écran du
  **tableau de l'animateur** DOIT tenir dans la fenêtre **sans défilement de la page** :
  la barre de session, les actions, le tableau et le panneau latéral restent visibles en
  permanence. Quand les fonctionnalités sont nombreuses, **seule la liste du tableau
  défile**, avec un en-tête de colonnes figé. Les titres s'affichent **en entier**, sur
  plusieurs lignes si besoin (retour d'usage du 2026-10-14). Quand l'animateur modifie une
  ligne, la ligne d'édition tient dans la largeur du tableau : aucun défilement n'est
  nécessaire pour saisir, enregistrer ou annuler. Le panneau latéral défile
  séparément si besoin. La même règle s'applique à l'écran du **tour en cours**, où le
  panneau de vote et le tableau défilent chacun de leur côté, et à l'écran de
  **révélation et consensus**, où seule la liste des fonctionnalités révélées défile et
  où la barre d'actions (« Relancer un tour sur la sélection ») reste visible.
- **FR-014b**: Quand **aucun tour n'est ouvert**, un participant (non animateur) DOIT voir
  le tableau complet, comme l'animateur : rang, identifiant, titre, critères, valeurs
  calculées, badges « à revoir » et « hors échelle », mis à jour en direct (FR-015). Il voit
  aussi la liste des participants en ligne (à la demande, FR-005), l'aide sur les sigles
  (FR-016a) et la méthode (FR-017c), qui donne la formule et la règle d'égalité. Le lien
  d'invitation n'est copiable que par l'animateur, par le bouton « Copier Session » en haut
  à droite ; son lien d'animation privé l'est par « Copier Session Anim ». Aucun des deux
  liens n'est affiché à l'écran (retour d'usage du 2026-10-14). Il peut ouvrir le
  panneau de détail en lecture seule (FR-016b), consulter les tours révélés (FR-022) et
  exporter (FR-023, FR-024). Il ne voit **aucune action d'animation** : ni « Modifier »,
  ni ajout, import, échelle, ouverture de tour, démarrage ou clôture, ni édition du titre
  et du descriptif. Un bandeau indique qu'aucun tour n'est en cours. Pendant un tour, les
  fonctionnalités du tour sont masquées (FR-019a). Après une révélation, il voit les
  résultats du tour (FR-020), sans les champs de consensus, réservés à l'animateur
  (FR-021).
- **FR-015**: Toute modification de BV, TC, RR/OE ou JS DOIT mettre à jour le CoD, le WSJF
  et le tri, sans rechargement et pour tous les membres connectés à la session. Le
  recalcul et le retri ont lieu quand l'animateur **valide la ligne** (« Enregistrer »),
  pas à chaque chiffre tapé : la ligne en cours de saisie ne change pas de place.
- **FR-015a**: Pour saisir les valeurs **par classement** plutôt que ligne à ligne, l'animateur
  DOIT pouvoir ouvrir, depuis le tableau (bouton « Prioriser par classement », sur
  ordinateur), un écran en plusieurs étapes (retour d'usage du 2026-10-15) :
  1. il choisit les fonctionnalités concernées (une, plusieurs ou toutes ; celles d'un tour
     ouvert sont exclues) et les critères à saisir (au moins un, par défaut tous, dans
     l'ordre de la définition de la méthode, FR-017b) ;
  2. pour chaque critère choisi, il **classe** les fonctionnalités de la plus forte à la
     plus faible valeur, par glisser-déposer ou au clavier (« Monter », « Descendre »).
     Plusieurs fonctionnalités peuvent être mises **au même niveau** (« Égalité avec
     au-dessus »). Au départ, celles qui ont déjà une valeur sont groupées par valeur
     décroissante, puis viennent les autres, dans l'ordre du tableau ;
  3. il saisit la **valeur du premier niveau** (par défaut le maximum de l'échelle). Chaque
     niveau suivant se voit **proposer la valeur juste inférieure** de l'échelle ; sous la
     plus petite valeur, plus rien n'est proposé et la fonctionnalité reste sans valeur.
     Les propositions suivent le classement tant que l'animateur ne les modifie pas. Il
     peut modifier ou vider la valeur de chaque fonctionnalité, contrôlée comme une saisie
     directe (FR-009), et revenir aux propositions ;
  4. il passe au critère suivant, ou revient au précédent sans perdre son classement.

  Rien n'est envoyé avant « Terminer » : chaque fonctionnalité modifiée est alors
  enregistrée en une seule modification, avec la version lue à l'ouverture de l'écran
  (jamais d'écrasement silencieux), et le tableau réapparaît, trié comme d'habitude
  (FR-014, FR-015). « Annuler » revient au tableau sans rien changer. Ce classement est
  conçu pour être repris par chaque participant lors de son vote dans un tour (FR-019).
- **FR-016**: Pour chaque fonctionnalité, le système DOIT pouvoir afficher le détail du
  calcul avec les valeurs réelles (voir User Story 1, scénario 5), ainsi que la formule et
  l'échelle utilisées.
- **FR-016b**: Pour lire le descriptif d'une fonctionnalité sans surcharger les écrans, un
  clic sur son **identifiant** (dans le tableau, le panneau de vote, la révélation ou le
  choix des fonctionnalités d'un tour) DOIT ouvrir un **panneau de détail** par-dessus
  l'écran. Ce panneau affiche l'identifiant, le rang, le titre, le **descriptif complet**,
  les valeurs retenues et le détail du calcul (FR-016). Il se ferme par une croix, la touche
  Échap ou un clic à côté, sans perdre la saisie en cours. Sur téléphone, il occupe tout
  l'écran. Pendant un tour ouvert, un participant y lit le descriptif, mais les valeurs et
  le calcul d'une fonctionnalité du tour restent masqués (FR-019a). L'animateur peut y
  modifier le titre et le descriptif. Il passe alors en **mode édition**, avec deux
  boutons, **« Enregistrer »** et « Annuler ». Rien n'est envoyé avant « Enregistrer ».
  À l'enregistrement, la modification est visible **immédiatement par tous les membres
  connectés**, comme toute autre modification (FR-015), et un message confirme
  l'enregistrement. « Annuler » abandonne la saisie. Si la fonctionnalité a été modifiée
  entre-temps, la version actuelle est affichée avant d'écraser quoi que ce soit (cas
  limite « Modifications simultanées »).
- **FR-016a**: Partout où apparaissent les sigles des critères et des valeurs calculées
  (en WSJF : BV, TC, RR/OE, JS, CoD et WSJF)
  (tableau, panneau de vote, révélation, consensus), chaque participant DOIT pouvoir
  retrouver leur signification sans quitter l'écran : au survol, au focus clavier ou au
  toucher. Un lien « Comprendre le WSJF », placé juste au-dessus du tableau, ouvre un
  panneau qui regroupe toutes les définitions : le tableau garde ainsi toute la largeur de
  l'écran. Dans le panneau de vote, chaque critère affiche son sigle et son nom complet
  (par exemple « BV · Business Value »), sans répéter la définition. Les définitions
  sont :
  - **BV · Business Value** : valeur apportée aux utilisateurs ou au business ;
  - **TC · Time Criticality** : importance de réaliser rapidement la fonctionnalité ;
  - **RR/OE · Risk Reduction / Opportunity Enablement** : capacité à réduire un risque ou
    à permettre une opportunité ;
  - **JS · Job Size** : taille relative du travail nécessaire ;
  - **CoD · Cost of Delay** : coût du retard, BV + TC + RR/OE ;
  - **WSJF** : CoD / JS ; plus il est élevé, plus la fonctionnalité est prioritaire.

  Ces sigles, noms et définitions viennent de la définition de la méthode (FR-017a) : une
  autre méthode affiche les siens, et le lien et le panneau d'aide prennent son nom (« Comprendre le RICE »).
- **FR-017**: La méthode de priorisation DOIT être identifiée explicitement pour chaque
  session, avec sa version. En v1, seule la méthode WSJF (version 1) existe, et sa formule
  et ses critères ne sont pas modifiables par l'utilisateur. D'autres méthodes (RICE,
  MoSCoW…) pourront être ajoutées dans une version ultérieure, avec des critères et des
  valeurs calculées différents de ceux du WSJF. La méthode d'une session et sa version ne
  changent pas quand une autre méthode, ou une nouvelle version de la même méthode, est
  ajoutée à l'outil : une session existante garde ses champs et ses scores.
- **FR-017a**: Chaque méthode DOIT être décrite par une **définition de méthode** unique,
  qui est la seule source de vérité sur ses champs. Elle contient :
  - son identifiant, sa version et son nom (« WSJF ») ;
  - ses **critères saisis**, dans l'ordre d'affichage : pour chacun, une clé technique, un
    sigle, un nom complet, une définition et l'en-tête de colonne utilisé à l'import et à
    l'export ;
  - ses **valeurs calculées**, dans l'ordre d'affichage : pour chacune, une clé, un sigle,
    un nom complet, une définition et un format d'affichage (entier, ou deux décimales) ;
  - sa **formule**, sa **règle de tri et d'égalité**, et la condition pour qu'une
    fonctionnalité soit calculable (en WSJF : les quatre critères renseignés et dans
    l'échelle).

  Pour le WSJF, les critères saisis sont BV, TC, RR/OE et JS, et les valeurs calculées
  sont CoD (entier) et WSJF (deux décimales).
- **FR-017b**: Tout ce qui dépend des champs de la méthode DOIT être construit à partir de
  la définition de la méthode de la session, sans liste de critères écrite ailleurs :
  - les colonnes du tableau, le panneau de détail et le détail du calcul (FR-014, FR-016) ;
  - les champs de saisie directe et de vote, et leurs aides (FR-016a, FR-019) ;
  - les règles des tours, appliquées à chaque critère : « sans avis », minimum et
    maximum, écart important, préremplissage du consensus (FR-020, FR-021) ;
  - le contrôle par l'échelle (FR-009 à FR-011) ;
  - les en-têtes de l'import, le modèle vierge et les colonnes des exports (FR-007,
    FR-023, FR-024) ;
  - l'historique des modifications (FR-025).

  Ajouter une méthode DOIT se limiter à écrire sa définition et son calcul, avec leurs
  tests (SC-009). Un fichier JSON exporté avec une autre méthode que celle de la session
  est refusé à l'import, avec un message qui nomme les deux méthodes.
- **FR-017c**: Tout membre de la session, y compris sur téléphone, DOIT pouvoir consulter
  en **lecture seule** la méthode de la session dans un panneau « Méthode de la
  session » : nom et version, formule, critères saisis (sigle, nom complet, définition,
  colonne d'import et d'export), valeurs calculées (sigle, nom complet, définition,
  affichage), règle de tri et d'égalité, et échelle de la session. Le panneau s'ouvre
  depuis le panneau d'aide (« Voir la méthode complète »), depuis le détail du calcul d'une
  fonctionnalité et depuis le formulaire de création. Il rappelle que la méthode est
  fixée à la création et ne peut pas être modifiée. Son contenu vient uniquement de la
  définition de la méthode (FR-017a).
- **FR-017d**: À la création d'une session, l'animateur DOIT choisir la méthode dans la
  liste des méthodes disponibles, chacune dans sa dernière version, avec sa formule en une
  ligne et un lien vers son détail (FR-017c). La méthode WSJF est choisie par défaut. En
  V1, c'est la seule de la liste : le choix est affiché mais ne propose qu'elle. La
  méthode et sa version sont ensuite **figées** pour la session (FR-017). La liste des
  sessions (FR-026) affiche la méthode de chaque session.

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
  message qui donne les valeurs autorisées (FR-027). Chaque critère est **facultatif** :
  un participant peut laisser vide un critère sur lequel il n'a pas d'avis (par exemple le
  JS, s'il n'est pas de son domaine). Un critère vide vaut « sans avis ». Une
  fonctionnalité compte comme **notée** dès qu'au moins un de ses critères a une valeur ;
  le vote est alors complet, sans avertissement, même si d'autres critères restent vides.
  Personne, y compris l'animateur, ne voit les valeurs des autres avant la révélation.
  Tous voient, pour chaque participant, combien de fonctionnalités du tour il a déjà
  notées.
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
  critère laissé vide est affiché « sans avis » et n'entre ni dans le minimum ni dans le
  maximum. Si personne n'a donné de valeur pour un critère, son minimum et son maximum
  restent vides. Un participant qui n'a donné aucune valeur pour une fonctionnalité est
  affiché « n'a pas voté ». Un critère est signalé **« écart important »** quand l'écart
  entre le maximum et le minimum est **strictement supérieur à 3**.
- **FR-021**: Après révélation, seul l'animateur DOIT pouvoir saisir les valeurs communes
  retenues par l'équipe. Elles deviennent les valeurs de la fonctionnalité (voir FR-006).
  Les champs de consensus sont **vides** au départ. Seul un critère pour lequel **tous
  ceux qui ont donné une valeur** ont saisi la même est prérempli avec cette valeur. Les
  participants qui n'ont pas voté, et les « sans avis » sur ce critère, ne comptent pas.
  Un critère sans aucune valeur n'est pas prérempli.
- **FR-022**: Après révélation, l'animateur DOIT pouvoir lancer un nouveau tour sur une
  sélection des fonctionnalités du tour précédent (typiquement celles sans accord), sans
  limite de nombre de tours. Les tours précédents restent consultables, fonctionnalité par
  fonctionnalité.

**Export et consultation**

- **FR-023**: Tout membre DOIT pouvoir exporter le tableau dans l'ordre affiché au format
  Confluence (tableau à coller dans une page) et au format CSV (encodage compatible avec
  les accents et un tableur français).
- **FR-024**: Tout membre DOIT pouvoir exporter les votes des tours révélés en CSV
  (constitution VI), et la session complète en JSON
  (fonctionnalités, valeurs, échelle, méthode, tours de vote). Un export JSON importé
  dans une session vide DOIT redonner les mêmes **données de priorisation**
  (fonctionnalités, valeurs, échelle, méthode) et donc les mêmes scores (constitution VI).
  Les tours et les votes restent lisibles dans l'export, mais ne sont pas réimportés. Le
  CSV tableau exporté puis réimporté dans une session vide de même échelle redonne les
  mêmes fonctionnalités et les mêmes scores.
- **FR-025**: Le système DOIT enregistrer, pour chaque **modification d'une valeur
  retenue** (BV, TC, RR/OE ou JS d'une fonctionnalité existante) et pour chaque
  **changement d'échelle**, le pseudo de son auteur, sa date, l'ancienne et la nouvelle
  valeur (constitution III). Cet enregistrement **n'est pas affiché** dans l'application
  en V1 : il n'y a pas d'écran d'historique des modifications. Les autres opérations ne
  sont pas enregistrées, pour rester simple : création, modification du titre ou de la
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
  statut, une date de création, une méthode et sa version (WSJF version 1 en v1) et une
  échelle (type : entiers continus ou Fibonacci ; borne supérieure).
  Elle contient des fonctionnalités et des participants.
- **Participant** : une personne identifiée par un pseudo dans une session, avec un rôle
  « animateur » ou « participant ». Le rôle métier (Product Owner, Product Management,
  Architecte, Expert métier, Lead PM, Tech Lead) peut être indiqué à titre informatif.
- **Méthode de priorisation** : la définition d'une méthode (FR-017a) : critères saisis,
  valeurs calculées, formule et règle de tri. Elle fait partie de l'application et n'est
  pas modifiable par l'utilisateur. En v1, seule la méthode WSJF existe.
- **Fonctionnalité** : un élément à prioriser. Elle a un identifiant, un titre, une
  description et une valeur retenue pour chaque critère de la méthode de la session (en
  WSJF : BV, TC, RR/OE et JS). Les valeurs calculées (en WSJF : CoD et WSJF) et le rang
  sont toujours calculés à partir de ces valeurs, jamais saisis.
- **Tour de vote** : une évaluation masquée portant sur une ou plusieurs fonctionnalités
  choisies par l'animateur. Il a un numéro d'ordre, un statut (ouvert, révélé), la liste
  de ses fonctionnalités et des votes.
- **Vote** : les valeurs saisies par un participant pour les critères de la méthode (en
  WSJF : BV, TC, RR/OE et JS), pour une fonctionnalité dans un tour. Chaque valeur est facultative (« sans avis »).
- **Entrée d'historique** : une modification de valeur retenue ou d'échelle (FR-025),
  enregistrée mais non affichée en V1. Elle a un auteur (pseudo), une date, l'élément
  modifié, l'ancienne et la nouvelle valeur.

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
- **SC-008**: Un export JSON réimporté dans une session vide redonne des données de
  priorisation (fonctionnalités, valeurs, échelle) et des scores identiques dans
  100 % des cas testés.
- **SC-009**: Une méthode fictive, définie uniquement dans les tests avec d'autres critères
  et d'autres valeurs calculées que le WSJF, fonctionne de bout en bout (saisie, vote,
  révélation, consensus, tri, import, exports) sans modifier le code en dehors de sa
  définition et de son calcul. Ce test automatique prouve qu'une nouvelle méthode
  s'ajoute facilement.

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
- « La méthode doit pouvoir être modifiable » signifie que d'autres méthodes, avec leurs
  propres champs, pourront être ajoutées plus tard par l'équipe de développement, en
  écrivant leur définition et leur calcul (FR-017a, FR-017b, SC-009). En v1, la méthode
  WSJF est figée, et l'utilisateur ne peut ni configurer une formule ni créer une méthode.
- En v1, l'échelle est commune à tous les critères de la session. Une méthode future qui
  aurait besoin d'une échelle propre à un critère l'ajoutera à sa définition.
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
- **Autres méthodes de scoring** (RICE, MoSCoW…) : seule la méthode WSJF existe. La
  conception permet d'en ajouter plus tard, avec d'autres champs, sans reprendre le reste
  de l'application (FR-017a, FR-017b, SC-009). Elles apparaîtront alors d'elles-mêmes
  dans le choix de la méthode à la création (FR-017d).
- **Création ou modification de méthodes depuis un écran** : en V1, une méthode est
  ajoutée par l'équipe de développement (définition et calcul testés). Évolution future
  envisagée : des **méthodes configurables par modèle**. Un administrateur remplirait un
  formulaire à partir d'un modèle de calcul déjà codé et testé (par exemple « somme de
  critères ÷ un critère », comme le WSJF, avec des poids possibles) : nom, critères
  (sigle, nom, définition), poids, valeurs calculées. Pas de formule libre, pour que
  chaque calcul reste testé (constitution I et II). Chaque modification créerait une
  nouvelle version, sans changer les sessions existantes (FR-017). Prérequis :
  l'authentification et un rôle d'administrateur, sans lesquels n'importe qui pourrait
  modifier une méthode utilisée par toutes les équipes.
- **Fonctionnalités avancées de SAFe** : pas de gestion des PI, des ART, des
  dépendances, de la capacité ou des objectifs de PI.
- **Saisie sur téléphone** : sur un écran de téléphone (moins de 600 px de large), la
  session est consultable en lecture seule : tableau, résultats, tours révélés et exports.
  Saisir, voter et animer demandent un écran d'ordinateur, et un message l'indique
  (« Pour voter ou modifier, utilisez un ordinateur »).
