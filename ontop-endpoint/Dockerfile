# ── Stage 1: Download Ontop CLI + JDBC drivers ─────────
FROM eclipse-temurin:17-jre AS downloader

ARG ONTOP_VERSION=5.5.0
ARG ONTOP_CLI_URL=https://github.com/ontop/ontop/releases/download/ontop-${ONTOP_VERSION}/ontop-cli-${ONTOP_VERSION}.zip
ARG PG_JDBC_VERSION=42.7.3
ARG MYSQL_JDBC_VERSION=9.1.0

RUN apt-get update && apt-get install -y --no-install-recommends curl unzip \
    && rm -rf /var/lib/apt/lists/* \
    && curl -L -o /tmp/ontop-cli.zip "${ONTOP_CLI_URL}" \
    && unzip /tmp/ontop-cli.zip -d /opt/ontop-cli \
    && rm /tmp/ontop-cli.zip \
    && chmod +x /opt/ontop-cli/ontop \
    && curl -L -o /opt/ontop-cli/jdbc/postgresql.jar \
       "https://jdbc.postgresql.org/download/postgresql-${PG_JDBC_VERSION}.jar" \
    && curl -L -o /opt/ontop-cli/jdbc/mysql.jar \
       "https://repo1.maven.org/maven2/com/mysql/mysql-connector-j/${MYSQL_JDBC_VERSION}/mysql-connector-j-${MYSQL_JDBC_VERSION}.jar"

# ── Stage 2: Runtime ─────────────────────────────────────
FROM eclipse-temurin:17-jre

WORKDIR /opt

COPY --from=downloader /opt/ontop-cli /opt/ontop-cli
COPY entrypoint.sh /opt/ontop-endpoint/entrypoint.sh
COPY seed/ /opt/ontop-seed/

RUN chmod +x /opt/ontop-endpoint/entrypoint.sh /opt/ontop-cli/ontop

EXPOSE 8080

ENTRYPOINT ["/opt/ontop-endpoint/entrypoint.sh"]
