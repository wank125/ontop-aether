package com.tianzhi.ontopengine.service;

import com.tianzhi.ontopengine.model.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Stream;

/**
 * Manages mapping file operations: list, read, parse, serialize, validate.
 * Parsing delegates to OntopEngineService (in-process).
 */
@Service
public class MappingFileService {

    private static final Logger log = LoggerFactory.getLogger(MappingFileService.class);

    @Value("${ontop.data-dir}")
    private String dataDir;

    @Value("${ontop.output-dir}")
    private String outputDir;

    private final OntopEngineService ontopEngineService;

    public MappingFileService(OntopEngineService ontopEngineService) {
        this.ontopEngineService = ontopEngineService;
    }

    public List<MappingFile> listFiles() throws IOException {
        List<MappingFile> files = new ArrayList<>();
        Set<String> seen = new HashSet<>();

        for (String dir : new String[]{outputDir, dataDir}) {
            if (dir == null || dir.isEmpty()) continue;
            Path path = Path.of(dir);
            if (!Files.exists(path)) continue;

            try (Stream<Path> walk = Files.walk(path)) {
                walk.filter(p -> p.toString().endsWith(".obda"))
                        .forEach(p -> {
                            String resolved = p.toAbsolutePath().toString();
                            if (seen.add(resolved)) {
                                try {
                                    MappingFile f = new MappingFile();
                                    f.setPath(resolved);
                                    f.setFilename(p.getFileName().toString());
                                    f.setModifiedAt(Files.getLastModifiedTime(p).toMillis());
                                    files.add(f);
                                } catch (IOException e) {
                                    log.warn("Failed to stat {}: {}", resolved, e.getMessage());
                                }
                            }
                        });
            }
        }

        files.sort((a, b) -> Long.compare(b.getModifiedAt(), a.getModifiedAt()));
        return files;
    }

    public MappingContent readAndParse(String path) throws Exception {
        String content = Files.readString(Path.of(path), StandardCharsets.UTF_8);

        // Use in-process OntopEngineService to parse
        ParseMappingRequest req = new ParseMappingRequest();
        req.setMappingContent(content);
        ParseMappingResponse resp = ontopEngineService.parseMapping(req);

        MappingContent mc = new MappingContent();
        mc.setPrefixes(resp.getPrefixes());

        List<MappingRule> rules = new ArrayList<>();
        for (ParseMappingRule pmr : resp.getMappings()) {
            MappingRule rule = new MappingRule();
            rule.setMappingId(pmr.getMappingId());
            rule.setTarget(pmr.getTarget());
            rule.setSource(pmr.getSource());
            rules.add(rule);
        }
        mc.setMappings(rules);
        return mc;
    }

    public void saveContent(String path, MappingContent content) throws IOException {
        String serialized = serializeObda(content);
        Files.writeString(Path.of(path), serialized, StandardCharsets.UTF_8);
    }

    public Map<String, Object> validate(String mappingPath, String ontologyPath, String propertiesPath) {
        try {
            String mappingContent = Files.readString(Path.of(mappingPath), StandardCharsets.UTF_8);
            String ontologyContent = Files.readString(Path.of(ontologyPath), StandardCharsets.UTF_8);
            String propertiesContent = Files.readString(Path.of(propertiesPath), StandardCharsets.UTF_8);

            JdbcConfig jdbc = parsePropertiesJdbc(propertiesContent);

            ValidateRequest req = new ValidateRequest();
            req.setMappingContent(mappingContent);
            req.setOntologyContent(ontologyContent);
            req.setJdbc(jdbc);

            ValidateResponse resp = ontopEngineService.validate(req);

            Map<String, Object> result = new HashMap<>();
            result.put("valid", resp.isSuccess());
            result.put("errors", resp.isSuccess() ? Collections.emptyList() : List.of(resp.getMessage()));
            return result;
        } catch (Exception e) {
            Map<String, Object> result = new HashMap<>();
            result.put("valid", false);
            result.put("errors", List.of(e.getMessage() != null ? e.getMessage().substring(0, Math.min(500, e.getMessage().length())) : "Validation failed"));
            return result;
        }
    }

    /**
     * Serialize MappingContent back to .obda format.
     */
    private String serializeObda(MappingContent content) {
        StringBuilder sb = new StringBuilder();

        // Prefix declaration
        sb.append("[PrefixDeclaration]\n");
        if (content.getPrefixes() != null) {
            for (Map.Entry<String, String> entry : content.getPrefixes().entrySet()) {
                sb.append(entry.getKey()).append("\t").append(entry.getValue()).append("\n");
            }
        }

        sb.append("\n[MappingDeclaration] @collection [[\n");
        if (content.getMappings() != null) {
            for (MappingRule rule : content.getMappings()) {
                sb.append("mappingId\t").append(rule.getMappingId()).append("\n");
                sb.append("target\t\t").append(rule.getTarget()).append("\n");
                sb.append("source\t\t").append(rule.getSource()).append("\n\n");
            }
        }
        sb.append("]]\n");

        return sb.toString();
    }

    private JdbcConfig parsePropertiesJdbc(String content) {
        JdbcConfig jdbc = new JdbcConfig();
        for (String line : content.split("\n")) {
            line = line.trim();
            if (line.startsWith("jdbc.url=")) jdbc.setJdbcUrl(line.substring("jdbc.url=".length()));
            else if (line.startsWith("jdbc.user=")) jdbc.setUser(line.substring("jdbc.user=".length()));
            else if (line.startsWith("jdbc.password=")) jdbc.setPassword(line.substring("jdbc.password=".length()));
            else if (line.startsWith("jdbc.driver=")) jdbc.setDriver(line.substring("jdbc.driver=".length()));
        }
        return jdbc;
    }
}
