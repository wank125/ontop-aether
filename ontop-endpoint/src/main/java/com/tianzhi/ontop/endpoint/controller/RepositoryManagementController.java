package com.tianzhi.ontop.endpoint.controller;

import com.tianzhi.ontop.endpoint.config.RepositoryRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST API for managing multiple Ontop Repository instances.
 */
@RestController
@RequestMapping("/api/v1/repositories")
public class RepositoryManagementController {

    private static final Logger log = LoggerFactory.getLogger(RepositoryManagementController.class);

    private final RepositoryRegistry registry;

    @Autowired
    public RepositoryManagementController(RepositoryRegistry registry) {
        this.registry = registry;
    }

    /**
     * List all registered repositories.
     */
    @GetMapping
    public List<Map<String, Object>> list() {
        return registry.list();
    }

    /**
     * Register a new repository (or replace existing).
     */
    @PostMapping
    public ResponseEntity<Map<String, Object>> register(@RequestBody RegisterRequest req) {
        if (req.getDsId() == null || req.getDsId().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "ds_id is required"));
        }
        if (req.getMappingPath() == null || req.getMappingPath().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "mapping_path is required"));
        }

        try {
            registry.register(req.getDsId(), req.getOntologyPath(),
                    req.getMappingPath(), req.getPropertiesPath());

            boolean isActive = req.getDsId().equals(registry.getActiveDsId());
            return ResponseEntity.ok(Map.of(
                    "status", "ok",
                    "ds_id", req.getDsId(),
                    "active", isActive,
                    "message", "Repository registered successfully"
            ));
        } catch (Exception e) {
            log.error("Failed to register repository dsId={}", req.getDsId(), e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Unregister a repository.
     */
    @DeleteMapping("/{dsId}")
    public ResponseEntity<Map<String, Object>> unregister(@PathVariable String dsId) {
        if (!registry.contains(dsId)) {
            return ResponseEntity.notFound().build();
        }
        registry.unregister(dsId);
        return ResponseEntity.ok(Map.of("status", "ok", "message", "Repository unregistered: " + dsId));
    }

    /**
     * Restart a specific repository.
     */
    @PostMapping("/{dsId}/restart")
    public ResponseEntity<Map<String, Object>> restart(@PathVariable String dsId) {
        if (!registry.contains(dsId)) {
            return ResponseEntity.notFound().build();
        }
        try {
            registry.restart(dsId);
            return ResponseEntity.ok(Map.of("status", "ok", "message", "Repository restarted: " + dsId));
        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Set the active repository.
     */
    @PutMapping("/{dsId}/activate")
    public ResponseEntity<Map<String, Object>> activate(@PathVariable String dsId) {
        if (!registry.contains(dsId)) {
            return ResponseEntity.notFound().build();
        }
        registry.setActiveDsId(dsId);
        return ResponseEntity.ok(Map.of(
                "status", "ok",
                "active_ds_id", dsId,
                "message", "Active repository set to: " + dsId
        ));
    }

    /**
     * Health check for a specific repository.
     */
    @GetMapping("/{dsId}/health")
    public ResponseEntity<Map<String, Object>> health(@PathVariable String dsId) {
        if (!registry.contains(dsId)) {
            return ResponseEntity.status(404)
                    .body(Map.of("status", "NOT_FOUND", "ds_id", dsId));
        }
        var repo = registry.get(dsId);
        boolean ok = repo != null && repo.isInitialized();
        return ResponseEntity.ok(Map.of(
                "status", ok ? "UP" : "DOWN",
                "ds_id", dsId,
                "initialized", ok
        ));
    }

    // ── Request DTO ─────────────────────────────────────────

    public static class RegisterRequest {
        private String dsId;
        private String ontologyPath;
        private String mappingPath;
        private String propertiesPath;

        // Accept both snake_case and camelCase via getters/setters
        // Jackson maps ds_id → setDs_id() or dsId → setDsId()
        public String getDsId() { return dsId; }
        public void setDsId(String dsId) { this.dsId = dsId; }
        public void setDs_id(String dsId) { this.dsId = dsId; }
        public String getOntologyPath() { return ontologyPath; }
        public void setOntologyPath(String ontologyPath) { this.ontologyPath = ontologyPath; }
        public void setOntology_path(String ontologyPath) { this.ontologyPath = ontologyPath; }
        public String getMappingPath() { return mappingPath; }
        public void setMappingPath(String mappingPath) { this.mappingPath = mappingPath; }
        public void setMapping_path(String mappingPath) { this.mappingPath = mappingPath; }
        public String getPropertiesPath() { return propertiesPath; }
        public void setPropertiesPath(String propertiesPath) { this.propertiesPath = propertiesPath; }
        public void setProperties_path(String propertiesPath) { this.propertiesPath = propertiesPath; }
    }
}
