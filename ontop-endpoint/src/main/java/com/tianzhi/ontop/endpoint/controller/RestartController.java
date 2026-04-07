package com.tianzhi.ontop.endpoint.controller;

import com.tianzhi.ontop.endpoint.config.OntopRepositoryConfig;
import com.tianzhi.ontop.endpoint.config.RepositoryRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
public class RestartController {

    private static final Logger log = LoggerFactory.getLogger(RestartController.class);

    private final OntopRepositoryConfig repositoryConfig;
    private final RepositoryRegistry registry;

    @Autowired
    public RestartController(OntopRepositoryConfig repositoryConfig, RepositoryRegistry registry) {
        this.repositoryConfig = repositoryConfig;
        this.registry = registry;
    }

    /**
     * Restart the active repository (legacy endpoint).
     */
    @PostMapping("/ontop/restart")
    public ResponseEntity<Map<String, String>> restart() {
        log.info("Received restart request (active repository)");
        try {
            repositoryConfig.restart();
            return ResponseEntity.ok(Map.of("status", "ok", "message", "Ontop endpoint restarted"));
        } catch (Exception e) {
            log.error("Restart failed", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("status", "error", "message", e.getMessage()));
        }
    }

    /**
     * Restart a specific repository by dsId.
     */
    @PostMapping("/ontop/{dsId}/restart")
    public ResponseEntity<Map<String, String>> restartByDsId(@PathVariable String dsId) {
        log.info("Received restart request for dsId={}", dsId);
        try {
            registry.restart(dsId);
            return ResponseEntity.ok(Map.of("status", "ok", "message", "Repository restarted: " + dsId));
        } catch (Exception e) {
            log.error("Restart failed for dsId={}", dsId, e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("status", "error", "message", e.getMessage()));
        }
    }
}
