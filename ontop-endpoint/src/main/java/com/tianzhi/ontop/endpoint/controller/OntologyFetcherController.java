package com.tianzhi.ontop.endpoint.controller;

import it.unibz.inf.ontop.injection.OntopSQLOWLAPIConfiguration;
import com.tianzhi.ontop.endpoint.config.OntopRepositoryConfig;
import com.tianzhi.ontop.endpoint.config.RepositoryRegistry;
import org.semanticweb.owlapi.model.OWLOntology;
import org.semanticweb.owlapi.model.OWLOntologyCreationException;
import org.semanticweb.owlapi.model.OWLOntologyStorageException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Optional;

import static org.springframework.http.HttpHeaders.CONTENT_TYPE;

@RestController
public class OntologyFetcherController {

    private final OntopRepositoryConfig repositoryConfig;
    private final RepositoryRegistry registry;

    @Autowired
    public OntologyFetcherController(OntopRepositoryConfig repositoryConfig, RepositoryRegistry registry) {
        this.repositoryConfig = repositoryConfig;
        this.registry = registry;
    }

    /**
     * Download ontology from the active repository.
     */
    @RequestMapping("/ontology")
    public ResponseEntity<String> ontology() {
        return fetchOntology(repositoryConfig.getConfiguration());
    }

    /**
     * Download ontology from a specific repository by dsId.
     */
    @RequestMapping("/{dsId}/ontology")
    public ResponseEntity<String> ontologyByDsId(@PathVariable String dsId) {
        var entry = registry.getEntry(dsId);
        if (entry == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body("Repository not found: " + dsId);
        }
        return fetchOntology(entry.getConfiguration());
    }

    private ResponseEntity<String> fetchOntology(OntopSQLOWLAPIConfiguration configuration) {
        if (configuration == null) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body("No configuration available");
        }
        try {
            Optional<OWLOntology> optionalOntology = configuration.loadInputOntology();
            if (!optionalOntology.isPresent()) {
                return new ResponseEntity<>("No ontology found", HttpStatus.NOT_FOUND);
            }
            OWLOntology ontology = optionalOntology.get();
            HttpHeaders headers = new HttpHeaders();
            headers.set(CONTENT_TYPE, "text/plain;charset=UTF-8");
            OutputStream out = new ByteArrayOutputStream();
            ontology.getOWLOntologyManager().saveOntology(ontology, out);
            String output = out.toString();
            out.close();
            return new ResponseEntity<>(output, headers, HttpStatus.OK);
        } catch (OWLOntologyCreationException | OWLOntologyStorageException | IOException e) {
            return new ResponseEntity<>(e.toString(), HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}
