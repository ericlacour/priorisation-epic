package com.priorisationepic.config;

import com.priorisationepic.adapter.in.rest.CreationRateLimiter;
import java.time.Clock;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** CORS restreint à {@code ALLOWED_ORIGINS} (aucune origine par défaut), horloge et limiteur. */
@Configuration
@EnableConfigurationProperties(AllowedOrigins.class)
public class WebConfig implements WebMvcConfigurer {

  private final AllowedOrigins allowedOrigins;

  public WebConfig(AllowedOrigins allowedOrigins) {
    this.allowedOrigins = allowedOrigins;
  }

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    registry
        .addMapping("/api/**")
        .allowedOrigins(allowedOrigins.asArray())
        .allowedMethods("GET", "POST")
        .allowedHeaders("Content-Type", "X-Participant-Token", "X-Animation-Token")
        .exposedHeaders("Retry-After", "Content-Disposition");
  }

  /** Créations de session par adresse cliente sur une fenêtre glissante (429). */
  @Bean
  public CreationRateLimiter creationRateLimiter(
      Clock clock,
      @Value("${priorisation-epic.max-creations-per-ip:10}") int maxCreationsPerIp,
      @Value("${priorisation-epic.creation-window:1m}") Duration creationWindow) {
    return new CreationRateLimiter(clock, maxCreationsPerIp, creationWindow);
  }

  /** Toute lecture de l'heure passe par cette horloge, en UTC. */
  @Bean
  public Clock clock() {
    return Clock.systemUTC();
  }
}
