package com.tianzhi.ontop.endpoint.controller;

import com.tianzhi.ontop.endpoint.config.OntopRepositoryConfig;
import it.unibz.inf.ontop.rdf4j.repository.impl.OntopVirtualRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class HealthController {

    private final OntopRepositoryConfig repositoryConfig;

    @Autowired
    public HealthController(OntopRepositoryConfig repositoryConfig) {
        this.repositoryConfig = repositoryConfig;
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        OntopVirtualRepository repository = repositoryConfig.getRepository();
        boolean isInitialized = repository != null && repository.isInitialized();
        return ResponseEntity.ok(Map.of(
                "status", isInitialized ? "UP" : "DOWN",
                "repository", isInitialized ? "initialized" : "not initialized"
        ));
    }
}
