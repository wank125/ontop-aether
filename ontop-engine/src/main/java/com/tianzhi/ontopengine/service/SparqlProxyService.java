package com.tianzhi.ontopengine.service;

import com.tianzhi.ontopengine.repository.QueryHistoryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

/**
 * Proxies SPARQL queries to the Ontop endpoint and tracks query history.
 */
@Service
public class SparqlProxyService {

    private static final Logger log = LoggerFactory.getLogger(SparqlProxyService.class);

    private static final Map<String, String> FORMAT_MAP = Map.of(
            "json", "application/sparql-results+json",
            "xml", "application/sparql-results+xml",
            "csv", "text/csv",
            "turtle", "text/turtle"
    );

    @Value("${ontop.endpoint.url}")
    private String endpointUrl;

    private final RestTemplate restTemplate;
    private final QueryHistoryRepository historyRepo;

    public SparqlProxyService(RestTemplate restTemplate, QueryHistoryRepository historyRepo) {
        this.restTemplate = restTemplate;
        this.historyRepo = historyRepo;
    }

    /**
     * Execute SPARQL query via proxy. Returns raw response with correct content type.
     */
    public ResponseEntity<byte[]> executeQuery(String query, String format) {
        String accept = FORMAT_MAP.getOrDefault(format, "application/sparql-results+json");
        long t0 = System.nanoTime();
        String status = "ok";
        String errorMessage = "";
        Integer resultCount = null;

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
            headers.set("Accept", accept);

            // Send query as form-encoded parameter
            org.springframework.util.MultiValueMap<String, String> formData =
                    new org.springframework.util.LinkedMultiValueMap<>();
            formData.add("query", query);

            HttpEntity<org.springframework.util.MultiValueMap<String, String>> entity =
                    new HttpEntity<>(formData, headers);
            ResponseEntity<byte[]> response = restTemplate.exchange(
                    endpointUrl + "/sparql",
                    HttpMethod.POST, entity, byte[].class);

            if (!response.getStatusCode().is2xxSuccessful()) {
                status = "error";
                errorMessage = new String(response.getBody() != null ? response.getBody() : new byte[0]);
                errorMessage = errorMessage.substring(0, Math.min(500, errorMessage.length()));
            } else {
                // Count results for JSON format
                if (accept.contains("json") && response.getBody() != null) {
                    try {
                        String body = new String(response.getBody());
                        int idx = body.indexOf("\"bindings\"");
                        if (idx > 0) {
                            // Simple count of "binding" entries
                            resultCount = countBindings(body);
                        }
                    } catch (Exception ignored) {
                    }
                }
            }

            double durationMs = (System.nanoTime() - t0) / 1_000_000.0;
            historyRepo.save(query, resultCount, "", "web", durationMs, status, errorMessage);

            if ("error".equals(status)) {
                return ResponseEntity.status(response.getStatusCode()).body(response.getBody());
            }

            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(
                            response.getHeaders().getContentType() != null
                                    ? response.getHeaders().getContentType().toString()
                                    : accept))
                    .body(response.getBody());

        } catch (Exception e) {
            status = "error";
            errorMessage = e.getMessage() != null ? e.getMessage().substring(0, Math.min(500, e.getMessage().length())) : "Unknown";
            double durationMs = (System.nanoTime() - t0) / 1_000_000.0;
            historyRepo.save(query, null, "", "web", durationMs, status, errorMessage);
            throw new RuntimeException("Ontop endpoint is not running: " + errorMessage);
        }
    }

    /**
     * Get SQL reformulation of a SPARQL query.
     */
    public Map<String, String> reformulate(String query) {
        try {
            ResponseEntity<String> response = restTemplate.getForEntity(
                    endpointUrl + "/ontop/reformulate?query={query}",
                    String.class, query);

            if (response.getStatusCode().is2xxSuccessful()) {
                return Map.of("sql", response.getBody() != null ? response.getBody() : "");
            }
            return Map.of("sql", "Error: " + (response.getBody() != null ? response.getBody().substring(0, 200) : "Unknown"));
        } catch (Exception e) {
            throw new RuntimeException("Ontop endpoint is not running");
        }
    }

    /**
     * Check endpoint status by sending a simple ASK query.
     */
    public Map<String, Object> getEndpointStatus() {
        try {
            org.springframework.util.MultiValueMap<String, String> formData =
                    new org.springframework.util.LinkedMultiValueMap<>();
            formData.add("query", "ASK { ?s ?p ?o } LIMIT 1");

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
            headers.set("Accept", "application/sparql-results+json");

            HttpEntity<org.springframework.util.MultiValueMap<String, String>> entity =
                    new HttpEntity<>(formData, headers);
            ResponseEntity<byte[]> response = restTemplate.exchange(
                    endpointUrl + "/sparql", HttpMethod.POST, entity, byte[].class);

            return Map.of("running", true, "port", 8080);
        } catch (Exception e) {
            return Map.of("running", false, "port", 8080);
        }
    }

    private int countBindings(String json) {
        // Simple heuristic: count occurrences of },{ within bindings array
        int count = 0;
        int idx = json.indexOf("\"bindings\"");
        if (idx < 0) return 0;
        // Find the array start
        int start = json.indexOf('[', idx);
        int end = json.indexOf(']', start);
        if (start < 0 || end < 0) return 0;
        String bindings = json.substring(start, end);
        // Count objects in array by counting "{"
        for (int i = 0; i < bindings.length(); i++) {
            if (bindings.charAt(i) == '{') count++;
        }
        return count;
    }
}
