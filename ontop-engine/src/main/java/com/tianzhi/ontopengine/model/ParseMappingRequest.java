package com.tianzhi.ontopengine.model;

import javax.validation.constraints.NotBlank;

public class ParseMappingRequest {

    @NotBlank
    private String mappingContent;

    public String getMappingContent() {
        return mappingContent;
    }

    public void setMappingContent(String mappingContent) {
        this.mappingContent = mappingContent;
    }
}
