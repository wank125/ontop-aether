package com.tianzhi.ontop.endpoint.config;

import it.unibz.inf.ontop.injection.OntopSQLOWLAPIConfiguration;
import it.unibz.inf.ontop.rdf4j.repository.OntopRepository;
import it.unibz.inf.ontop.rdf4j.repository.impl.OntopVirtualRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.annotation.PreDestroy;
import java.io.File;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Thread-safe registry of multiple Ontop Repository instances.
 * Each data source (identified by dsId) gets its own Repository.
 */
public class RepositoryRegistry {

    private static final Logger log = LoggerFactory.getLogger(RepositoryRegistry.class);

    private final ConcurrentHashMap<String, RepositoryEntry> repos = new ConcurrentHashMap<>();
    private volatile String activeDsId;

    // ── Register ────────────────────────────────────────────

    public synchronized RepositoryEntry register(String dsId, String ontologyPath,
                                                  String mappingPath, String propertiesPath) {
        // Shutdown existing if present
        RepositoryEntry existing = repos.get(dsId);
        if (existing != null) {
            shutdownEntry(existing);
        }

        OntopSQLOWLAPIConfiguration configuration = buildConfiguration(ontologyPath, mappingPath, propertiesPath);
        OntopVirtualRepository repository = (OntopVirtualRepository) OntopRepository.defaultRepository(configuration);
        repository.init();

        RepositoryEntry entry = new RepositoryEntry(dsId, ontologyPath, mappingPath,
                propertiesPath, configuration, repository);
        repos.put(dsId, entry);

        // Auto-set as active if no active exists
        if (activeDsId == null) {
            activeDsId = dsId;
        }

        log.info("Registered repository dsId={}, ontology={}, mapping={}, properties={}",
                dsId, ontologyPath, mappingPath, propertiesPath);
        return entry;
    }

    // ── Unregister ──────────────────────────────────────────

    public synchronized RepositoryEntry unregister(String dsId) {
        RepositoryEntry entry = repos.remove(dsId);
        if (entry != null) {
            shutdownEntry(entry);
            log.info("Unregistered repository dsId={}", dsId);
        }
        if (dsId.equals(activeDsId)) {
            activeDsId = repos.isEmpty() ? null : repos.keys().nextElement();
        }
        return entry;
    }

    // ── Get ─────────────────────────────────────────────────

    public OntopVirtualRepository get(String dsId) {
        RepositoryEntry entry = repos.get(dsId);
        if (entry != null) {
            entry.touchQueryTime();
            return entry.getRepository();
        }
        return null;
    }

    public RepositoryEntry getEntry(String dsId) {
        return repos.get(dsId);
    }

    public boolean contains(String dsId) {
        return repos.containsKey(dsId);
    }

    // ── Active management ───────────────────────────────────

    public String getActiveDsId() {
        return activeDsId;
    }

    public void setActiveDsId(String dsId) {
        if (dsId != null && !repos.containsKey(dsId)) {
            throw new IllegalArgumentException("Repository not registered: " + dsId);
        }
        this.activeDsId = dsId;
        log.info("Active repository set to dsId={}", dsId);
    }

    public OntopVirtualRepository getActive() {
        if (activeDsId == null) return null;
        return get(activeDsId);
    }

    // ── List ────────────────────────────────────────────────

    public List<Map<String, Object>> list() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (RepositoryEntry re : repos.values()) {
            Map<String, Object> info = new LinkedHashMap<>();
            info.put("ds_id", re.getDsId());
            info.put("ontology_path", re.getOntologyPath());
            info.put("mapping_path", re.getMappingPath());
            info.put("properties_path", re.getPropertiesPath());
            info.put("initialized", re.getRepository().isInitialized());
            info.put("active", re.getDsId().equals(activeDsId));
            info.put("created_at", re.getCreatedAt().toString());
            info.put("last_query_at", re.getLastQueryAt().toString());
            result.add(info);
        }
        return result;
    }

    public int size() {
        return repos.size();
    }

    // ── Restart ─────────────────────────────────────────────

    public synchronized void restart(String dsId) {
        RepositoryEntry entry = repos.get(dsId);
        if (entry == null) {
            throw new IllegalArgumentException("Repository not registered: " + dsId);
        }
        log.info("Restarting repository dsId={}...", dsId);
        register(dsId, entry.getOntologyPath(), entry.getMappingPath(), entry.getPropertiesPath());
    }

    // ── Cleanup ─────────────────────────────────────────────

    @PreDestroy
    public void shutdownAll() {
        log.info("Shutting down {} repositories...", repos.size());
        for (RepositoryEntry entry : repos.values()) {
            shutdownEntry(entry);
        }
        repos.clear();
        activeDsId = null;
    }

    // ── Internal ────────────────────────────────────────────

    private void shutdownEntry(RepositoryEntry entry) {
        try {
            entry.getRepository().shutDown();
            log.info("Shut down repository dsId={}", entry.getDsId());
        } catch (Exception e) {
            log.warn("Error shutting down repository dsId={}: {}", entry.getDsId(), e.getMessage());
        }
    }

    private OntopSQLOWLAPIConfiguration buildConfiguration(String ontologyPath,
                                                            String mappingPath,
                                                            String propertiesPath) {
        OntopSQLOWLAPIConfiguration.Builder<?> builder = OntopSQLOWLAPIConfiguration.defaultBuilder();

        if (propertiesPath != null && !propertiesPath.isEmpty() && new File(propertiesPath).exists()) {
            builder.propertyFile(propertiesPath);
        }

        if (mappingPath != null && !mappingPath.isEmpty()) {
            if (mappingPath.endsWith(".obda")) {
                builder.nativeOntopMappingFile(mappingPath);
            } else {
                builder.r2rmlMappingFile(mappingPath);
            }
        }

        if (ontologyPath != null && !ontologyPath.isEmpty() && new File(ontologyPath).exists()) {
            builder.ontologyFile(ontologyPath);
        }

        return builder.build();
    }
}
