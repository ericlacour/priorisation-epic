package com.priorisationepic.adapter.in.ws;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Client WebSocket de test. Le client du JDK répond seul aux pings tant qu'il lit : un client «
 * muet » cesse de lire après son premier message, comme un réseau coupé, et ne répond donc plus aux
 * pings.
 */
public final class WsTestClient implements WebSocket.Listener {

  static final String ORIGIN = "https://front.example";

  final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
  final AtomicInteger pings = new AtomicInteger();
  final AtomicBoolean closed = new AtomicBoolean();
  final CompletableFuture<Integer> closeCode = new CompletableFuture<>();
  private final boolean silent;
  private final StringBuilder partial = new StringBuilder();
  WebSocket socket;

  WsTestClient() {
    this(false);
  }

  WsTestClient(boolean silent) {
    this.silent = silent;
  }

  /** Ouvre la connexion (sans rien envoyer). */
  public static WsTestClient open(HttpClient http, int port, String sessionId, boolean silent)
      throws Exception {
    WsTestClient client = new WsTestClient(silent);
    client.socket =
        http.newWebSocketBuilder()
            .header("Origin", ORIGIN)
            .buildAsync(URI.create("ws://localhost:" + port + "/ws/sessions/" + sessionId), client)
            .get(5, TimeUnit.SECONDS);
    return client;
  }

  /** Coupe la connexion sans poignée de fermeture. */
  public void abort() {
    socket.abort();
  }

  /** Ferme la connexion normalement (1000). */
  public void close() {
    socket.sendClose(WebSocket.NORMAL_CLOSURE, "").join();
  }

  /** Le code de fermeture envoyé par le serveur, attendu au plus {@code timeoutMs}. */
  public int awaitCloseCode(long timeoutMs) throws Exception {
    return closeCode.get(timeoutMs, TimeUnit.MILLISECONDS);
  }

  public void send(String json) {
    socket.sendText(json, true).join();
  }

  public void hello(String participantToken) {
    send("{\"type\":\"hello\",\"participantToken\":\"" + participantToken + "\"}");
  }

  public void hello(String participantToken, String animationToken) {
    send(
        "{\"type\":\"hello\",\"participantToken\":\""
            + participantToken
            + "\",\"animationToken\":\""
            + animationToken
            + "\"}");
  }

  /** Prochain message texte reçu, ou {@code null} dans le délai. */
  public String next(long timeoutMs) throws InterruptedException {
    return messages.poll(timeoutMs, TimeUnit.MILLISECONDS);
  }

  /**
   * Premier message dont le texte contient {@code fragment} reçu dans le délai, sinon {@code null}.
   */
  public String nextContaining(String fragment, long timeoutMs) throws InterruptedException {
    long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
    while (true) {
      String text = messages.poll(Math.max(deadline - System.nanoTime(), 0), TimeUnit.NANOSECONDS);
      if (text == null || text.contains(fragment)) {
        return text;
      }
    }
  }

  @Override
  public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
    partial.append(data);
    if (last) {
      messages.add(partial.toString());
      partial.setLength(0);
    }
    if (!silent) {
      webSocket.request(1);
    }
    return null;
  }

  @Override
  public CompletionStage<?> onPing(WebSocket webSocket, ByteBuffer message) {
    pings.incrementAndGet();
    if (!silent) {
      webSocket.request(1);
    }
    return null;
  }

  @Override
  public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
    closed.set(true);
    closeCode.complete(statusCode);
    return null;
  }
}
