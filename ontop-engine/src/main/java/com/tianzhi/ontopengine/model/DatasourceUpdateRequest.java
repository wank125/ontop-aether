package com.tianzhi.ontopengine.model;

import com.fasterxml.jackson.annotation.JsonProperty;

public class DatasourceUpdateRequest {

    private String name;
    @JsonProperty("jdbc_url")
    private String jdbcUrl;
    private String user;
    private String password;
    private String driver;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getJdbcUrl() { return jdbcUrl; }
    public void setJdbcUrl(String jdbcUrl) { this.jdbcUrl = jdbcUrl; }

    public String getUser() { return user; }
    public void setUser(String user) { this.user = user; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public String getDriver() { return driver; }
    public void setDriver(String driver) { this.driver = driver; }
}
