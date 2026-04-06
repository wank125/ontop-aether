package com.tianzhi.ontop.endpoint.controller;

import com.tianzhi.ontop.endpoint.config.OntopRepositoryConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class RestartController {

    private static final Logger log = LoggerFactory.getLogger(RestartController.class);

    private final OntopRepositoryConfig repositoryConfig;

    @Autowired
    public RestartController(OntopRepositoryConfig repositoryConfig) {
        this.repositoryConfig = repositoryConfig;
    }

    @PostMapping("/ontop/restart")
    public ResponseEntity<Map<String, String>> restart() {
        log.info("Received restart request");
        try {
            repositoryConfig.restart();
            return ResponseEntity.ok(Map.of("status", "ok", "message", "Ontop endpoint restarted"));
        } catch (Exception e) {
            log.error("Restart failed", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("status", "error", "message", e.getMessage()));
        }
    }
}
