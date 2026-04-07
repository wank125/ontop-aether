package com.tianzhi.ontopengine.service;

import com.tianzhi.ontopengine.model.EndpointRegistration;
import com.tianzhi.ontopengine.repository.EndpointRegistryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Map;

/**
 * Switches the active SPARQL endpoint to a different datasource.
 *
 * Supports two modes:
 * 1. Multi-repo mode: registers the datasource on the endpoint's /api/v1/repositories API
 * 2. Legacy fallback: copies files to shared active dir and triggers restart
 */
@Service
public class EndpointSwitcherService {

    private static final Logger log = LoggerFactory.getLogger(EndpointSwitcherService.class);

    private final EndpointRegistryRepository registryRepo;
    private final RestTemplate restTemplate;

    @Value("${ontop.endpoint.url}")
    private String endpointUrl;

    @Value("${ontop.endpoint.active-dir}")
    private String activeDir;

    @Value("${ontop.internal-secret:}")
    private String internalSecret;

    public EndpointSwitcherService(EndpointRegistryRepository registryRepo, RestTemplate restTemplate) {
        this.registryRepo = registryRepo;
        this.restTemplate = restTemplate;
    }

    /**
     * Switch endpoint to specified datasource.
     * Returns [success, message].
     */
    public Object[] switchToDatasource(String dsId) {
        EndpointRegistration reg = registryRepo.getByDsId(dsId);
        if (reg == null) {
            return new Object[]{false, "Datasource " + dsId + " not registered, please run Bootstrap first"};
        }

        String ontologyPath = reg.getOntologyPath();
        String mappingPath = reg.getMappingPath();
        String propertiesPath = reg.getPropertiesPath();

        if (ontologyPath.isEmpty() || mappingPath.isEmpty() || propertiesPath.isEmpty()) {
            return new Object[]{false, "Endpoint file paths incomplete, please re-run Bootstrap"};
        }

        // Step 1: Try multi-repo registration via API
        boolean registered = tryRegisterViaApi(dsId, ontologyPath, mappingPath, propertiesPath);

        if (!registered) {
            // Fallback: legacy file copy + restart
            log.info("Multi-repo API not available, falling back to file copy + restart");
            if (activeDir != null && !activeDir.isEmpty()) {
                try {
                    Path activePath = Path.of(activeDir);
                    Files.createDirectories(activePath);
                    syncFilesToActive(ontologyPath, mappingPath, propertiesPath, activePath);
                } catch (Exception e) {
                    return new Object[]{false, "File sync failed: " + e.getMessage()};
                }
            }

            boolean ok = triggerRestart();
            if (!ok) {
                return new Object[]{false, "Files switched but endpoint restart failed"};
            }
        }

        // Step 2: Set as active on endpoint (only meaningful in multi-repo mode)
        boolean activated = tryActivateViaApi(dsId);

        if (registered && !activated) {
            log.error("Registration succeeded but activation failed for dsId={}", dsId);
            return new Object[]{false,
                    "Datasource registered on endpoint but activation failed. "
                    + "The endpoint may still be serving the previous datasource."};
        }

        // Step 3: Update local registry
        registryRepo.activate(dsId);

        // Step 4: Save active endpoint config (legacy)
        saveActiveEndpointConfig(ontologyPath, mappingPath, propertiesPath);

        return new Object[]{true, "Switched to datasource " + reg.getDsName()};
    }

    /**
     * Try to register the repository via the endpoint's management API.
     * Returns true if successful, false if endpoint doesn't support it.
     */
    private boolean tryRegisterViaApi(String dsId, String ontologyPath, String mappingPath, String propertiesPath) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            if (internalSecret != null && !internalSecret.isBlank()) {
                headers.set("X-Internal-Secret", internalSecret);
            }

            String body = String.format(
                    "{\"dsId\":\"%s\",\"ontologyPath\":\"%s\",\"mappingPath\":\"%s\",\"propertiesPath\":\"%s\"}",
                    dsId, ontologyPath, mappingPath, propertiesPath);

            HttpEntity<String> entity = new HttpEntity<>(body, headers);
            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    endpointUrl + "/api/v1/repositories",
                    HttpMethod.POST, entity,
                    new ParameterizedTypeReference<>() {});

            if (response.getStatusCode().is2xxSuccessful()) {
                log.info("Registered repository via API for dsId={}", dsId);
                return true;
            }
            log.warn("Repository API returned: {}", response.getStatusCode());
            return false;
        } catch (Exception e) {
            log.debug("Multi-repo API not available: {}", e.getMessage());
            return false;
        }
    }

    /**
     * Try to set the active repository via the endpoint's management API.
     */
    private boolean tryActivateViaApi(String dsId) {
        try {
            HttpHeaders headers = new HttpHeaders();
            if (internalSecret != null && !internalSecret.isBlank()) {
                headers.set("X-Internal-Secret", internalSecret);
            }
            HttpEntity<Void> entity = new HttpEntity<>(headers);

            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    endpointUrl + "/api/v1/repositories/" + dsId + "/activate",
                    HttpMethod.PUT, entity,
                    new ParameterizedTypeReference<>() {});

            if (response.getStatusCode().is2xxSuccessful()) {
                log.info("Activated repository via API for dsId={}", dsId);
                return true;
            }
            return false;
        } catch (Exception e) {
            log.debug("Activate API not available: {}", e.getMessage());
            return false;
        }
    }

    // ── Legacy methods ──────────────────────────────────────

    private void syncFilesToActive(String ontologyPath, String mappingPath,
                                    String propertiesPath, Path activeDir) throws IOException {
        Path activeOnto = activeDir.resolve("active_ontology.ttl");
        Path activeMap = activeDir.resolve("active_mapping.obda");
        Path activeProps = activeDir.resolve("active.properties");

        copyIfExists(Path.of(ontologyPath), activeOnto);
        copyIfExists(Path.of(mappingPath), activeMap);
        copyIfExists(Path.of(propertiesPath), activeProps);

        log.info("Synced files to active dir: {}", activeDir);
    }

    private void copyIfExists(Path src, Path dst) throws IOException {
        if (Files.exists(src)) {
            Files.copy(src, dst, StandardCopyOption.REPLACE_EXISTING);
        } else {
            log.warn("Source file not found: {}", src);
        }
    }

    private boolean triggerRestart() {
        try {
            HttpHeaders headers = new HttpHeaders();
            if (internalSecret != null && !internalSecret.isBlank()) {
                headers.set("X-Internal-Secret", internalSecret);
            }
            HttpEntity<Void> entity = new HttpEntity<>(headers);
            ResponseEntity<Void> resp = restTemplate.postForEntity(
                    endpointUrl + "/ontop/restart", entity, Void.class);
            if (resp.getStatusCode().is2xxSuccessful()) {
                log.info("Endpoint restart succeeded");
                return true;
            }
            log.warn("Endpoint restart returned: {}", resp.getStatusCode());
            return false;
        } catch (Exception e) {
            log.error("Endpoint restart failed: {}", e.getMessage());
            return false;
        }
    }

    private void saveActiveEndpointConfig(String ontologyPath, String mappingPath, String propertiesPath) {
        try {
            Path configPath = Path.of(activeDir, "active_endpoint.json");
            String json = String.format(
                    "{\"ontology_path\":\"%s\",\"mapping_path\":\"%s\",\"properties_path\":\"%s\"}",
                    ontologyPath, mappingPath, propertiesPath);
            Files.writeString(configPath, json);
        } catch (IOException e) {
            log.warn("Failed to save active endpoint config: {}", e.getMessage());
        }
    }
}
