package com.priorisationepic.adapter.in.scheduling;

import com.priorisationepic.application.ImportUseCase;
import java.time.Duration;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Purge des aperçus d'import expirés (15 minutes après leur création), toutes les 5 minutes par
 * défaut. Une exception est journalisée et n'arrête pas les passages suivants ; arrêtée avec
 * l'application.
 */
@Component
public class ImportPreviewPurgeScheduler implements DisposableBean {

  private static final Logger LOG = LoggerFactory.getLogger(ImportPreviewPurgeScheduler.class);

  private final ImportUseCase imports;
  private final ScheduledExecutorService timer =
      Executors.newSingleThreadScheduledExecutor(
          Thread.ofPlatform().daemon().name("import-preview-purge").factory());

  public ImportPreviewPurgeScheduler(
      ImportUseCase imports,
      @Value("${priorisation-epic.import-preview-purge-interval:5m}") Duration interval) {
    this.imports = imports;
    timer.scheduleWithFixedDelay(
        this::purge, interval.toMillis(), interval.toMillis(), TimeUnit.MILLISECONDS);
  }

  /** Un passage : les aperçus expirés sont supprimés. */
  void purge() {
    try {
      int purged = imports.purgeExpired();
      if (purged > 0) {
        LOG.info("Expired import previews purged: {}", purged);
      }
    } catch (RuntimeException e) {
      LOG.error("Import preview purge failed", e);
    }
  }

  @Override
  public void destroy() {
    timer.shutdownNow();
  }
}
