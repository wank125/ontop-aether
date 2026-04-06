package com.tianzhi.ontop.endpoint.controller;

import com.google.common.collect.ImmutableMultimap;
import it.unibz.inf.ontop.exception.OntopConnectionException;
import it.unibz.inf.ontop.exception.OntopReformulationException;
import it.unibz.inf.ontop.rdf4j.repository.OntopRepositoryConnection;
import it.unibz.inf.ontop.rdf4j.repository.impl.OntopVirtualRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.Collections;

import static org.springframework.http.HttpHeaders.CONTENT_TYPE;

@RestController
public class ReformulateController {

    private final OntopVirtualRepository repository;

    @Autowired
    public ReformulateController(OntopVirtualRepository repository) {
        this.repository = repository;
    }

    @RequestMapping(value = "/ontop/reformulate")
    @ResponseBody
    public ResponseEntity<String> reformulate(@RequestParam("query") String query,
                                              HttpServletRequest request)
            throws OntopConnectionException, OntopReformulationException {

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
