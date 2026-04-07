package com.tianzhi.ontopengine.api;

import com.tianzhi.ontopengine.model.MappingContent;
import com.tianzhi.ontopengine.model.MappingFile;
import com.tianzhi.ontopengine.service.MappingFileService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/mappings")
public class MappingController {

    private final MappingFileService service;
    private final RestTemplate restTemplate;

    @Value("${ontop.endpoint.url}")
    private String endpointUrl;

    @Value("${ontop.internal-secret:}")
    private String internalSecret;

    public MappingController(MappingFileService service, RestTemplate restTemplate) {
        this.service = service;
        this.restTemplate = restTemplate;
    }

    @GetMapping
    public List<MappingFile> listFiles() throws Exception {
        return service.listFiles();
    }

    @GetMapping("/content")
    public ResponseEntity<?> getContent(@RequestParam String path) {
        if (!Files.exists(Path.of(path))) {
            return ResponseEntity.notFound().build();
        }
        try {
            return ResponseEntity.ok(service.readAndParse(path));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/content")
    public ResponseEntity<Map<String, Boolean>> saveContent(
            @RequestParam String path,
            @RequestBody MappingContent content) {
        if (!Files.exists(Path.of(path))) {
            return ResponseEntity.notFound().build();
        }
        try {
            service.saveContent(path, content);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false));
        }
    }

    @PostMapping("/validate")
    public ResponseEntity<Map<String, Object>> validate(
            @RequestParam String path,
            @RequestBody(required = false) Map<String, String> req) {
        if (!Files.exists(Path.of(path))) {
            return ResponseEntity.notFound().build();
        }
        String ontologyPath = (req != null && req.get("ontology_path") != null) ? req.get("ontology_path") : "";
        String propertiesPath = (req != null && req.get("properties_path") != null) ? req.get("properties_path") : "";

        if (ontologyPath.isEmpty() || propertiesPath.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("valid", false, "errors", List.of("ontology_path and properties_path required")));
        }

        return ResponseEntity.ok(service.validate(path, ontologyPath, propertiesPath));
    }

    @PostMapping("/restart-endpoint")
    public ResponseEntity<Map<String, Object>> restartEndpoint(@RequestBody(required = false) Map<String, String> req) {
        try {
            HttpHeaders headers = new HttpHeaders();
            if (internalSecret != null && !internalSecret.isBlank()) {
                headers.set("X-Internal-Secret", internalSecret);
            }
            HttpEntity<Void> entity = new HttpEntity<>(headers);
            restTemplate.postForEntity(endpointUrl + "/ontop/restart", entity, Void.class);
            return ResponseEntity.ok(Map.of("success", true, "message", "Endpoint restarted"));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(
                    Map.of("success", false, "message", "Restart failed: " + e.getMessage()));
        }
    }
}
