package com.tianzhi.ontopengine.api;

import com.tianzhi.ontopengine.model.OntologyFile;
import com.tianzhi.ontopengine.model.TtlOntology;
import com.tianzhi.ontopengine.service.TtlParserService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Stream;

@RestController
@RequestMapping("/api/v1/ontology")
public class OntologyViewController {

    @Value("${ontop.data-dir}")
    private String dataDir;

    @Value("${ontop.output-dir}")
    private String outputDir;

    private final TtlParserService parser;

    public OntologyViewController(TtlParserService parser) {
        this.parser = parser;
    }

    @GetMapping
    public List<OntologyFile> listFiles() throws IOException {
        List<OntologyFile> files = new ArrayList<>();
        Set<String> seen = new HashSet<>();

        for (String dir : new String[]{outputDir, dataDir}) {
            if (dir == null || dir.isEmpty()) continue;
            Path path = Path.of(dir);
            if (!Files.exists(path)) continue;

            try (Stream<Path> walk = Files.walk(path)) {
                walk.filter(p -> p.toString().endsWith(".ttl"))
                        .forEach(p -> {
                            String resolved = p.toAbsolutePath().toString();
                            if (seen.add(resolved)) {
                                try {
                                    OntologyFile f = new OntologyFile();
                                    f.setPath(resolved);
                                    f.setFilename(p.getFileName().toString());
                                    f.setModifiedAt(Files.getLastModifiedTime(p).toMillis());
                                    files.add(f);
                                } catch (IOException e) {
                                    // skip
                                }
                            }
                        });
            }
        }

        files.sort((a, b) -> Long.compare(b.getModifiedAt(), a.getModifiedAt()));
        return files;
    }

    @GetMapping("/content")
    public ResponseEntity<?> getContent(@RequestParam String path) {
        if (!Files.exists(Path.of(path))) {
            return ResponseEntity.notFound().build();
        }
        try {
            String content = Files.readString(Path.of(path));
            TtlOntology ontology = parser.parse(content);
            return ResponseEntity.ok(ontology);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
