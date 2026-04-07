package com.tianzhi.ontopengine.api;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

/**
 * Proxies repository management requests to the Ontop endpoint.
 */
@RestController
@RequestMapping("/api/v1/repositories")
public class RepositoryProxyController {

    private static final Logger log = LoggerFactory.getLogger(RepositoryProxyController.class);

    private final RestTemplate restTemplate;

    @Value("${ontop.endpoint.url}")
    private String endpointUrl;

    public RepositoryProxyController(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> list() {
        try {
            ResponseEntity<List<Map<String, Object>>> response = restTemplate.exchange(
                    endpointUrl + "/api/v1/repositories",
                    HttpMethod.GET, null,
                    new ParameterizedTypeReference<>() {});
            return ResponseEntity.ok(response.getBody());
        } catch (Exception e) {
            log.warn("Failed to list repositories: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
        }
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> register(@RequestBody Map<String, String> body) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, String>> entity = new HttpEntity<>(body, headers);

            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    endpointUrl + "/api/v1/repositories",
                    HttpMethod.POST, entity,
                    new ParameterizedTypeReference<>() {});
            return ResponseEntity.ok(response.getBody());
        } catch (Exception e) {
            log.error("Failed to register repository: {}", e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{dsId}")
    public ResponseEntity<Void> unregister(@PathVariable String dsId) {
        try {
            restTemplate.exchange(
                    endpointUrl + "/api/v1/repositories/" + dsId,
                    HttpMethod.DELETE, null,
                    new ParameterizedTypeReference<Void>() {});
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            log.error("Failed to unregister repository: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @PutMapping("/{dsId}/activate")
    public ResponseEntity<Map<String, Object>> activate(@PathVariable String dsId) {
        try {
            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    endpointUrl + "/api/v1/repositories/" + dsId + "/activate",
                    HttpMethod.PUT, null,
                    new ParameterizedTypeReference<>() {});
            return ResponseEntity.ok(response.getBody());
        } catch (Exception e) {
            log.error("Failed to activate repository: {}", e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{dsId}/restart")
    public ResponseEntity<Map<String, Object>> restart(@PathVariable String dsId) {
        try {
            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    endpointUrl + "/api/v1/repositories/" + dsId + "/restart",
                    HttpMethod.POST, null,
                    new ParameterizedTypeReference<>() {});
            return ResponseEntity.ok(response.getBody());
        } catch (Exception e) {
            log.error("Failed to restart repository: {}", e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/{dsId}/health")
    public ResponseEntity<Map<String, Object>> health(@PathVariable String dsId) {
        try {
            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    endpointUrl + "/api/v1/repositories/" + dsId + "/health",
                    HttpMethod.GET, null,
                    new ParameterizedTypeReference<>() {});
            return ResponseEntity.ok(response.getBody());
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("status", "UNREACHABLE", "error", e.getMessage()));
        }
    }
}
