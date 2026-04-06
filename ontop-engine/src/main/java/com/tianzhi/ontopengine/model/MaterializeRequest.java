package com.tianzhi.ontopengine.model;

import javax.validation.Valid;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

public class MaterializeRequest {

    @NotBlank
    private String mappingContent;

    @NotBlank
    private String ontologyContent;

    @Valid
    @NotNull
    private JdbcConfig jdbc;

    /** Output format: "turtle" (default) or "ntriples". */
    private String format = "turtle";

    /** Optional SPARQL CONSTRUCT query to limit materialization scope.
     *  When null, full materialization is performed. */
    private String sparqlQuery;

    public String getMappingContent() { return mappingContent; }
    public void setMappingContent(String mappingContent) { this.mappingContent = mappingContent; }

    public String getOntologyContent() { return ontologyContent; }
    public void setOntologyContent(String ontologyContent) { this.ontologyContent = ontologyContent; }

    public JdbcConfig getJdbc() { return jdbc; }
    public void setJdbc(JdbcConfig jdbc) { this.jdbc = jdbc; }

    public String getFormat() { return format; }
    public void setFormat(String format) { this.format = format; }

    public String getSparqlQuery() { return sparqlQuery; }
    public void setSparqlQuery(String sparqlQuery) { this.sparqlQuery = sparqlQuery; }
}
