package com.tianzhi.ontopengine.service;

import com.tianzhi.ontopengine.model.EndpointRegistration;
import com.tianzhi.ontopengine.repository.EndpointRegistryRepository;
import com.tianzhi.ontopengine.repository.QueryHistoryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

/**
 * Proxies SPARQL queries to the Ontop endpoint, supporting multi-repository routing.
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
    private final EndpointRegistryRepository endpointRegistryRepo;

    public SparqlProxyService(RestTemplate restTemplate, QueryHistoryRepository historyRepo,
                              EndpointRegistryRepository endpointRegistryRepo) {
        this.restTemplate = restTemplate;
        this.historyRepo = historyRepo;
        this.endpointRegistryRepo = endpointRegistryRepo;
    }

    /**
     * Execute SPARQL query via proxy.
     *
     * @param query  SPARQL query string
     * @param format output format
     * @param dsId   optional data source ID; null uses active / legacy endpoint
     * @return response with SPARQL results
     */
    public ResponseEntity<byte[]> executeQuery(String query, String format, String dsId) {
        String accept = FORMAT_MAP.getOrDefault(format, "application/sparql-results+json");
        long t0 = System.nanoTime();
        String status = "ok";
        String errorMessage = "";
        Integer resultCount = null;

        // Build target URL: if dsId specified, use /{dsId}/sparql, else /sparql
        String targetUrl = (dsId != null && !dsId.isBlank())
                ? endpointUrl + "/" + dsId + "/sparql"
                : endpointUrl + "/sparql";

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
            headers.set("Accept", accept);

            org.springframework.util.MultiValueMap<String, String> formData =
                    new org.springframework.util.LinkedMultiValueMap<>();
            formData.add("query", query);

            HttpEntity<org.springframework.util.MultiValueMap<String, String>> entity =
                    new HttpEntity<>(formData, headers);

            ResponseEntity<byte[]> response = restTemplate.exchange(
                    targetUrl, HttpMethod.POST, entity, byte[].class);

            if (!response.getStatusCode().is2xxSuccessful()) {
                status = "error";
                errorMessage = new String(response.getBody() != null ? response.getBody() : new byte[0]);
                errorMessage = errorMessage.substring(0, Math.min(500, errorMessage.length()));
            } else {
                if (accept.contains("json") && response.getBody() != null) {
                    try {
                        String body = new String(response.getBody());
                        resultCount = countBindings(body);
                    } catch (Exception ignored) {
                    }
            }
            }

            double durationMs = (System.nanoTime() - t0) / 1_000_000.0;
            historyRepo.save(query, resultCount, dsId != null ? dsId : "", "web", durationMs, status, errorMessage);

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
            historyRepo.save(query, null, dsId != null ? dsId : "", "web", durationMs, status, errorMessage);
            throw new RuntimeException("Ontop endpoint is not running: " + errorMessage);
        }
    }

    /**
     * Get SQL reformulation of a SPARQL query (active repository).
     */
    public Map<String, String> reformulate(String query) {
        return reformulate(query, null);
    }

    /**
     * Get SQL reformulation targeting a specific repository.
     */
    public Map<String, String> reformulate(String query, String dsId) {
        try {
            String targetUrl = (dsId != null && !dsId.isBlank())
                    ? endpointUrl + "/" + dsId + "/ontop/reformulate"
                    : endpointUrl + "/ontop/reformulate";

            ResponseEntity<String> response = restTemplate.getForEntity(
                    targetUrl + "?query={query}", String.class, query);

            if (response.getStatusCode().is2xxSuccessful()) {
                return Map.of("sql", response.getBody() != null ? response.getBody() : "");
            }
            return Map.of("sql", "Error: " + (response.getBody() != null ? response.getBody().substring(0, 200) : "Unknown"));
        } catch (Exception e) {
            throw new RuntimeException("Ontop endpoint is not running");
        }
    }

    /**
     * Check endpoint status and list available repositories.
     */
    public Map<String, Object> getEndpointStatus() {
        Map<String, Object> result = new HashMap<>();
        result.put("port", 8080);

        try {
            org.springframework.util.MultiValueMap<String, String> formData =
                    new org.springframework.util.LinkedMultiValueMap<>();
            formData.add("query", "ASK { ?s ?p ?o } LIMIT 1");

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
            headers.set("Accept", "application/sparql-results+json");

            HttpEntity<org.springframework.util.MultiValueMap<String, String>> entity =
                    new HttpEntity<>(formData, headers);
            restTemplate.exchange(endpointUrl + "/sparql", HttpMethod.POST, entity, byte[].class);

            result.put("running", true);
        } catch (Exception e) {
            result.put("running", false);
        }

        // Try to get repository list from endpoint
        try {
            ResponseEntity<java.util.List> reposResponse = restTemplate.getForEntity(
                    endpointUrl + "/api/v1/repositories", java.util.List.class);
            if (reposResponse.getStatusCode().is2xxSuccessful() && reposResponse.getBody() != null) {
                result.put("repositories", reposResponse.getBody());
            }
        } catch (Exception ignored) {
            // Endpoint may not support multi-repo yet
        }

        // Attach current endpoint file paths
        try {
            EndpointRegistration current = endpointRegistryRepo.getCurrent();
            if (current != null) {
                result.put("ontology_path", current.getOntologyPath() != null ? current.getOntologyPath() : "");
                result.put("mapping_path", current.getMappingPath() != null ? current.getMappingPath() : "");
                result.put("properties_path", current.getPropertiesPath() != null ? current.getPropertiesPath() : "");
                result.put("ds_name", current.getDsName() != null ? current.getDsName() : "");
                result.put("ds_id", current.getDsId() != null ? current.getDsId() : "");
            }
        } catch (Exception ignored) {
        }

        return result;
    }

    private int countBindings(String json) {
        int count = 0;
        int idx = json.indexOf("\"bindings\"");
        if (idx < 0) return 0;
        int start = json.indexOf('[', idx);
        int end = json.indexOf(']', start);
        if (start < 0 || end < 0) return 0;
        String bindings = json.substring(start, end);
        for (int i = 0; i < bindings.length(); i++) {
            if (bindings.charAt(i) == '{') count++;
        }
        return count;
    }
}
