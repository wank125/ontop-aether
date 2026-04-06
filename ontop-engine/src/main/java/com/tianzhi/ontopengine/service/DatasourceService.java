package com.tianzhi.ontopengine.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tianzhi.ontopengine.model.Datasource;
import com.tianzhi.ontopengine.model.ExtractMetadataRequest;
import com.tianzhi.ontopengine.model.ExtractMetadataResponse;
import com.tianzhi.ontopengine.model.JdbcConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class DatasourceService {

    private static final Logger log = LoggerFactory.getLogger(DatasourceService.class);

    private final OntopEngineService ontopEngineService;
    private final ObjectMapper objectMapper;

    public DatasourceService(OntopEngineService ontopEngineService) {
        this.ontopEngineService = ontopEngineService;
        this.objectMapper = new ObjectMapper();
    }

    /**
     * Test database connection by extracting metadata in-process.
     */
    public Map<String, Object> testConnection(Datasource ds) {
        try {
            Path tempProps = writeTempProperties(ds);
            try {
                ExtractMetadataResponse response = ontopEngineService.extractMetadata(
                        buildRequest(tempProps));
                Map<String, Object> result = new HashMap<>();
                result.put("connected", response.isSuccess());
                result.put("message", response.isSuccess() ? "Connection successful" : response.getMessage());
                return result;
            } finally {
                Files.deleteIfExists(tempProps);
            }
        } catch (Exception e) {
            Map<String, Object> result = new HashMap<>();
            result.put("connected", false);
            result.put("message", e.getMessage() != null ? e.getMessage().substring(0, Math.min(500, e.getMessage().length())) : "Unknown error");
            return result;
        }
    }

    /**
     * Extract schema metadata and return distinct schema names.
     */
    public List<String> listSchemas(Datasource ds) throws Exception {
        Map<String, Object> schema = getSchemaMetadata(ds);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> relations = (List<Map<String, Object>>) schema.get("relations");
        Set<String> seen = new LinkedHashSet<>();
        for (Map<String, Object> relation : relations) {
            String schemaName = getRelationSchemaName(relation);
            if (!seen.contains(schemaName)) {
                seen.add(schemaName);
            }
        }
        return new ArrayList<>(seen);
    }

    /**
     * Get full schema metadata, optionally filtered by schema name.
     */
    public Map<String, Object> getSchema(Datasource ds, String schemaFilter) throws Exception {
        Map<String, Object> schema = getSchemaMetadata(ds);
        if (schemaFilter != null && !schemaFilter.isEmpty()) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> relations = (List<Map<String, Object>>) schema.get("relations");
            List<Map<String, Object>> filtered = relations.stream()
                    .filter(r -> schemaFilter.equals(getRelationSchemaName(r)))
                    .collect(Collectors.toList());
            schema.put("relations", filtered);
        }
        return schema;
    }

    private Map<String, Object> getSchemaMetadata(Datasource ds) throws Exception {
        Path tempProps = writeTempProperties(ds);
        try {
            ExtractMetadataResponse response = ontopEngineService.extractMetadata(buildRequest(tempProps));
            if (!response.isSuccess()) {
                throw new RuntimeException("Failed to extract metadata: " + response.getMessage());
            }
            // Parse the JSON metadata string
            @SuppressWarnings("unchecked")
            Map<String, Object> schema = objectMapper.readValue(response.getMetadataJson(), Map.class);
            return filterSchemaMetadata(ds, schema);
        } finally {
            Files.deleteIfExists(tempProps);
        }
    }

    private Path writeTempProperties(Datasource ds) throws IOException {
        Path temp = Files.createTempFile("ontop-ds-", ".properties");
        String content = String.format(
                "jdbc.url=%s%njdbc.user=%s%njdbc.password=%s%njdbc.driver=%s%n",
                ds.getJdbcUrl(), ds.getUser(), ds.getPassword(), ds.getDriver());
        Files.writeString(temp, content);
        return temp;
    }

    private ExtractMetadataRequest buildRequest(Path propertiesPath) {
        JdbcConfig jdbc = new JdbcConfig();
        // Read properties file to extract JDBC params
        try {
            List<String> lines = Files.readAllLines(propertiesPath);
            for (String line : lines) {
                if (line.startsWith("jdbc.url=")) jdbc.setJdbcUrl(line.substring("jdbc.url=".length()));
                else if (line.startsWith("jdbc.user=")) jdbc.setUser(line.substring("jdbc.user=".length()));
                else if (line.startsWith("jdbc.password=")) jdbc.setPassword(line.substring("jdbc.password=".length()));
                else if (line.startsWith("jdbc.driver=")) jdbc.setDriver(line.substring("jdbc.driver=".length()));
            }
        } catch (IOException e) {
            throw new RuntimeException("Failed to read properties file", e);
        }
        ExtractMetadataRequest req = new ExtractMetadataRequest();
        req.setJdbc(jdbc);
        return req;
    }

    @SuppressWarnings("unchecked")
    private String getRelationSchemaName(Map<String, Object> relation) {
        List<Object> name = (List<Object>) relation.get("name");
        if (name != null && name.size() >= 2) {
            return normalizeIdentifier(String.valueOf(name.get(name.size() - 2)));
        }
        return "(default)";
    }

    private String normalizeIdentifier(String value) {
        return value.trim().replaceAll("[\"'`]", "");
    }

    private boolean isMysqlDatasource(Datasource ds) {
        String driver = ds.getDriver() != null ? ds.getDriver().toLowerCase() : "";
        String url = ds.getJdbcUrl() != null ? ds.getJdbcUrl().toLowerCase() : "";
        return driver.contains("mysql") || url.startsWith("jdbc:mysql:");
    }

    private String getDefaultMysqlSchema(Datasource ds) {
        String url = ds.getJdbcUrl();
        if (url == null || !url.startsWith("jdbc:mysql:")) return null;
        String withoutPrefix = url.substring("jdbc:mysql:".length());
        String base = withoutPrefix.split("\\?", 2)[0];
        if (!base.startsWith("//")) base = "//" + base;
        String path = base.contains("/") ? base.substring(base.indexOf('/', 2) + 1) : "";
        return path.isEmpty() ? null : path;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> filterSchemaMetadata(Datasource ds, Map<String, Object> schema) {
        if (!isMysqlDatasource(ds)) return schema;

        String defaultSchema = getDefaultMysqlSchema(ds);
        Set<String> systemSchemas = Set.of("sys", "mysql", "information_schema", "performance_schema");

        List<Map<String, Object>> relations = (List<Map<String, Object>>) schema.get("relations");
        List<Map<String, Object>> filtered = new ArrayList<>();
        for (Map<String, Object> relation : relations) {
            String schemaName = getRelationSchemaName(relation);
            if (systemSchemas.contains(schemaName)) continue;
            if (defaultSchema != null && !"(default)".equals(schemaName) && !defaultSchema.equals(schemaName)) continue;
            filtered.add(relation);
        }
        schema.put("relations", filtered);
        return schema;
    }
}
