package com.priorisationepic.domain.ranking;

import com.priorisationepic.domain.ranking.RankingRefusedException.Reason;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * La salle d'un classement collaboratif (FR-015b, FR-015c) : le dernier brouillon diffusé par
 * l'animateur, la diffusion en cours ou en pause, les avis des membres et la carte en discussion.
 * Elle n'est jamais enregistrée. Non synchronisée : l'appelant la protège par le verrou de la
 * session.
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
   * critère sortis du brouillon disparaissent, comme la discussion d'une carte sortie.
   */
  public void broadcast(RankingDraft next) {
    draft = Objects.requireNonNull(next, "draft");
    live = true;
    opinions.values().removeIf(opinion -> !concerns(opinion.featureId(), opinion.criterionKey()));
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
   * précédente du même avis (un avis changé de sens la perd). L'appelant vérifie l'échelle.
   */
  public void giveOpinion(
      UUID participantId,
      UUID featureId,
      String criterionKey,
      Opinion opinion,
      String comment,
      Integer value) {
    requireInDraft(featureId, criterionKey);
    Key key = new Key(participantId, featureId, criterionKey);
    if (opinion == null) {
      opinions.remove(key);
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
    opinions.put(
        key, new CardOpinion(featureId, criterionKey, participantId, opinion, kept, wanted));
  }

  /** « Effacer les avis » : tous les avis de la fonctionnalité pour ce critère. */
  public void clearOpinions(UUID featureId, String criterionKey) {
    requireInDraft(featureId, criterionKey);
    opinions
        .keySet()
        .removeIf(
            key -> key.featureId().equals(featureId) && key.criterionKey().equals(criterionKey));
  }

  /**
   * Met une carte en discussion à la place de la précédente ; {@code null} termine la discussion.
   */
  public void spotlight(UUID featureId) {
    if (featureId != null && !draft.contains(featureId)) {
      throw new RankingRefusedException(Reason.NOT_IN_RANKING, featureId);
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

  private boolean concerns(UUID featureId, String criterionKey) {
    return draft.contains(featureId) && draft.criterionKeys().contains(criterionKey);
  }

  private void requireInDraft(UUID featureId, String criterionKey) {
    if (!concerns(featureId, criterionKey)) {
      throw new RankingRefusedException(Reason.NOT_IN_RANKING, featureId);
    }
  }
}
