package com.tianzhi.ontop.endpoint.controller;

import it.unibz.inf.ontop.injection.OntopSQLOWLAPIConfiguration;
import com.tianzhi.ontop.endpoint.config.OntopRepositoryConfig;
import org.semanticweb.owlapi.model.OWLOntology;
import org.semanticweb.owlapi.model.OWLOntologyCreationException;
import org.semanticweb.owlapi.model.OWLOntologyStorageException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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

    @Autowired
    public OntologyFetcherController(OntopRepositoryConfig repositoryConfig) {
        this.repositoryConfig = repositoryConfig;
    }

    @RequestMapping("/ontology")
    public ResponseEntity<String> ontology() {
        try {
            OntopSQLOWLAPIConfiguration configuration = repositoryConfig.getConfiguration();
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
