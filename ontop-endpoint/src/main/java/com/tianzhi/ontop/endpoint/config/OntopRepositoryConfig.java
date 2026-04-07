package com.tianzhi.ontop.endpoint.config;

import it.unibz.inf.ontop.injection.OntopSQLOWLAPIConfiguration;
import it.unibz.inf.ontop.rdf4j.repository.impl.OntopVirtualRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.nio.file.*;
import java.util.stream.Stream;

/**
 * Initializes the Repository registry and auto-loads repositories on startup.
 *
 * Backward-compatible: getRepository() returns the currently active repository,
 * so existing controllers (SparqlController, HealthController, etc.) keep working.
 */
@Configuration
public class OntopRepositoryConfig {

    private static final Logger log = LoggerFactory.getLogger(OntopRepositoryConfig.class);

    @Value("${ontop.mapping:}")
    private String mappingFile;

    @Value("${ontop.ontology:}")
    private String ontologyFile;

    @Value("${ontop.properties:}")
    private String propertiesFile;

    @Value("${ontop.seed-dir:}")
    private String seedDir;

    @Value("${ontop.repos-dir:}")
    private String reposDir;

    @Value("${ontop.active-ds-id:}")
    private String configuredActiveDsId;

    private RepositoryRegistry registry;

    /**
     * Returns the currently active repository (backward-compatible).
     */
    public OntopVirtualRepository getRepository() {
        return registry != null ? registry.getActive() : null;
    }

    /**
     * Returns the configuration of the currently active repository.
     */
    public OntopSQLOWLAPIConfiguration getConfiguration() {
        RepositoryEntry entry = registry != null ? registry.getEntry(registry.getActiveDsId()) : null;
        return entry != null ? entry.getConfiguration() : null;
    }

    /**
     * Restart the active repository (backward-compatible).
     */
    public synchronized void restart() {
        String dsId = registry.getActiveDsId();
        if (dsId != null) {
            registry.restart(dsId);
            log.info("Restarted active repository dsId={}", dsId);
        } else {
            log.warn("No active repository to restart");
        }
    }

    @Bean
    public RepositoryRegistry repositoryRegistry() {
        this.registry = new RepositoryRegistry();

        // Seed files for legacy mode
        initSeedFiles();

        // Mode 1: Multi-repo auto-load from repos-dir
        if (reposDir != null && !reposDir.isEmpty()) {
            autoLoadFromReposDir();
        }

        // Mode 2: Legacy single-file mode (fallback)
        if (registry.size() == 0 && mappingFile != null && !mappingFile.isEmpty()) {
            registerLegacyDefault();
        }

        // Set active dsId if configured
        if (configuredActiveDsId != null && !configuredActiveDsId.isEmpty()) {
            try {
                registry.setActiveDsId(configuredActiveDsId);
            } catch (IllegalArgumentException e) {
                log.warn("Configured active-ds-id '{}' not found in registered repositories", configuredActiveDsId);
            }
        }

        log.info("Repository registry initialized with {} repositories, active={}",
                registry.size(), registry.getActiveDsId());
        return registry;
    }

    // ── Auto-load ───────────────────────────────────────────

    private void autoLoadFromReposDir() {
        Path dir = Path.of(reposDir);
        if (!Files.isDirectory(dir)) {
            log.info("Repos directory {} does not exist, skipping auto-load", reposDir);
            return;
        }

        try (Stream<Path> children = Files.list(dir)) {
            children.filter(Files::isDirectory).forEach(dsDir -> {
                String dsId = dsDir.getFileName().toString();
                Path onto = findFile(dsDir, "ontology.ttl", "active_ontology.ttl");
                Path map = findFile(dsDir, "mapping.obda", "active_mapping.obda");
                Path props = findFile(dsDir, "properties", "active.properties");

                if (map != null) {
                    try {
                        registry.register(dsId,
                                onto != null ? onto.toString() : null,
                                map.toString(),
                                props != null ? props.toString() : null);
                        log.info("Auto-loaded repository: dsId={}, dir={}", dsId, dsDir);
                    } catch (Exception e) {
                        log.warn("Failed to auto-load repository from {}: {}", dsDir, e.getMessage());
                    }
                }
            });
        } catch (IOException e) {
            log.warn("Failed to scan repos directory {}: {}", reposDir, e.getMessage());
        }
    }

    private Path findFile(Path dir, String... names) {
        for (String name : names) {
            Path p = dir.resolve(name);
            if (Files.exists(p)) return p;
        }
        return null;
    }

    private void registerLegacyDefault() {
        try {
            registry.register("default",
                    (ontologyFile != null && !ontologyFile.isEmpty()) ? ontologyFile : null,
                    mappingFile,
                    (propertiesFile != null && !propertiesFile.isEmpty()) ? propertiesFile : null);
            log.info("Registered legacy default repository: mapping={}, ontology={}, properties={}",
                    mappingFile, ontologyFile, propertiesFile);
        } catch (Exception e) {
            log.error("Failed to register legacy default repository: {}", e.getMessage());
        }
    }

    // ── Seed files ──────────────────────────────────────────

    private void initSeedFiles() {
        if (seedDir == null || seedDir.isEmpty()) return;
        if (mappingFile == null || mappingFile.isEmpty()) return;

        Path seedPath = Paths.get(seedDir);
        if (!Files.isDirectory(seedPath)) return;

        copyIfMissing(seedPath.resolve("active_ontology.ttl"), Paths.get(ontologyFile));
        copyIfMissing(seedPath.resolve("active_mapping.obda"), Paths.get(mappingFile));
        copyIfMissing(seedPath.resolve("active.properties"), Paths.get(propertiesFile));
    }

    private void copyIfMissing(Path source, Path target) {
        if (source == null || target == null) return;
        if (!Files.exists(source)) return;
        if (Files.exists(target)) return;
        try {
            Files.createDirectories(target.getParent());
            Files.copy(source, target);
            log.info("Seeded {} from {}", target, source);
        } catch (IOException e) {
            log.warn("Failed to seed {}: {}", target, e.getMessage());
        }
    }
}
