package com.priorisationepic.domain.ranking;

import com.priorisationepic.domain.ranking.RankingRefusedException.Reason;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * La salle d'un classement collaboratif (FR-015b, FR-015c) : le dernier brouillon diffusé par
 * l'animateur, la diffusion en cours ou en pause, les avis des membres, la carte en discussion, les
 * cartes dont la discussion est terminée et celles où la salle s'est mise d'accord. Elle n'est
 * jamais enregistrée en base, mais survit au rechargement d'une page. Non synchronisée : l'appelant
 * la protège par le verrou de la session.
 */
public final class RankingRoom {

  public static final int COMMENT_MAX_LENGTH = 140;

  /** Un avis par membre, fonctionnalité et critère. */
  private record Key(UUID participantId, UUID featureId, String criterionKey) {}

  private final UUID facilitatorId;
  private final Map<Key, CardOpinion> opinions = new LinkedHashMap<>();
  private RankingDraft draft;
  private boolean live = true;
  private UUID spotlightFeatureId;

  /** Le critère en cours quand la carte a été mise en discussion. */
  private String spotlightCriterionKey;

  private final Set<DiscussedCard> discussed = new LinkedHashSet<>();
  private final Set<DiscussedCard> agreed = new LinkedHashSet<>();

  private RankingRoom(UUID facilitatorId, RankingDraft draft) {
    this.facilitatorId = Objects.requireNonNull(facilitatorId, "facilitatorId");
    this.draft = Objects.requireNonNull(draft, "draft");
  }

  /** La salle que le premier brouillon de l'animateur ouvre, diffusée en direct. */
  public static RankingRoom open(UUID facilitatorId, RankingDraft draft) {
    return new RankingRoom(facilitatorId, draft);
  }

  /**
   * Diffuse un nouveau brouillon et reprend la diffusion. Les avis sur une fonctionnalité ou un
   * critère sortis du brouillon disparaissent, comme la discussion d'une carte sortie et ses
   * discussions terminées.
   */
  public void broadcast(RankingDraft next) {
    draft = Objects.requireNonNull(next, "draft");
    live = true;
    opinions.values().removeIf(opinion -> !concerns(opinion.featureId(), opinion.criterionKey()));
    discussed.removeIf(card -> !concerns(card.featureId(), card.criterionKey()));
    agreed.removeIf(card -> !concerns(card.featureId(), card.criterionKey()));
    if (spotlightFeatureId != null && !draft.contains(spotlightFeatureId)) {
      spotlightFeatureId = null;
    }
  }

  /** Met la diffusion en pause : les membres gardent le dernier brouillon diffusé. */
  public void pause() {
    live = false;
  }

  /**
   * Donne, change ou retire ({@code opinion} nul) l'avis d'un membre. {@code comment} nul garde le
   * commentaire précédent, vide l'efface ; retirer l'avis retire son commentaire. {@code value} est
   * la valeur souhaitée d'un « Je monterais » ou « Je descendrais » ; nulle, elle garde la valeur
   * précédente du même avis (un avis changé de sens la perd). Un avis ou une valeur souhaitée qui
   * change rouvre la discussion terminée de la carte ; un commentaire seul, non. Une carte où la
   * salle s'est mise d'accord ne reçoit plus d'avis. L'appelant vérifie l'échelle.
   */
  public void giveOpinion(
      UUID participantId,
      UUID featureId,
      String criterionKey,
      Opinion opinion,
      String comment,
      Integer value) {
    requireInDraft(featureId, criterionKey);
    if (agreed.contains(new DiscussedCard(featureId, criterionKey))) {
      throw new RankingRefusedException(Reason.CARD_AGREED, featureId);
    }
    Key key = new Key(participantId, featureId, criterionKey);
    if (opinion == null) {
      if (opinions.remove(key) != null) {
        discussed.remove(new DiscussedCard(featureId, criterionKey));
      }
      return;
    }
    if (comment != null && comment.codePointCount(0, comment.length()) > COMMENT_MAX_LENGTH) {
      throw new RankingRefusedException(Reason.COMMENT_TOO_LONG, featureId);
    }
    if (value != null && opinion == Opinion.AGREE) {
      throw new RankingRefusedException(Reason.VALUE_WITHOUT_MOVE, featureId);
    }
    CardOpinion previous = opinions.get(key);
    String kept;
    if (comment == null) {
      kept = previous == null ? null : previous.comment();
    } else {
      kept = comment.isEmpty() ? null : comment;
    }
    Integer wanted = value;
    if (wanted == null && previous != null && previous.opinion() == opinion) {
      wanted = previous.value();
    }
    if (previous == null
        || previous.opinion() != opinion
        || !Objects.equals(previous.value(), wanted)) {
      discussed.remove(new DiscussedCard(featureId, criterionKey));
    }
    opinions.put(
        key, new CardOpinion(featureId, criterionKey, participantId, opinion, kept, wanted));
  }

