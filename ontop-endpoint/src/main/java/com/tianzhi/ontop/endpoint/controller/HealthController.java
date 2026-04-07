package com.tianzhi.ontop.endpoint.controller;

import com.tianzhi.ontop.endpoint.config.OntopRepositoryConfig;
import com.tianzhi.ontop.endpoint.config.RepositoryRegistry;
import it.unibz.inf.ontop.rdf4j.repository.impl.OntopVirtualRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
public class HealthController {

    private final OntopRepositoryConfig repositoryConfig;
    private final RepositoryRegistry registry;

    @Autowired
    public HealthController(OntopRepositoryConfig repositoryConfig, RepositoryRegistry registry) {
        this.repositoryConfig = repositoryConfig;
        this.registry = registry;
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        OntopVirtualRepository repository = repositoryConfig.getRepository();
        boolean isInitialized = repository != null && repository.isInitialized();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("status", isInitialized ? "UP" : "DOWN");
        result.put("repository", isInitialized ? "initialized" : "not initialized");
        result.put("active_ds_id", registry.getActiveDsId());
        result.put("total_repositories", registry.size());
        return ResponseEntity.ok(result);
    }

    @GetMapping("/health/{dsId}")
    public ResponseEntity<Map<String, Object>> healthByDsId(@PathVariable String dsId) {
        if (!registry.contains(dsId)) {
            return ResponseEntity.ok(Map.of("status", "NOT_FOUND", "ds_id", dsId));
        }
        var repo = registry.get(dsId);
        boolean ok = repo != null && repo.isInitialized();
        return ResponseEntity.ok(Map.of(
                "status", ok ? "UP" : "DOWN",
                "ds_id", dsId,
                "initialized", ok
        ));
    }
}
