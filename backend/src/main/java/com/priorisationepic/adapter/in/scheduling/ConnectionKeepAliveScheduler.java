package com.priorisationepic.adapter.in.scheduling;

import com.priorisationepic.application.ConnectionMaintenance;
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
 * Maintien des connexions WebSocket : ping de protocole toutes les 5 s, {@code tick} toutes les 5 s
 * et fermeture des connexions sans pong ni message depuis 15 s. Une exception est journalisée et
 * n'arrête pas les passages suivants ; arrêté avec l'application.
 */
@Component
public class ConnectionKeepAliveScheduler implements DisposableBean {

  private static final Logger LOG = LoggerFactory.getLogger(ConnectionKeepAliveScheduler.class);

  private final ConnectionMaintenance maintenance;
  private final Duration livenessTimeout;
  private final ScheduledExecutorService timer =
      Executors.newSingleThreadScheduledExecutor(
          Thread.ofPlatform().daemon().name("ws-keepalive").factory());

  public ConnectionKeepAliveScheduler(
      ConnectionMaintenance maintenance,
      @Value("${priorisation-epic.tick-interval:5s}") Duration tickInterval,
      @Value("${priorisation-epic.ping-interval:5s}") Duration pingInterval,
      @Value("${priorisation-epic.liveness-timeout:15s}") Duration livenessTimeout) {
    this.maintenance = maintenance;
    this.livenessTimeout = livenessTimeout;
    timer.scheduleWithFixedDelay(
        () -> guarded("tick", maintenance::sendTicks),
        tickInterval.toMillis(),
        tickInterval.toMillis(),
        TimeUnit.MILLISECONDS);
    timer.scheduleWithFixedDelay(
        this::pingAndSweep,
        pingInterval.toMillis(),
        pingInterval.toMillis(),
        TimeUnit.MILLISECONDS);
  }

  /** Un passage du ping : ping de protocole, puis fermeture des connexions silencieuses. */
  void pingAndSweep() {
    guarded("ping", maintenance::sendPings);
    guarded("liveness", () -> maintenance.closeIdle(livenessTimeout));
  }

  /** Aucune exception ne remonte au minuteur, qui s'arrêterait sans bruit. */
  private static void guarded(String name, Runnable action) {
    try {
      action.run();
    } catch (RuntimeException | Error e) {
      LOG.error("Keep-alive {} failed", name, e);
    }
  }

  @Override
  public void destroy() {
    timer.shutdownNow();
  }
}
