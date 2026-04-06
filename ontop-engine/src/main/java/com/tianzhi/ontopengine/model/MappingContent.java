package com.tianzhi.ontopengine.model;

import java.util.List;
import java.util.Map;

public class MappingContent {

    private Map<String, String> prefixes;
    private List<MappingRule> mappings;

    public Map<String, String> getPrefixes() { return prefixes; }
    public void setPrefixes(Map<String, String> prefixes) { this.prefixes = prefixes; }

    public List<MappingRule> getMappings() { return mappings; }
    public void setMappings(List<MappingRule> mappings) { this.mappings = mappings; }
}
