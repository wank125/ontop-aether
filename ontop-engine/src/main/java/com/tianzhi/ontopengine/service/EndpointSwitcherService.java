package com.tianzhi.ontopengine.service;

import com.tianzhi.ontopengine.model.EndpointRegistration;
import com.tianzhi.ontopengine.repository.EndpointRegistryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Map;

/**
 * Switches the active SPARQL endpoint to a different datasource.
 * Copies files to shared active dir and triggers endpoint restart.
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

        // Step 1: Copy files to shared active directory
        if (activeDir != null && !activeDir.isEmpty()) {
            try {
                Path activePath = Path.of(activeDir);
                Files.createDirectories(activePath);
                syncFilesToActive(ontologyPath, mappingPath, propertiesPath, activePath);
            } catch (Exception e) {
                return new Object[]{false, "File sync failed: " + e.getMessage()};
            }
        }

        // Step 2: Trigger restart
        boolean ok = triggerRestart();
        if (!ok) {
            return new Object[]{false, "Files switched but endpoint restart failed"};
        }

        // Step 3: Update registry
        registryRepo.activate(dsId);

        // Step 4: Save active endpoint config
        saveActiveEndpointConfig(ontologyPath, mappingPath, propertiesPath);

        return new Object[]{true, "Switched to datasource " + reg.getDsName()};
    }

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
            ResponseEntity<Void> resp = restTemplate.postForEntity(
                    endpointUrl + "/ontop/restart", null, Void.class);
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
