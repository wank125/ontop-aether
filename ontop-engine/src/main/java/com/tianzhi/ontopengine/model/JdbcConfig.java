package com.tianzhi.ontopengine.model;

import javax.validation.constraints.NotBlank;

public class JdbcConfig {

    @NotBlank
    private String jdbcUrl;

    @NotBlank
    private String user;

    @NotBlank
    private String password;

    @NotBlank
    private String driver;

    public String getJdbcUrl() {
        return jdbcUrl;
    }

    public void setJdbcUrl(String jdbcUrl) {
        this.jdbcUrl = jdbcUrl;
    }

    public String getUser() {
        return user;
    }

    public void setUser(String user) {
        this.user = user;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String getDriver() {
        return driver;
    }

    public void setDriver(String driver) {
        this.driver = driver;
    }
}
