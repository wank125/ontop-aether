package com.tianzhi.ontopengine.model;

import com.fasterxml.jackson.annotation.JsonProperty;

public class QueryHistoryEntry {

    private String id;
    private String query;
    private String timestamp;
    @JsonProperty("result_count")
    private Integer resultCount;
    @JsonProperty("source_ip")
    private String sourceIp;
    private String caller;
    @JsonProperty("duration_ms")
    private Double durationMs;
    private String status;
    @JsonProperty("error_message")
    private String errorMessage;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getQuery() { return query; }
    public void setQuery(String query) { this.query = query; }
    public String getTimestamp() { return timestamp; }
    public void setTimestamp(String timestamp) { this.timestamp = timestamp; }
    public Integer getResultCount() { return resultCount; }
    public void setResultCount(Integer resultCount) { this.resultCount = resultCount; }
    public String getSourceIp() { return sourceIp; }
    public void setSourceIp(String sourceIp) { this.sourceIp = sourceIp; }
    public String getCaller() { return caller; }
    public void setCaller(String caller) { this.caller = caller; }
    public Double getDurationMs() { return durationMs; }
    public void setDurationMs(Double durationMs) { this.durationMs = durationMs; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
}
