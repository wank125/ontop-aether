package com.tianzhi.ontop.endpoint.controller;

import com.google.common.collect.ImmutableMultimap;
import it.unibz.inf.ontop.endpoint.processor.SparqlQueryExecutor;
import it.unibz.inf.ontop.rdf4j.repository.OntopRepository;
import it.unibz.inf.ontop.rdf4j.repository.OntopRepositoryConnection;
import it.unibz.inf.ontop.rdf4j.repository.impl.OntopVirtualRepository;
import org.eclipse.rdf4j.query.*;
import org.eclipse.rdf4j.query.resultio.BooleanQueryResultWriter;
import org.eclipse.rdf4j.query.resultio.TupleQueryResultWriter;
import org.eclipse.rdf4j.query.resultio.sparqljson.SPARQLBooleanJSONWriter;
import org.eclipse.rdf4j.query.resultio.sparqljson.SPARQLResultsJSONWriter;
import org.eclipse.rdf4j.query.resultio.sparqlxml.SPARQLBooleanXMLWriter;
import org.eclipse.rdf4j.query.resultio.sparqlxml.SPARQLResultsXMLWriter;
import org.eclipse.rdf4j.query.resultio.text.BooleanTextWriter;
import org.eclipse.rdf4j.query.resultio.text.csv.SPARQLResultsCSVWriter;
import org.eclipse.rdf4j.query.resultio.text.tsv.SPARQLResultsTSVWriter;
import org.eclipse.rdf4j.rio.RDFFormat;
import org.eclipse.rdf4j.rio.RDFWriter;
import org.eclipse.rdf4j.rio.jsonld.JSONLDWriter;
import org.eclipse.rdf4j.rio.nquads.NQuadsWriter;
import org.eclipse.rdf4j.rio.ntriples.NTriplesWriter;
import org.eclipse.rdf4j.rio.rdfjson.RDFJSONWriter;
import org.eclipse.rdf4j.rio.rdfxml.RDFXMLWriter;
import org.eclipse.rdf4j.rio.turtle.TurtleWriter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Collections;

import static org.springframework.http.HttpHeaders.ACCEPT;
import static org.springframework.http.HttpHeaders.CONTENT_TYPE;
import static org.springframework.http.MediaType.APPLICATION_FORM_URLENCODED_VALUE;

@RestController
public class SparqlController {

    private static final Logger log = LoggerFactory.getLogger(SparqlController.class);
    private final OntopVirtualRepository repository;

    @Autowired
    public SparqlController(OntopVirtualRepository repository) {
        this.repository = repository;
    }

    @RequestMapping(value = "/sparql", method = RequestMethod.GET)
    public void queryGet(
            @RequestHeader(ACCEPT) String accept,
            @RequestParam("query") String query,
            @RequestParam(value = "default-graph-uri", required = false) String[] defaultGraphUri,
            @RequestParam(value = "named-graph-uri", required = false) String[] namedGraphUri,
            HttpServletRequest request, HttpServletResponse response) throws IOException {
        executeQuery(accept, query, request, response);
    }

    @RequestMapping(value = "/sparql", method = RequestMethod.POST,
            consumes = APPLICATION_FORM_URLENCODED_VALUE)
    public void queryPostForm(
            @RequestHeader(ACCEPT) String accept,
            @RequestParam("query") String query,
            @RequestParam(value = "default-graph-uri", required = false) String[] defaultGraphUri,
            @RequestParam(value = "named-graph-uri", required = false) String[] namedGraphUri,
            HttpServletRequest request, HttpServletResponse response) throws IOException {
        executeQuery(accept, query, request, response);
    }

    @RequestMapping(value = "/sparql", method = RequestMethod.POST,
            consumes = "application/sparql-query")
    public void queryPostDirect(
            @RequestHeader(ACCEPT) String accept,
            @RequestBody String query,
            @RequestParam(value = "default-graph-uri", required = false) String[] defaultGraphUri,
            @RequestParam(value = "named-graph-uri", required = false) String[] namedGraphUri,
            HttpServletRequest request, HttpServletResponse response) throws IOException {
        executeQuery(accept, query, request, response);
    }

    private void executeQuery(String accept, String query,
                              HttpServletRequest request, HttpServletResponse response) throws IOException {
        ImmutableMultimap<String, String> httpHeaders = extractHttpHeaders(request);

        try (OntopRepositoryConnection connection = repository.getConnection()) {
            Query q = connection.prepareQuery(QueryLanguage.SPARQL, query, httpHeaders);
            OutputStream out = response.getOutputStream();

            if (q instanceof TupleQuery) {
                handleTupleQuery((TupleQuery) q, accept, out, response);
            } else if (q instanceof BooleanQuery) {
                handleBooleanQuery((BooleanQuery) q, accept, out, response);
            } else if (q instanceof GraphQuery) {
                handleGraphQuery((GraphQuery) q, accept, out, response);
            } else if (q instanceof Update) {
                response.setStatus(HttpStatus.NOT_IMPLEMENTED.value());
            } else {
                response.setStatus(HttpStatus.BAD_REQUEST.value());
            }
            out.flush();
        }
    }

