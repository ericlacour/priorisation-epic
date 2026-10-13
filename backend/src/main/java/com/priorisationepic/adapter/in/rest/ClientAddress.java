package com.priorisationepic.adapter.in.rest;

import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.List;

/**
 * Seule lecture de l'IP cliente (décision du 2026-10-04) : {@code CF-Connecting-IP} s'il est
 * présent <b>et</b> que la requête porte le secret partagé avec Cloudflare ; sinon la
 * <b>dernière</b> entrée de {@code X-Forwarded-For}, ajoutée par le dernier mandataire (Render) ;
 * sinon l'adresse de la connexion. L'entrée la plus à gauche de {@code X-Forwarded-For} n'est
 * jamais utilisée : le client peut l'écrire à sa guise.
 *
 * <p>L'IP sert uniquement à compter les créations : elle n'apparaît jamais dans les journaux.
 */
final class ClientAddress {

  static final String CF_CONNECTING_IP = "CF-Connecting-IP";
  static final String X_FORWARDED_FOR = "X-Forwarded-For";

  private ClientAddress() {}

  static final String PROXY_SECRET_HEADER = "X-Proxy-Secret";

  /**
   * @param proxySecret secret partagé avec Cloudflare (règle de transformation qui ajoute {@code
   *     X-Proxy-Secret}) ; vide : {@code CF-Connecting-IP} est ignoré, car l'API est joignable sans
   *     passer par Cloudflare et le client pourrait l'écrire à sa guise
   */
  static String of(HttpServletRequest request, String proxySecret) {
    String cloudflare = request.getHeader(CF_CONNECTING_IP);
    if (cloudflare != null && !cloudflare.isBlank() && fromCloudflare(request, proxySecret)) {
      return cloudflare.strip();
    }
    String forwarded = lastForwardedFor(request);
    if (forwarded != null) {
      return forwarded;
    }
    return request.getRemoteAddr();
  }

  private static boolean fromCloudflare(HttpServletRequest request, String proxySecret) {
    String presented = request.getHeader(PROXY_SECRET_HEADER);
    return proxySecret != null
        && !proxySecret.isBlank()
        && presented != null
        && MessageDigest.isEqual(
            presented.getBytes(StandardCharsets.UTF_8),
            proxySecret.getBytes(StandardCharsets.UTF_8));
  }

  /**
   * Dernière entrée non vide de {@code X-Forwarded-For}, sur toutes ses occurrences ; {@code null}
   * sinon.
   */
  private static String lastForwardedFor(HttpServletRequest request) {
    List<String> headers = Collections.list(request.getHeaders(X_FORWARDED_FOR));
    for (int h = headers.size() - 1; h >= 0; h--) {
      String[] entries = headers.get(h).split(",");
      for (int e = entries.length - 1; e >= 0; e--) {
        if (!entries[e].isBlank()) {
          return entries[e].strip();
        }
      }
    }
    return null;
  }
}
