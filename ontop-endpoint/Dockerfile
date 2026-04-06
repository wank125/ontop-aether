FROM maven:3.9.9-eclipse-temurin-17 AS build

WORKDIR /app
COPY pom.xml .
RUN mvn -q -DskipTests dependency:go-offline
COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:17-jre

WORKDIR /app
COPY --from=build /app/target/ontop-endpoint-0.1.0.jar /app/ontop-endpoint.jar
COPY seed/ /opt/ontop-seed/

EXPOSE 8080

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-jar", "/app/ontop-endpoint.jar"]
