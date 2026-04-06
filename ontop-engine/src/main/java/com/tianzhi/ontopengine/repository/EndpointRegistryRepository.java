package com.tianzhi.ontopengine.repository;

import com.tianzhi.ontopengine.model.EndpointRegistration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public class EndpointRegistryRepository {

    private final JdbcTemplate jdbc;

    public EndpointRegistryRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<EndpointRegistration> list() {
        return jdbc.query(
                "SELECT * FROM endpoint_registry ORDER BY is_current DESC, last_bootstrap DESC",
                this::mapRow);
    }

    public EndpointRegistration getByDsId(String dsId) {
        List<EndpointRegistration> results = jdbc.query(
                "SELECT * FROM endpoint_registry WHERE ds_id = ?", this::mapRow, dsId);
        return results.isEmpty() ? null : results.get(0);
    }

    public EndpointRegistration getCurrent() {
        List<EndpointRegistration> results = jdbc.query(
                "SELECT * FROM endpoint_registry WHERE is_current = 1 LIMIT 1", this::mapRow);
        return results.isEmpty() ? null : results.get(0);
    }

    @Transactional
    public EndpointRegistration register(String dsId, String dsName, String activeDir,
                                          String ontologyPath, String mappingPath,
                                          String propertiesPath, String endpointUrl,
                                          boolean setCurrent) {
        String now = LocalDateTime.now().toString();
        EndpointRegistration existing = getByDsId(dsId);

        if (existing != null) {
            jdbc.update(
                    "UPDATE endpoint_registry SET ds_name=?, active_dir=?, ontology_path=?, " +
                            "mapping_path=?, properties_path=?, endpoint_url=?, last_bootstrap=?, updated_at=? WHERE ds_id=?",
                    dsName, activeDir, ontologyPath, mappingPath, propertiesPath, endpointUrl, now, now, dsId);
        } else {
            String id = UUID.randomUUID().toString().substring(0, 12);
            jdbc.update(
                    "INSERT INTO endpoint_registry (id, ds_id, ds_name, active_dir, ontology_path, " +
                            "mapping_path, properties_path, endpoint_url, last_bootstrap, is_current, created_at) " +
                            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    id, dsId, dsName, activeDir, ontologyPath, mappingPath, propertiesPath,
                    endpointUrl, now, 0, now);
        }

        if (setCurrent) {
            setCurrent(dsId);
        }

        return getByDsId(dsId);
    }

    @Transactional
    public EndpointRegistration activate(String dsId) {
        if (getByDsId(dsId) == null) return null;
        setCurrent(dsId);
        return getByDsId(dsId);
    }

    private void setCurrent(String dsId) {
        String now = LocalDateTime.now().toString();
        jdbc.update("UPDATE endpoint_registry SET is_current = 0, updated_at = ?", now);
        jdbc.update("UPDATE endpoint_registry SET is_current = 1, updated_at = ? WHERE ds_id = ?", now, dsId);
    }

    private EndpointRegistration mapRow(java.sql.ResultSet rs, int rowNum) throws java.sql.SQLException {
        EndpointRegistration reg = new EndpointRegistration();
        reg.setId(rs.getString("id"));
        reg.setDsId(rs.getString("ds_id"));
        reg.setDsName(rs.getString("ds_name"));
        reg.setActiveDir(rs.getString("active_dir"));
        reg.setOntologyPath(rs.getString("ontology_path"));
        reg.setMappingPath(rs.getString("mapping_path"));
        reg.setPropertiesPath(rs.getString("properties_path"));
        reg.setEndpointUrl(rs.getString("endpoint_url"));
        reg.setLastBootstrap(rs.getString("last_bootstrap"));
        reg.setCurrent(rs.getInt("is_current") == 1);
        reg.setCreatedAt(rs.getString("created_at"));
        reg.setUpdatedAt(rs.getString("updated_at"));
        return reg;
    }
}
