package com.tianzhi.ontopengine.repository;

import com.tianzhi.ontopengine.model.Datasource;
import com.tianzhi.ontopengine.service.EncryptionService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Repository
public class DatasourceRepository {

    private final JdbcTemplate jdbc;
    private final EncryptionService encryption;

    public DatasourceRepository(JdbcTemplate jdbc, EncryptionService encryption) {
        this.jdbc = jdbc;
        this.encryption = encryption;
    }

    public List<Datasource> list() {
        return jdbc.query("SELECT * FROM datasources ORDER BY created_at", (rs, rowNum) -> {
            Datasource ds = new Datasource();
            ds.setId(rs.getString("id"));
            ds.setName(rs.getString("name"));
            ds.setJdbcUrl(rs.getString("jdbc_url"));
            ds.setUser(rs.getString("user"));
            ds.setPassword(encryption.decrypt(rs.getString("password_encrypted")));
            ds.setDriver(rs.getString("driver"));
            ds.setCreatedAt(rs.getString("created_at"));
            ds.setUpdatedAt(rs.getString("updated_at"));
            return ds;
        });
    }

    public Datasource get(String dsId) {
        List<Datasource> results = jdbc.query(
                "SELECT * FROM datasources WHERE id = ?",
                (rs, rowNum) -> {
                    Datasource ds = new Datasource();
                    ds.setId(rs.getString("id"));
                    ds.setName(rs.getString("name"));
                    ds.setJdbcUrl(rs.getString("jdbc_url"));
                    ds.setUser(rs.getString("user"));
                    ds.setPassword(encryption.decrypt(rs.getString("password_encrypted")));
                    ds.setDriver(rs.getString("driver"));
                    ds.setCreatedAt(rs.getString("created_at"));
                    ds.setUpdatedAt(rs.getString("updated_at"));
                    return ds;
                }, dsId);
        return results.isEmpty() ? null : results.get(0);
    }

    public Datasource create(String name, String jdbcUrl, String user, String password, String driver) {
        String id = UUID.randomUUID().toString().substring(0, 8);
        String now = LocalDateTime.now().toString();
        jdbc.update(
                "INSERT INTO datasources (id, name, jdbc_url, \"user\", password_encrypted, driver, created_at) " +
                        "VALUES (?, ?, ?, ?, ?, ?, ?)",
                id, name, jdbcUrl, user, encryption.encrypt(password), driver, now);
        Datasource ds = new Datasource();
        ds.setId(id);
        ds.setName(name);
        ds.setJdbcUrl(jdbcUrl);
        ds.setUser(user);
        ds.setPassword(password);
        ds.setDriver(driver);
        ds.setCreatedAt(now);
        return ds;
    }

    public Datasource update(String dsId, Map<String, Object> updates) {
        Datasource existing = get(dsId);
        if (existing == null) return null;

        List<String> fields = new ArrayList<>();
        List<Object> values = new ArrayList<>();

        for (Map.Entry<String, Object> entry : updates.entrySet()) {
            String k = entry.getKey();
            Object v = entry.getValue();
            if ("id".equals(k) || "created_at".equals(k) || "updated_at".equals(k)) continue;

            if ("password".equals(k)) {
                fields.add("password_encrypted = ?");
                values.add(encryption.encrypt((String) v));
            } else if ("jdbc_url".equals(k)) {
                fields.add("jdbc_url = ?");
                values.add(v);
            } else if ("user".equals(k)) {
                fields.add("\"user\" = ?");
                values.add(v);
            } else {
                fields.add(k + " = ?");
                values.add(v);
            }
        }

        if (!fields.isEmpty()) {
            fields.add("updated_at = ?");
            values.add(LocalDateTime.now().toString());
            values.add(dsId);
            jdbc.update("UPDATE datasources SET " + String.join(", ", fields) + " WHERE id = ?", values.toArray());
        }

        return get(dsId);
    }

    public boolean delete(String dsId) {
        return jdbc.update("DELETE FROM datasources WHERE id = ?", dsId) > 0;
    }
}
