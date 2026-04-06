package com.tianzhi.ontop.endpoint.controller;

import it.unibz.inf.ontop.rdf4j.repository.impl.OntopVirtualRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class HealthController {

    private final OntopVirtualRepository repository;

    @Autowired
    public HealthController(OntopVirtualRepository repository) {
        this.repository = repository;
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        boolean isInitialized = repository.isInitialized();
        return ResponseEntity.ok(Map.of(
                "status", isInitialized ? "UP" : "DOWN",
                "repository", isInitialized ? "initialized" : "not initialized"
        ));
    }
}