    private void handleTupleQuery(TupleQuery query, String accept, OutputStream out,
                                  HttpServletResponse response) {
        response.setCharacterEncoding("UTF-8");
        addCacheHeaders(response);

        if ("*/*".equals(accept) || accept.contains("json")) {
            response.setHeader(CONTENT_TYPE, "application/sparql-results+json;charset=UTF-8");
            query.evaluate(new SPARQLResultsJSONWriter(out));
        } else if (accept.contains("xml")) {
            response.setHeader(CONTENT_TYPE, "application/sparql-results+xml;charset=UTF-8");
            query.evaluate(new SPARQLResultsXMLWriter(out));
        } else if (accept.contains("csv")) {
            response.setHeader(CONTENT_TYPE, "text/csv;charset=UTF-8");
            query.evaluate(new SPARQLResultsCSVWriter(out));
        } else if (accept.contains("tsv") || accept.contains("text/tab-separated-values")) {
            response.setHeader(CONTENT_TYPE, "text/tab-separated-values;charset=UTF-8");
            query.evaluate(new SPARQLResultsTSVWriter(out));
        } else {
            response.setStatus(HttpStatus.NOT_ACCEPTABLE.value());
        }
    }

    private void handleBooleanQuery(BooleanQuery query, String accept, OutputStream out,
                                    HttpServletResponse response) throws IOException {
        boolean result = query.evaluate();
        addCacheHeaders(response);

        if ("*/*".equals(accept) || accept.contains("json")) {
            response.setHeader(CONTENT_TYPE, "application/sparql-results+json");
            new SPARQLBooleanJSONWriter(out).handleBoolean(result);
        } else if (accept.contains("xml")) {
            response.setHeader(CONTENT_TYPE, "application/sparql-results+xml");
            new SPARQLBooleanXMLWriter(out).handleBoolean(result);
        } else if (accept.contains("text")) {
            response.setHeader(CONTENT_TYPE, "text/boolean");
            new BooleanTextWriter(out).handleBoolean(result);
        } else {
            response.setStatus(HttpStatus.NOT_ACCEPTABLE.value());
        }
    }

    private void handleGraphQuery(GraphQuery query, String accept, OutputStream out,
                                  HttpServletResponse response) {
        response.setCharacterEncoding("UTF-8");
        addCacheHeaders(response);

        if ("*/*".equals(accept) || accept.contains("turtle")) {
            response.setHeader(CONTENT_TYPE, "text/turtle;charset=UTF-8");
            query.evaluate(new TurtleWriter(out));
        } else if (accept.contains("rdf+json")) {
            response.setHeader(CONTENT_TYPE, "application/rdf+json;charset=UTF-8");
            query.evaluate(new RDFJSONWriter(out, RDFFormat.RDFJSON));
        } else if (accept.contains("json")) {
            response.setHeader(CONTENT_TYPE, "application/ld+json;charset=UTF-8");
            query.evaluate(new JSONLDWriter(out));
        } else if (accept.contains("xml")) {
            response.setHeader(CONTENT_TYPE, "application/rdf+xml;charset=UTF-8");
            query.evaluate(new RDFXMLWriter(out));
        } else if (accept.contains("n-triples")) {
            response.setHeader(CONTENT_TYPE, "application/n-triples;charset=UTF-8");
            query.evaluate(new NTriplesWriter(out));
        } else if (accept.contains("n-quads")) {
            response.setHeader(CONTENT_TYPE, "application/n-quads;charset=UTF-8");
            query.evaluate(new NQuadsWriter(out));
        } else {
            response.setStatus(HttpStatus.NOT_ACCEPTABLE.value());
        }
    }

    private void addCacheHeaders(HttpServletResponse response) {
        repository.getHttpCacheHeaders().getMap().forEach(response::setHeader);
    }

    private static ImmutableMultimap<String, String> extractHttpHeaders(HttpServletRequest request) {
        ImmutableMultimap.Builder<String, String> builder = ImmutableMultimap.builder();
        Collections.list(request.getHeaderNames()).forEach(
                name -> Collections.list(request.getHeaders(name)).forEach(
                        value -> builder.put(name, value)));
        return builder.build();
    }

    @ExceptionHandler(MalformedQueryException.class)
    public ResponseEntity<String> handleMalformedQuery(Exception ex) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(CONTENT_TYPE, "text/plain; charset=UTF-8");
        return new ResponseEntity<>(ex.getMessage(), headers, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<String> handleException(Exception ex) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(CONTENT_TYPE, "text/plain; charset=UTF-8");
        headers.set("Cache-Control", "no-store");
        return new ResponseEntity<>(ex.getMessage(), headers, HttpStatus.INTERNAL_SERVER_ERROR);
    }
}
