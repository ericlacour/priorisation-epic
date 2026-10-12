package com.priorisationepic.config;

import com.priorisationepic.application.Broadcaster;
import com.priorisationepic.application.ChangeLogRepository;
import com.priorisationepic.application.ChangeLogWriter;
import com.priorisationepic.application.ChangeStatusUseCase;
import com.priorisationepic.application.ClockPort;
import com.priorisationepic.application.CreateSessionUseCase;
import com.priorisationepic.application.FeatureRepository;
import com.priorisationepic.application.FeatureUseCase;
import com.priorisationepic.application.JoinSessionUseCase;
import com.priorisationepic.application.ParticipantRepository;
import com.priorisationepic.application.RoundRepository;
import com.priorisationepic.application.RoundUseCase;
import com.priorisationepic.application.SessionConnectionUseCase;
import com.priorisationepic.application.SessionLocks;
import com.priorisationepic.application.SessionRepository;
import com.priorisationepic.application.SessionStateAssembler;
import com.priorisationepic.application.Transactions;
import com.priorisationepic.application.TransferFacilitatorUseCase;
import com.priorisationepic.application.VoteUseCase;
import com.priorisationepic.domain.IdGenerator;
import com.priorisationepic.domain.method.MethodRegistry;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
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
      Transactions transactions,
      ClockPort clock) {
    return new SessionConnectionUseCase(
        sessions, participants, broadcaster, locks, transactions, clock);
  }

  @Bean
  public MethodRegistry methodRegistry() {
    return MethodRegistry.standard();
  }

  @Bean
  public CreateSessionUseCase createSessionUseCase(
      MethodRegistry methods,
      SessionRepository sessions,
      ParticipantRepository participants,
      Transactions transactions,
      ClockPort clock,
      IdGenerator ids) {
    return new CreateSessionUseCase(methods, sessions, participants, transactions, clock, ids);
  }

  @Bean
  public JoinSessionUseCase joinSessionUseCase(
      SessionRepository sessions,
      ParticipantRepository participants,
      Broadcaster broadcaster,
      SessionLocks locks,
      Transactions transactions,
      ClockPort clock,
      IdGenerator ids,
      @Value("${priorisation-epic.absence-timeout:10m}") Duration absenceTimeout) {
    return new JoinSessionUseCase(
        sessions, participants, broadcaster, locks, transactions, clock, ids, absenceTimeout);
  }

  @Bean
  public FeatureUseCase featureUseCase(
      SessionRepository sessions,
      ParticipantRepository participants,
      FeatureRepository features,
      RoundRepository rounds,
      ChangeLogWriter changeLog,
      Broadcaster broadcaster,
      SessionLocks locks,
      Transactions transactions,
      ClockPort clock,
      IdGenerator ids,
      MethodRegistry methods) {
    return new FeatureUseCase(
        sessions,
        participants,
        features,
        rounds,
        changeLog,
        broadcaster,
        locks,
        transactions,
        clock,
        ids,
        methods);
  }

  /**
   * Le {@code sessionState} de chaque destinataire. La présence est lue sur le diffuseur, qui a lui
   * même besoin de ce fournisseur : le diffuseur n'est donc demandé qu'à l'usage.
   */
  @Bean
  public SessionStateAssembler sessionStateAssembler(
      SessionRepository sessions,
      ParticipantRepository participants,
      FeatureRepository features,
      RoundRepository rounds,
      MethodRegistry methods,
      ObjectProvider<Broadcaster> broadcaster) {
    return new SessionStateAssembler(
        sessions,
        participants,
        features,
        rounds,
        methods,
        (sessionId, participantId) ->
            broadcaster.getObject().hasConnection(sessionId, participantId));
  }

  @Bean
  public RoundUseCase roundUseCase(
      SessionRepository sessions,
      FeatureRepository features,
      RoundRepository rounds,
      Broadcaster broadcaster,
      SessionLocks locks,
      Transactions transactions,
      ClockPort clock,
      IdGenerator ids,
      MethodRegistry methods) {
    return new RoundUseCase(
        sessions, features, rounds, broadcaster, locks, transactions, clock, ids, methods);
  }

  @Bean
  public VoteUseCase voteUseCase(
      SessionRepository sessions,
      RoundRepository rounds,
      Broadcaster broadcaster,
      SessionLocks locks,
      Transactions transactions,
      ClockPort clock,
      MethodRegistry methods) {
    return new VoteUseCase(sessions, rounds, broadcaster, locks, transactions, clock, methods);
  }

  @Bean
  public ChangeStatusUseCase changeStatusUseCase(
      SessionRepository sessions,
      Broadcaster broadcaster,
      SessionLocks locks,
      Transactions transactions) {
    return new ChangeStatusUseCase(sessions, broadcaster, locks, transactions);
  }

  @Bean
  public TransferFacilitatorUseCase transferFacilitatorUseCase(
      SessionRepository sessions,
      ParticipantRepository participants,
      Broadcaster broadcaster,
      SessionLocks locks,
      Transactions transactions,
      IdGenerator ids) {
    return new TransferFacilitatorUseCase(
        sessions, participants, broadcaster, locks, transactions, ids);
  }
}
