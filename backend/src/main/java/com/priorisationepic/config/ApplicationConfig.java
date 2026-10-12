package com.priorisationepic.config;

import com.priorisationepic.application.Broadcaster;
import com.priorisationepic.application.ChangeLogRepository;
import com.priorisationepic.application.ChangeLogWriter;
import com.priorisationepic.application.ClockPort;
import com.priorisationepic.application.ParticipantRepository;
import com.priorisationepic.application.SessionConnectionUseCase;
import com.priorisationepic.application.SessionLocks;
import com.priorisationepic.application.SessionRepository;
import com.priorisationepic.application.SessionStateProvider;
import com.priorisationepic.domain.IdGenerator;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.Optional;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Assemblage des cas d'usage et de leurs ports. */
@Configuration
public class ApplicationConfig {

  @Bean
  public ClockPort clockPort(Clock clock) {
    return () -> clock.instant();
  }

  @Bean
  public IdGenerator idGenerator() {
    return new IdGenerator(new SecureRandom());
  }

  @Bean
  public SessionLocks sessionLocks() {
    return new SessionLocks();
  }

  @Bean
  public ChangeLogWriter changeLogWriter(
      ChangeLogRepository repository, ClockPort clock, IdGenerator ids) {
    return new ChangeLogWriter(repository, clock, ids);
  }

  @Bean
  public SessionConnectionUseCase sessionConnectionUseCase(
      SessionRepository sessions,
      ParticipantRepository participants,
      Broadcaster broadcaster,
      SessionLocks locks,
      ClockPort clock) {
    return new SessionConnectionUseCase(sessions, participants, broadcaster, locks, clock);
  }

  /**
   * Tant que le parcours de préparation n'a pas défini le {@code sessionState}, aucun état n'est
   * envoyé après {@code hello}. Remplacé par le fournisseur du parcours de session.
   */
  @Bean
  @org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
  public SessionStateProvider noSessionStateYet() {
    return (sessionId, participantId, facilitator) -> Optional.empty();
  }
}
