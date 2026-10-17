package com.priorisationepic.config;

import com.priorisationepic.application.Broadcaster;
import com.priorisationepic.application.ChangeLogRepository;
import com.priorisationepic.application.ChangeLogWriter;
import com.priorisationepic.application.ChangeStatusUseCase;
import com.priorisationepic.application.ClockPort;
import com.priorisationepic.application.CreateSessionUseCase;
import com.priorisationepic.application.ExportUseCase;
import com.priorisationepic.application.FeatureRepository;
import com.priorisationepic.application.FeatureUseCase;
import com.priorisationepic.application.ImportFileReader;
import com.priorisationepic.application.ImportPreviewRepository;
import com.priorisationepic.application.ImportUseCase;
import com.priorisationepic.application.JoinSessionUseCase;
import com.priorisationepic.application.ListSessionsUseCase;
import com.priorisationepic.application.ParticipantRepository;
import com.priorisationepic.application.SessionConnectionUseCase;
import com.priorisationepic.application.SessionExporter;
import com.priorisationepic.application.SessionLocks;
import com.priorisationepic.application.SessionRepository;
import com.priorisationepic.application.SessionStateAssembler;
import com.priorisationepic.application.Transactions;
import com.priorisationepic.application.UpdateSettingsUseCase;
import com.priorisationepic.domain.IdGenerator;
import com.priorisationepic.domain.method.MethodRegistry;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.transaction.support.TransactionTemplate;

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

  @Bean
  public Transactions transactions(TransactionTemplate template) {
    return new Transactions() {
      @Override
      public <T> T run(Supplier<T> action) {
        return template.execute(status -> action.get());
      }
    };
  }

  @Bean
  public MethodRegistry methodRegistry() {
    return MethodRegistry.standard();
  }

  @Bean
  public CreateSessionUseCase createSessionUseCase(
      SessionRepository sessions,
      ParticipantRepository participants,
      MethodRegistry methods,
      IdGenerator ids,
      ClockPort clock,
      Transactions transactions) {
    return new CreateSessionUseCase(sessions, participants, methods, ids, clock, transactions);
  }

  @Bean
  public JoinSessionUseCase joinSessionUseCase(
      SessionRepository sessions,
      ParticipantRepository participants,
      Broadcaster broadcaster,
      SessionLocks locks,
      IdGenerator ids,
      ClockPort clock,
      Transactions transactions,
      @Value("${priorisation-epic.absence-timeout:10m}") Duration absenceTimeout) {
    return new JoinSessionUseCase(
        sessions, participants, broadcaster, locks, ids, clock, transactions, absenceTimeout);
  }

  @Bean
  public FeatureUseCase featureUseCase(
      SessionRepository sessions,
      ParticipantRepository participants,
      FeatureRepository features,
      ChangeLogWriter changeLog,
      MethodRegistry methods,
      Broadcaster broadcaster,
      SessionLocks locks,
      IdGenerator ids,
      ClockPort clock,
      Transactions transactions) {
    return new FeatureUseCase(
        sessions,
        participants,
        features,
        changeLog,
        methods,
        broadcaster,
        locks,
        ids,
        clock,
        transactions);
  }

  @Bean
  public UpdateSettingsUseCase updateSettingsUseCase(
      SessionRepository sessions,
      ParticipantRepository participants,
      FeatureRepository features,
      ChangeLogWriter changeLog,
      MethodRegistry methods,
      Broadcaster broadcaster,
      SessionLocks locks,
      Transactions transactions) {
    return new UpdateSettingsUseCase(
        sessions, participants, features, changeLog, methods, broadcaster, locks, transactions);
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
  public ListSessionsUseCase listSessionsUseCase(SessionRepository sessions) {
    return new ListSessionsUseCase(sessions);
  }

  @Bean
  public ImportUseCase importUseCase(
      SessionRepository sessions,
      ParticipantRepository participants,
      FeatureRepository features,
      ImportPreviewRepository previews,
      ImportFileReader reader,
      ChangeLogWriter changeLog,
      MethodRegistry methods,
      Broadcaster broadcaster,
      SessionLocks locks,
      IdGenerator ids,
      ClockPort clock,
      Transactions transactions) {
    return new ImportUseCase(
        sessions,
        participants,
        features,
        previews,
        reader,
        changeLog,
        methods,
        broadcaster,
        locks,
        ids,
        clock,
        transactions);
  }

  @Bean
  public ExportUseCase exportUseCase(
      SessionStateAssembler states, SessionExporter exporter, ClockPort clock) {
    return new ExportUseCase(states, exporter, clock);
  }

  /**
   * Le diffuseur a besoin de l'assembleur, qui a besoin de la présence des connexions que le
   * diffuseur connaît : la présence est résolue à la première utilisation.
   */
  @Bean
  public SessionStateAssembler sessionStateAssembler(
      SessionRepository sessions,
      ParticipantRepository participants,
      FeatureRepository features,
      MethodRegistry methods,
      @Lazy Broadcaster presence) {
    return new SessionStateAssembler(sessions, participants, features, methods, presence);
  }
}
