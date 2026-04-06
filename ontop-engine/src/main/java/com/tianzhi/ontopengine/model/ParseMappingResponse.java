package com.tianzhi.ontopengine.model;

import java.util.List;
import java.util.Map;

public class ParseMappingResponse {

    private boolean success;
    private String message;
    private Map<String, String> prefixes;
    private List<ParseMappingRule> mappings;

    public boolean isSuccess() {
        return success;
    }

    public void setSuccess(boolean success) {
        this.success = success;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public Map<String, String> getPrefixes() {
        return prefixes;
    }

    public void setPrefixes(Map<String, String> prefixes) {
        this.prefixes = prefixes;
    }

    public List<ParseMappingRule> getMappings() {
        return mappings;
    }

    public void setMappings(List<ParseMappingRule> mappings) {
        this.mappings = mappings;
    }
}
