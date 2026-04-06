package com.tianzhi.ontopengine.model;

import javax.validation.Valid;
import javax.validation.constraints.NotNull;

public class ExtractMetadataRequest {

    @Valid
    @NotNull
    private JdbcConfig jdbc;

    public JdbcConfig getJdbc() {
        return jdbc;
    }

    public void setJdbc(JdbcConfig jdbc) {
        this.jdbc = jdbc;
    }
}
