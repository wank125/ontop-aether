package com.tianzhi.ontopengine.model;

import com.fasterxml.jackson.annotation.JsonProperty;

public class EndpointRegistration {

    private String id;
    @JsonProperty("ds_id")
    private String dsId;
    @JsonProperty("ds_name")
    private String dsName;
    @JsonProperty("active_dir")
    private String activeDir;
    @JsonProperty("ontology_path")
    private String ontologyPath;
    @JsonProperty("mapping_path")
    private String mappingPath;
    @JsonProperty("properties_path")
    private String propertiesPath;
    @JsonProperty("endpoint_url")
    private String endpointUrl;
    @JsonProperty("last_bootstrap")
    private String lastBootstrap;
    @JsonProperty("is_current")
    private boolean isCurrent;
    @JsonProperty("created_at")
    private String createdAt;
    @JsonProperty("updated_at")
    private String updatedAt;

    // Getters and setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getDsId() { return dsId; }
    public void setDsId(String dsId) { this.dsId = dsId; }
    public String getDsName() { return dsName; }
    public void setDsName(String dsName) { this.dsName = dsName; }
    public String getActiveDir() { return activeDir; }
    public void setActiveDir(String activeDir) { this.activeDir = activeDir; }
    public String getOntologyPath() { return ontologyPath; }
    public void setOntologyPath(String ontologyPath) { this.ontologyPath = ontologyPath; }
    public String getMappingPath() { return mappingPath; }
    public void setMappingPath(String mappingPath) { this.mappingPath = mappingPath; }
    public String getPropertiesPath() { return propertiesPath; }
    public void setPropertiesPath(String propertiesPath) { this.propertiesPath = propertiesPath; }
    public String getEndpointUrl() { return endpointUrl; }
    public void setEndpointUrl(String endpointUrl) { this.endpointUrl = endpointUrl; }
    public String getLastBootstrap() { return lastBootstrap; }
    public void setLastBootstrap(String lastBootstrap) { this.lastBootstrap = lastBootstrap; }
    public boolean isCurrent() { return isCurrent; }
    public void setCurrent(boolean current) { isCurrent = current; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }
}
