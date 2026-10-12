# Image du webservice, compatible OpenShift : UID arbitraire possible, aucune écriture hors de /tmp.

FROM eclipse-temurin:25-jdk-noble AS build
WORKDIR /build
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN ./mvnw -q -B dependency:go-offline
COPY src/ src/
RUN ./mvnw -q -B -DskipTests package

FROM eclipse-temurin:25-jre-noble
# UID arbitraire possible : l'application appartient au groupe 0, avec les droits du propriétaire.
RUN useradd --uid 10001 --gid 0 --no-create-home --home-dir /app app
WORKDIR /app
COPY --from=build /build/target/priorisation-epic.jar app.jar
RUN chgrp -R 0 /app && chmod -R g=u /app
USER 10001
# Configuration par variables d'environnement (PORT, DATABASE_URL, ALLOWED_ORIGINS).
EXPOSE 8080
ENTRYPOINT ["java", "-Djava.io.tmpdir=/tmp", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
