package com.tianzhi.ontop.endpoint.config;

import it.unibz.inf.ontop.injection.OntopSQLOWLAPIConfiguration;
import it.unibz.inf.ontop.rdf4j.repository.impl.OntopVirtualRepository;

import java.time.Instant;

/**
 * Holds a single Ontop Repository instance together with its configuration and metadata.
 */
public class RepositoryEntry {

    private final String dsId;
    private final String ontologyPath;
    private final String mappingPath;
    private final String propertiesPath;
    private final OntopSQLOWLAPIConfiguration configuration;
    private final OntopVirtualRepository repository;
    private final Instant createdAt;
    private volatile Instant lastQueryAt;

    public RepositoryEntry(String dsId, String ontologyPath, String mappingPath,
                           String propertiesPath, OntopSQLOWLAPIConfiguration configuration,
                           OntopVirtualRepository repository) {
        this.dsId = dsId;
        this.ontologyPath = ontologyPath;
        this.mappingPath = mappingPath;
        this.propertiesPath = propertiesPath;
        this.configuration = configuration;
        this.repository = repository;
        this.createdAt = Instant.now();
        this.lastQueryAt = this.createdAt;
    }

    public String getDsId() { return dsId; }
    public String getOntologyPath() { return ontologyPath; }
    public String getMappingPath() { return mappingPath; }
    public String getPropertiesPath() { return propertiesPath; }
    public OntopSQLOWLAPIConfiguration getConfiguration() { return configuration; }
    public OntopVirtualRepository getRepository() { return repository; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getLastQueryAt() { return lastQueryAt; }

    public void touchQueryTime() {
        this.lastQueryAt = Instant.now();
    }
}
