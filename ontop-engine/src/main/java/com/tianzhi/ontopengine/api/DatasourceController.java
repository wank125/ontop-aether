package com.tianzhi.ontopengine.api;

import com.tianzhi.ontopengine.model.Datasource;
import com.tianzhi.ontopengine.model.DatasourceCreateRequest;
import com.tianzhi.ontopengine.model.DatasourceUpdateRequest;
import com.tianzhi.ontopengine.repository.DatasourceRepository;
import com.tianzhi.ontopengine.service.DatasourceService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/datasources")
public class DatasourceController {

    private final DatasourceRepository repo;
    private final DatasourceService service;

    public DatasourceController(DatasourceRepository repo, DatasourceService service) {
        this.repo = repo;
        this.service = service;
    }

    @GetMapping
    public List<Datasource> list() {
        return repo.list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Datasource create(@RequestBody DatasourceCreateRequest req) {
        return repo.create(req.getName(), req.getJdbcUrl(), req.getUser(), req.getPassword(), req.getDriver());
    }

    @GetMapping("/{dsId}")
    public ResponseEntity<Datasource> get(@PathVariable String dsId) {
        Datasource ds = repo.get(dsId);
        if (ds == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(ds);
    }

    @PutMapping("/{dsId}")
    public ResponseEntity<Datasource> update(@PathVariable String dsId, @RequestBody DatasourceUpdateRequest req) {
        Map<String, Object> updates = new HashMap<>();
        if (req.getName() != null) updates.put("name", req.getName());
        if (req.getJdbcUrl() != null) updates.put("jdbc_url", req.getJdbcUrl());
        if (req.getUser() != null) updates.put("user", req.getUser());
        if (req.getPassword() != null) updates.put("password", req.getPassword());
        if (req.getDriver() != null) updates.put("driver", req.getDriver());

        Datasource ds = repo.update(dsId, updates);
        if (ds == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(ds);
    }

    @DeleteMapping("/{dsId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String dsId) {
        repo.delete(dsId);
    }

    @PostMapping("/{dsId}/test")
    public ResponseEntity<Map<String, Object>> testConnection(@PathVariable String dsId) {
        Datasource ds = repo.get(dsId);
        if (ds == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(service.testConnection(ds));
    }

    @GetMapping("/{dsId}/schemas")
    public ResponseEntity<Map<String, Object>> listSchemas(@PathVariable String dsId) {
        Datasource ds = repo.get(dsId);
        if (ds == null) return ResponseEntity.notFound().build();
        try {
            List<String> schemas = service.listSchemas(ds);
            Map<String, Object> result = new HashMap<>();
            result.put("schemas", schemas);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/{dsId}/schema")
    public ResponseEntity<Map<String, Object>> getSchema(
            @PathVariable String dsId,
            @RequestParam(required = false) String schema_filter) {
        Datasource ds = repo.get(dsId);
        if (ds == null) return ResponseEntity.notFound().build();
        try {
            return ResponseEntity.ok(service.getSchema(ds, schema_filter));
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }
}
