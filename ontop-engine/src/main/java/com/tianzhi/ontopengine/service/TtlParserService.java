package com.tianzhi.ontopengine.service;

import com.tianzhi.ontopengine.model.TtlOntology;
import com.tianzhi.ontopengine.model.TtlOntology.*;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.model.*;
import org.semanticweb.owlapi.model.parameters.Imports;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Parses TTL ontology files using OWLAPI into the structured TtlOntology model.
 */
@Service
public class TtlParserService {

    private static final Logger log = LoggerFactory.getLogger(TtlParserService.class);

    // Domain tag patterns from comments
    private static final Pattern[] DOMAIN_PATTERNS = {
            Pattern.compile("W域|W-域|W域：物"),
            Pattern.compile("H域|H-域|H域：人"),
            Pattern.compile("F域|F-域|F域：财"),
            Pattern.compile("E域|E-域|E域：事")
    };
    private static final String[] DOMAIN_TAGS = {"W", "H", "F", "E"};

    public TtlOntology parse(String ttlContent) throws Exception {
        OWLOntologyManager manager = OWLManager.createOWLOntologyManager();
        OWLOntology ontology = manager.loadOntologyFromOntologyDocument(
                new ByteArrayInputStream(ttlContent.getBytes(StandardCharsets.UTF_8)));

        TtlOntology result = new TtlOntology();

        // Parse ontology metadata
        parseMetadata(ontology, result);

        // Parse classes
        for (OWLClass cls : ontology.getClassesInSignature(Imports.INCLUDED)) {
            if (cls.isOWLThing() || cls.isOWLNothing()) continue;
            OwlClass owlClass = new OwlClass();
            owlClass.name = cls.getIRI().toString();
            owlClass.localName = localName(cls.getIRI());

            Map<String, String> labelMap = getAnnotationsByLang(ontology, cls, manager.getOWLDataFactory().getRDFSLabel());
            Map<String, String> commentMap = getAnnotationsByLang(ontology, cls, manager.getOWLDataFactory().getRDFSComment());

            owlClass.labels.zh = labelMap.getOrDefault("zh", "");
            owlClass.labels.en = labelMap.getOrDefault("en", labelMap.getOrDefault("", ""));
            owlClass.comments.zh = commentMap.getOrDefault("zh", "");
            owlClass.comments.en = commentMap.getOrDefault("en", "");

            // Domain tag from comments
            owlClass.domainTag = extractDomainTag(commentMap.values());

            result.getClasses().add(owlClass);
        }

        // Parse object properties
        for (OWLObjectProperty prop : ontology.getObjectPropertiesInSignature(Imports.INCLUDED)) {
            if (prop.isOWLTopObjectProperty()) continue;
            OwlObjectProperty op = new OwlObjectProperty();
            op.name = prop.getIRI().toString();
            op.localName = localName(prop.getIRI());

            Map<String, String> labelMap = getAnnotationsByLang(ontology, prop, manager.getOWLDataFactory().getRDFSLabel());
            Map<String, String> commentMap = getAnnotationsByLang(ontology, prop, manager.getOWLDataFactory().getRDFSComment());
            op.labels.zh = labelMap.getOrDefault("zh", "");
            op.labels.en = labelMap.getOrDefault("en", labelMap.getOrDefault("", ""));
            op.comments.zh = commentMap.getOrDefault("zh", "");
            op.comments.en = commentMap.getOrDefault("en", "");

            // Domain and range
            java.util.Set<String> domainIris = new java.util.HashSet<>();
            for (OWLObjectPropertyDomainAxiom ax : ontology.getObjectPropertyDomainAxioms(prop)) {
                if (ax.getDomain() instanceof OWLClass) {
                    domainIris.add(((OWLClass) ax.getDomain()).getIRI().toString());
                }
            }
            op.domain = domainIris.isEmpty() ? "" : domainIris.iterator().next();

            java.util.Set<String> rangeIris = new java.util.HashSet<>();
            for (OWLObjectPropertyRangeAxiom ax : ontology.getObjectPropertyRangeAxioms(prop)) {
                if (ax.getRange() instanceof OWLClass) {
                    rangeIris.add(((OWLClass) ax.getRange()).getIRI().toString());
                }
            }
            op.range = rangeIris.isEmpty() ? "" : rangeIris.iterator().next();

            result.getObjectProperties().add(op);
        }

        // Parse data properties
        for (OWLDataProperty prop : ontology.getDataPropertiesInSignature(Imports.INCLUDED)) {
            if (prop.isOWLTopDataProperty()) continue;
            OwlDataProperty dp = new OwlDataProperty();
            dp.name = prop.getIRI().toString();
            dp.localName = localName(prop.getIRI());

            Map<String, String> labelMap = getAnnotationsByLang(ontology, prop, manager.getOWLDataFactory().getRDFSLabel());
            Map<String, String> commentMap = getAnnotationsByLang(ontology, prop, manager.getOWLDataFactory().getRDFSComment());
            dp.labels.zh = labelMap.getOrDefault("zh", "");
            dp.labels.en = labelMap.getOrDefault("en", labelMap.getOrDefault("", ""));
            dp.comments.zh = commentMap.getOrDefault("zh", "");
            dp.comments.en = commentMap.getOrDefault("en", "");

            java.util.Set<String> dpDomainIris = new java.util.HashSet<>();
            for (OWLDataPropertyDomainAxiom ax : ontology.getDataPropertyDomainAxioms(prop)) {
                if (ax.getDomain() instanceof OWLClass) {
                    dpDomainIris.add(((OWLClass) ax.getDomain()).getIRI().toString());
                }
            }
            dp.domain = dpDomainIris.isEmpty() ? "" : dpDomainIris.iterator().next();

            java.util.Set<String> dpRangeIris = new java.util.HashSet<>();
            for (OWLDataPropertyRangeAxiom ax : ontology.getDataPropertyRangeAxioms(prop)) {
                if (ax.getRange() instanceof OWLDatatype) {
                    dpRangeIris.add(((OWLDatatype) ax.getRange()).getIRI().toString());
                }
            }
            dp.range = dpRangeIris.isEmpty() ? "" : dpRangeIris.iterator().next();

            result.getDataProperties().add(dp);
        }

        return result;
    }

