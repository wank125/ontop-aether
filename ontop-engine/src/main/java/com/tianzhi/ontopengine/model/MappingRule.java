package com.tianzhi.ontopengine.model;

import com.fasterxml.jackson.annotation.JsonProperty;

public class MappingRule {

    @JsonProperty("mapping_id")
    private String mappingId;
    private String target;
    private String source;

    public String getMappingId() { return mappingId; }
    public void setMappingId(String mappingId) { this.mappingId = mappingId; }

    public String getTarget() { return target; }
    public void setTarget(String target) { this.target = target; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
}
