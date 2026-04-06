package com.tianzhi.ontopengine.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.ArrayList;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class TtlOntology {

    private OntologyMetadata metadata = new OntologyMetadata();
    private List<OwlClass> classes = new ArrayList<>();
    @JsonProperty("object_properties")
    private List<OwlObjectProperty> objectProperties = new ArrayList<>();
    @JsonProperty("data_properties")
    private List<OwlDataProperty> dataProperties = new ArrayList<>();
    @JsonProperty("shacl_constraints")
    private List<ShaclConstraint> shaclConstraints = new ArrayList<>();

    public OntologyMetadata getMetadata() { return metadata; }
    public void setMetadata(OntologyMetadata metadata) { this.metadata = metadata; }

    public List<OwlClass> getClasses() { return classes; }
    public void setClasses(List<OwlClass> classes) { this.classes = classes; }

    public List<OwlObjectProperty> getObjectProperties() { return objectProperties; }
    public void setObjectProperties(List<OwlObjectProperty> objectProperties) { this.objectProperties = objectProperties; }

    public List<OwlDataProperty> getDataProperties() { return dataProperties; }
    public void setDataProperties(List<OwlDataProperty> dataProperties) { this.dataProperties = dataProperties; }

    public List<ShaclConstraint> getShaclConstraints() { return shaclConstraints; }
    public void setShaclConstraints(List<ShaclConstraint> shaclConstraints) { this.shaclConstraints = shaclConstraints; }

    // ── Nested models ──

    public static class BilingualLabel {
        public String zh = "";
        public String en = "";
        public BilingualLabel() {}
    }

    public static class OntologyMetadata {
        public BilingualLabel labels = new BilingualLabel();
        public BilingualLabel comments = new BilingualLabel();
        public String version = "";
        @JsonProperty("version_iri")
        public String versionIri = "";
        public OntologyMetadata() {}
    }

    public static class OwlClass {
        public String name;
        @JsonProperty("local_name")
        public String localName;
        public BilingualLabel labels = new BilingualLabel();
        public BilingualLabel comments = new BilingualLabel();
        public List<String> examples = new ArrayList<>();
        @JsonProperty("domain_tag")
        public String domainTag = "";
    }

    public static class OwlObjectProperty {
        public String name;
        @JsonProperty("local_name")
        public String localName;
        public BilingualLabel labels = new BilingualLabel();
        public BilingualLabel comments = new BilingualLabel();
        public String domain = "";
        public String range = "";
        @JsonProperty("inverse_of")
        public String inverseOf = "";
    }

    public static class OwlDataProperty {
        public String name;
        @JsonProperty("local_name")
        public String localName;
        public BilingualLabel labels = new BilingualLabel();
        public BilingualLabel comments = new BilingualLabel();
        public String domain = "";
        public String range = "";
    }

    public static class ShaclConstraint {
        public String name;
        @JsonProperty("local_name")
        public String localName;
        public BilingualLabel labels = new BilingualLabel();
        public BilingualLabel comments = new BilingualLabel();
        @JsonProperty("target_class")
        public String targetClass = "";
        public List<ShaclPropertyConstraint> properties = new ArrayList<>();
        @JsonProperty("sparql_constraints")
        public List<ShaclSparqlConstraint> sparqlConstraints = new ArrayList<>();
    }

    public static class ShaclPropertyConstraint {
        public String path = "";
        @JsonProperty("path_inverse")
        public String pathInverse = "";
        @JsonProperty("min_count")
        public Integer minCount;
        @JsonProperty("min_inclusive")
        public Double minInclusive;
        @JsonProperty("min_exclusive")
        public Double minExclusive;
        public String datatype = "";
        @JsonProperty("has_value")
        public String hasValue = "";
        @JsonProperty("in_values")
        public List<String> inValues = new ArrayList<>();
    }

    public static class ShaclSparqlConstraint {
        public String message = "";
        public String select = "";
    }
}
