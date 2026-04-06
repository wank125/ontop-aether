package com.tianzhi.ontopengine.model;

import com.fasterxml.jackson.annotation.JsonProperty;

public class MappingFile {

    private String path;
    private String filename;
    @JsonProperty("modified_at")
    private long modifiedAt;

    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }

    public String getFilename() { return filename; }
    public void setFilename(String filename) { this.filename = filename; }

    public long getModifiedAt() { return modifiedAt; }
    public void setModifiedAt(long modifiedAt) { this.modifiedAt = modifiedAt; }
}
