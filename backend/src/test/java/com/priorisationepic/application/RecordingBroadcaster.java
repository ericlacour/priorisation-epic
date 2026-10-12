package com.priorisationepic.application;

import com.priorisationepic.domain.SessionId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Broadcaster de test : garde les connexions rattachées et note ce qu'on lui demande d'envoyer. */
public final class RecordingBroadcaster implements Broadcaster {

  public record Attached(SessionId sessionId, UUID participantId, boolean facilitator) {}

  public final Map<String, Attached> attached = new HashMap<>();
  public final List<SessionId> published = new ArrayList<>();
  public final List<String> publishedTo = new ArrayList<>();
  public final List<String> errors = new ArrayList<>();
  public boolean refuseAttach;

  @Override
  public boolean attach(
      String connectionId, SessionId sessionId, UUID participantId, boolean facilitator) {
    if (refuseAttach || attached.containsKey(connectionId)) {
      return false;
    }
    attached.put(connectionId, new Attached(sessionId, participantId, facilitator));
    return true;
  }

  @Override
  public boolean detach(String connectionId) {
    return attached.remove(connectionId) != null;
  }

  @Override
  public boolean hasConnection(SessionId sessionId, UUID participantId) {
    return attached.values().stream()
        .anyMatch(a -> a.sessionId().equals(sessionId) && a.participantId().equals(participantId));
  }

  @Override
  public void publish(SessionId sessionId) {
    published.add(sessionId);
  }

  public final List<String> facilitatorChanges = new ArrayList<>();
  public final List<String> handovers = new ArrayList<>();

  @Override
  public void setFacilitator(SessionId sessionId, UUID participantId, boolean facilitator) {
    facilitatorChanges.add(participantId + ":" + facilitator);
    attached.replaceAll(
        (id, a) ->
            a.participantId().equals(participantId)
                ? new Attached(a.sessionId(), a.participantId(), facilitator)
                : a);
  }

  @Override
  public void sendHandover(SessionId sessionId, UUID participantId, String animationToken) {
    handovers.add(participantId + ":" + animationToken);
  }

  @Override
  public void publishTo(String connectionId) {
    publishedTo.add(connectionId);
  }

  @Override
  public void sendError(String connectionId, ErrorCode code, UUID featureId) {
    errors.add(connectionId + ":" + code + (featureId == null ? "" : ":" + featureId));
  }
}
