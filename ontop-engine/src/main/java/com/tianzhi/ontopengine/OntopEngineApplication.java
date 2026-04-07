package com.tianzhi.ontopengine;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import org.springframework.cache.annotation.EnableCaching;
import org.springframework.scheduling.annotation.EnableAsync;

import javax.annotation.PostConstruct;

@SpringBootApplication
@EnableCaching
@EnableAsync
public class OntopEngineApplication {

    private static final Logger log = LoggerFactory.getLogger(OntopEngineApplication.class);

    @Value("${ontop.internal-secret:}")
    private String internalSecret;

    private static final String DEFAULT_SECRET = "changeme-in-production";

    @PostConstruct
    public void warnOnDefaultSecret() {
        if (internalSecret == null || internalSecret.isBlank()) {
            log.warn("ONTOP_INTERNAL_SECRET is not set — inter-service authentication is disabled. Set a strong secret in production.");
        } else if (internalSecret.equals(DEFAULT_SECRET)) {
            log.warn("ONTOP_INTERNAL_SECRET is using the default value '{}'. Change it for production deployments.", DEFAULT_SECRET);
        }
    }

    public static void main(String[] args) {
        SpringApplication.run(OntopEngineApplication.class, args);
    }
}