    private void parseMetadata(OWLOntology ontology, TtlOntology result) {
        OWLDataFactory df = ontology.getOWLOntologyManager().getOWLDataFactory();

        // Get ontology IRI annotations
        Optional<IRI> ontologyIri = ontology.getOntologyID().getOntologyIRI();
        if (ontologyIri.isPresent()) {
            Map<String, String> labelMap = new HashMap<>();
            Map<String, String> commentMap = new HashMap<>();

            for (OWLAnnotation annotation : ontology.getAnnotations()) {
                if (annotation.getProperty().equals(df.getRDFSLabel()) && annotation.getValue() instanceof OWLLiteral) {
                    OWLLiteral lit = (OWLLiteral) annotation.getValue();
                    String lang = lit.getLang();
                    labelMap.put(lang.isEmpty() ? "" : lang, lit.getLiteral());
                }
                if (annotation.getProperty().equals(df.getRDFSComment()) && annotation.getValue() instanceof OWLLiteral) {
                    OWLLiteral lit = (OWLLiteral) annotation.getValue();
                    String lang = lit.getLang();
                    commentMap.put(lang.isEmpty() ? "" : lang, lit.getLiteral());
                }
                if (annotation.getProperty().equals(df.getOWLVersionInfo()) && annotation.getValue() instanceof OWLLiteral) {
                    result.getMetadata().version = ((OWLLiteral) annotation.getValue()).getLiteral();
                }
            }

            result.getMetadata().labels.zh = labelMap.getOrDefault("zh", "");
            result.getMetadata().labels.en = labelMap.getOrDefault("en", labelMap.getOrDefault("", ""));
            result.getMetadata().comments.zh = commentMap.getOrDefault("zh", "");
            result.getMetadata().comments.en = commentMap.getOrDefault("en", commentMap.getOrDefault("", ""));
        }

        Optional<IRI> versionIri = ontology.getOntologyID().getVersionIRI();
        versionIri.ifPresent(iri -> result.getMetadata().versionIri = iri.toString());
    }

    private Map<String, String> getAnnotationsByLang(OWLOntology ontology, OWLNamedObject entity, OWLAnnotationProperty property) {
        Map<String, String> result = new HashMap<>();
        for (OWLAnnotationAssertionAxiom axiom : ontology.getAnnotationAssertionAxioms(entity.getIRI())) {
            if (axiom.getProperty().equals(property) && axiom.getValue() instanceof OWLLiteral) {
                OWLLiteral lit = (OWLLiteral) axiom.getValue();
                String lang = lit.getLang();
                result.put(lang.isEmpty() ? "" : lang, lit.getLiteral());
            }
        }
        return result;
    }

    private String localName(IRI iri) {
        String str = iri.toString();
        if (str.contains("#")) return str.substring(str.lastIndexOf('#') + 1);
        if (str.contains("/")) return str.substring(str.lastIndexOf('/') + 1);
        return str;
    }

    private String extractDomainTag(Collection<String> comments) {
        for (String comment : comments) {
            for (int i = 0; i < DOMAIN_PATTERNS.length; i++) {
                if (DOMAIN_PATTERNS[i].matcher(comment).find()) {
                    return DOMAIN_TAGS[i];
                }
            }
        }
        return "";
    }
}
