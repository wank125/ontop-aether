package com.tianzhi.ontopengine.api;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.lang.management.ManagementFactory;
import java.util.HashMap;
import java.util.Map;

@RestController
public class HealthController {

    @Value("${ontop.version:5.5.0}")
    private String ontopVersion;

    private final long startedAt = System.currentTimeMillis();

    @GetMapping("/health")
    public Map<String, Object> health() {
        Map<String, Object> body = new HashMap<>();
        body.put("status", "UP");
        body.put("uptimeSeconds", (System.currentTimeMillis() - startedAt) / 1000);
        body.put("ontopVersion", ontopVersion);
        return body;
    }

    @GetMapping("/version")
    public Map<String, Object> version() {
        Map<String, Object> body = new HashMap<>();
        body.put("version", readProjectVersion());
        body.put("ontopVersion", ontopVersion);
        body.put("javaVersion", System.getProperty("java.version", "unknown"));
        body.put("springBootVersion", readSpringBootVersion());
        return body;
    }

    private String readProjectVersion() {
        String v = getClass().getPackage().getImplementationVersion();
        return v != null ? v : "0.1.0";
    }

    private String readSpringBootVersion() {
        try {
            Class<?> cl = Class.forName("org.springframework.boot.SpringBootVersion");
            return (String) cl.getMethod("getVersion").invoke(null);
        } catch (Exception e) {
            return "unknown";
        }
    }
}
