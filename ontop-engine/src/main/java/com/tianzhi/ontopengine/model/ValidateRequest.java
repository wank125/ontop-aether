package com.tianzhi.ontopengine.model;

import javax.validation.Valid;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

public class ValidateRequest {

    @NotBlank
    private String mappingContent;

    @NotBlank
    private String ontologyContent;

    @Valid
    @NotNull
    private JdbcConfig jdbc;

    public String getMappingContent() {
        return mappingContent;
    }

    public void setMappingContent(String mappingContent) {
        this.mappingContent = mappingContent;
    }

    public String getOntologyContent() {
        return ontologyContent;
    }

    public void setOntologyContent(String ontologyContent) {
        this.ontologyContent = ontologyContent;
    }

    public JdbcConfig getJdbc() {
        return jdbc;
    }

    public void setJdbc(JdbcConfig jdbc) {
        this.jdbc = jdbc;
    }
}
