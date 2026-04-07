package com.tianzhi.ontopengine.model;

public class SparqlQueryRequest {
    private String query;
    private String format = "json";
    private String dsId; // optional: target data source ID, null = use active

    public String getQuery() { return query; }
    public void setQuery(String query) { this.query = query; }

    public String getFormat() { return format; }
    public void setFormat(String format) { this.format = format; }

    public String getDsId() { return dsId; }
    public void setDsId(String dsId) { this.dsId = dsId; }
}
