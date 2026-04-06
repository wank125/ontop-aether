package com.tianzhi.ontop.endpoint.config;

import it.unibz.inf.ontop.injection.OntopSQLOWLAPIConfiguration;
import it.unibz.inf.ontop.rdf4j.repository.OntopRepository;
import it.unibz.inf.ontop.rdf4j.repository.impl.OntopVirtualRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.annotation.PreDestroy;
import java.io.File;
import java.io.IOException;
import java.nio.file.*;

@Configuration
public class OntopRepositoryConfig {

    private static final Logger log = LoggerFactory.getLogger(OntopRepositoryConfig.class);

    @Value("${ontop.mapping}")
    private String mappingFile;

    @Value("${ontop.ontology:}")
    private String ontologyFile;

    @Value("${ontop.properties:}")
    private String propertiesFile;

    @Value("${ontop.seed-dir:}")
    private String seedDir;

    @Value("${ontop.dev:false}")
    private boolean devMode;

    private volatile OntopVirtualRepository repository;
    private volatile OntopSQLOWLAPIConfiguration configuration;

    @Bean
    public OntopVirtualRepository ontopRepository() {
        initSeedFiles();
        this.configuration = buildConfiguration();
        this.repository = OntopRepository.defaultRepository(configuration);
        this.repository.init();
        log.info("Ontop repository initialized: mapping={}, ontology={}, properties={}",
                mappingFile, ontologyFile, propertiesFile);
        return this.repository;
    }

    @Bean
    public OntopSQLOWLAPIConfiguration ontopConfiguration() {
        return this.configuration;
    }

    public synchronized void restart() {
        log.info("Restarting Ontop repository...");
        if (this.repository != null) {
            try {
                this.repository.shutDown();
            } catch (Exception e) {
                log.warn("Error shutting down repository: {}", e.getMessage());
            }
        }
        this.configuration = buildConfiguration();
        this.repository = OntopRepository.defaultRepository(configuration);
        this.repository.init();
        log.info("Ontop repository restarted successfully");
    }

    private OntopSQLOWLAPIConfiguration buildConfiguration() {
        OntopSQLOWLAPIConfiguration.Builder<?> builder = OntopSQLOWLAPIConfiguration.defaultBuilder();

        if (propertiesFile != null && !propertiesFile.isEmpty() && new File(propertiesFile).exists()) {
            builder.propertyFile(propertiesFile);
        }

        if (mappingFile != null && !mappingFile.isEmpty()) {
            if (mappingFile.endsWith(".obda")) {
                builder.nativeOntopMappingFile(mappingFile);
            } else {
                builder.r2rmlMappingFile(mappingFile);
            }
        }

        if (ontologyFile != null && !ontologyFile.isEmpty() && new File(ontologyFile).exists()) {
            builder.ontologyFile(ontologyFile);
        }

        return builder.build();
    }

    private void initSeedFiles() {
        if (seedDir == null || seedDir.isEmpty()) return;

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

    @PreDestroy
    public void cleanup() {
        if (this.repository != null) {
            try {
                this.repository.shutDown();
            } catch (Exception e) {
                log.warn("Error shutting down repository: {}", e.getMessage());
            }
        }
    }
}