  /**
   * « Effacer les avis » : tous les avis de la fonctionnalité pour ce critère, et sa discussion
   * terminée.
   */
  public void clearOpinions(UUID featureId, String criterionKey) {
    requireInDraft(featureId, criterionKey);
    discussed.remove(new DiscussedCard(featureId, criterionKey));
    opinions
        .keySet()
        .removeIf(
            key -> key.featureId().equals(featureId) && key.criterionKey().equals(criterionKey));
  }

  /**
   * « Accord trouvé » ({@code true}) : la salle s'est mise d'accord sur la carte pour ce critère,
   * on n'y revient pas. Ses avis sont effacés et sa discussion, si elle est en cours, se termine.
   * {@code false} la rouvre.
   */
  public void settle(UUID featureId, String criterionKey, boolean agreement) {
    requireInDraft(featureId, criterionKey);
    DiscussedCard card = new DiscussedCard(featureId, criterionKey);
    if (!agreement) {
      agreed.remove(card);
      return;
    }
    clearOpinions(featureId, criterionKey);
    if (featureId.equals(spotlightFeatureId)) {
      spotlight(null);
    }
    agreed.add(card);
  }

  /**
   * Met une carte en discussion à la place de la précédente ; {@code null} termine la discussion.
   * La carte qui quitte la discussion est marquée discutée, pour le critère où elle y est entrée.
   */
  public void spotlight(UUID featureId) {
    if (featureId != null && !draft.contains(featureId)) {
      throw new RankingRefusedException(Reason.NOT_IN_RANKING, featureId);
    }
    if (spotlightFeatureId != null && !spotlightFeatureId.equals(featureId)) {
      discussed.add(new DiscussedCard(spotlightFeatureId, spotlightCriterionKey));
    }
    if (!Objects.equals(spotlightFeatureId, featureId)) {
      spotlightCriterionKey = featureId == null ? null : draft.criterionKey();
    }
    spotlightFeatureId = featureId;
  }

  public UUID facilitatorId() {
    return facilitatorId;
  }

  public RankingDraft draft() {
    return draft;
  }

  public boolean live() {
    return live;
  }

  /** Les avis, du plus ancien au plus récent ; un avis changé garde sa place. */
  public List<CardOpinion> opinions() {
    return List.copyOf(opinions.values());
  }

  /** La carte en discussion, ou {@code null}. */
  public UUID spotlightFeatureId() {
    return spotlightFeatureId;
  }

  /** Les cartes dont la discussion est terminée, de la plus ancienne à la plus récente. */
  public List<DiscussedCard> discussed() {
    return List.copyOf(discussed);
  }

  /** Les cartes où la salle s'est mise d'accord, de la plus ancienne à la plus récente. */
  public List<DiscussedCard> agreed() {
    return List.copyOf(agreed);
  }

  private boolean concerns(UUID featureId, String criterionKey) {
    return draft.contains(featureId) && draft.criterionKeys().contains(criterionKey);
  }

  private void requireInDraft(UUID featureId, String criterionKey) {
    if (!concerns(featureId, criterionKey)) {
      throw new RankingRefusedException(Reason.NOT_IN_RANKING, featureId);
    }
  }
}
