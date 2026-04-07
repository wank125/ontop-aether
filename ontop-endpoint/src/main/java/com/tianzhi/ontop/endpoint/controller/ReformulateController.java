package com.tianzhi.ontop.endpoint.controller;

import com.google.common.collect.ImmutableMultimap;
import it.unibz.inf.ontop.exception.OntopConnectionException;
import it.unibz.inf.ontop.exception.OntopReformulationException;
import it.unibz.inf.ontop.rdf4j.repository.OntopRepositoryConnection;
import it.unibz.inf.ontop.rdf4j.repository.impl.OntopVirtualRepository;
import com.tianzhi.ontop.endpoint.config.OntopRepositoryConfig;
import com.tianzhi.ontop.endpoint.config.RepositoryRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.util.Collections;

import static org.springframework.http.HttpHeaders.CONTENT_TYPE;

@RestController
public class ReformulateController {

    private static final Logger log = LoggerFactory.getLogger(ReformulateController.class);

    private final OntopRepositoryConfig repositoryConfig;
    private final RepositoryRegistry registry;

    @Autowired
    public ReformulateController(OntopRepositoryConfig repositoryConfig, RepositoryRegistry registry) {
        this.repositoryConfig = repositoryConfig;
        this.registry = registry;
    }

    /**
     * Reformulate using the active repository (legacy).
     */
    @RequestMapping(value = "/ontop/reformulate")
    public ResponseEntity<String> reformulate(@RequestParam("query") String query,
                                              HttpServletRequest request)
            throws OntopConnectionException, OntopReformulationException {
        return doReformulate(null, query, request);
    }

    /**
     * Reformulate using a specific repository by dsId.
     */
    @RequestMapping(value = "/{dsId}/ontop/reformulate")
    public ResponseEntity<String> reformulateByDsId(@PathVariable String dsId,
                                                     @RequestParam("query") String query,
                                                     HttpServletRequest request)
            throws OntopConnectionException, OntopReformulationException {
        return doReformulate(dsId, query, request);
    }

    private ResponseEntity<String> doReformulate(String dsId, String query, HttpServletRequest request)
            throws OntopConnectionException, OntopReformulationException {

        OntopVirtualRepository repository = dsId != null
                ? registry.get(dsId)
                : repositoryConfig.getRepository();

        if (repository == null) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body("No repository available" + (dsId != null ? " for dsId=" + dsId : ""));
        }

        ImmutableMultimap<String, String> inputHeaders = extractHttpHeaders(request);

        try (OntopRepositoryConnection connection = repository.getConnection()) {
            String reformulation = connection.reformulate(query, inputHeaders);

            HttpHeaders headers = new HttpHeaders();
            headers.set(CONTENT_TYPE, "text/plain; charset=UTF-8");
            return new ResponseEntity<>(reformulation, headers, HttpStatus.OK);
        }
    }

    private static ImmutableMultimap<String, String> extractHttpHeaders(HttpServletRequest request) {
        ImmutableMultimap.Builder<String, String> builder = ImmutableMultimap.builder();
        Collections.list(request.getHeaderNames()).forEach(
                name -> Collections.list(request.getHeaders(name)).forEach(
                        value -> builder.put(name, value)));
        return builder.build();
    }
}
