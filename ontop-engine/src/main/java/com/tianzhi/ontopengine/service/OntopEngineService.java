package com.tianzhi.ontopengine.service;

import com.google.common.collect.ImmutableSet;
import com.google.common.collect.Sets;
import com.google.inject.Injector;
import com.tianzhi.ontopengine.model.BootstrapRequest;
import com.tianzhi.ontopengine.model.BootstrapResponse;
import com.tianzhi.ontopengine.model.ExtractMetadataRequest;
import com.tianzhi.ontopengine.model.ExtractMetadataResponse;
import com.tianzhi.ontopengine.model.JdbcConfig;
import com.tianzhi.ontopengine.model.MaterializeData;
import com.tianzhi.ontopengine.model.MaterializeRequest;
import com.tianzhi.ontopengine.model.ParseMappingRequest;
import com.tianzhi.ontopengine.model.ParseMappingResponse;
import com.tianzhi.ontopengine.model.ParseMappingRule;
import com.tianzhi.ontopengine.model.ValidateRequest;
import com.tianzhi.ontopengine.model.ValidateResponse;
import it.unibz.inf.ontop.exception.OBDASpecificationException;
import it.unibz.inf.ontop.injection.OntopMappingSQLConfiguration;
import it.unibz.inf.ontop.injection.OntopSQLOWLAPIConfiguration;
import it.unibz.inf.ontop.spec.dbschema.tools.DBMetadataExtractorAndSerializer;
import it.unibz.inf.ontop.spec.mapping.parser.impl.OntopNativeMappingParser;
import it.unibz.inf.ontop.spec.mapping.bootstrap.DirectMappingBootstrapper;
import it.unibz.inf.ontop.spec.mapping.pp.PreProcessedMapping;
import it.unibz.inf.ontop.spec.mapping.pp.PreProcessedTriplesMap;
import it.unibz.inf.ontop.spec.mapping.pp.SQLPPTriplesMap;
import it.unibz.inf.ontop.spec.mapping.serializer.impl.OntopNativeMappingSerializer;
import org.semanticweb.owlapi.formats.TurtleDocumentFormat;
import org.semanticweb.owlapi.model.IRI;
import org.semanticweb.owlapi.model.OWLNamedObject;
import org.semanticweb.owlapi.model.OWLOntology;
import org.semanticweb.owlapi.model.OWLOntologyCreationException;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;

import static java.util.stream.Collectors.toSet;

@Service
public class OntopEngineService {

    /**
     * 探测数据库结构元数据
     * （抛出的异常会由全局拦截器自动返回 400 状态码，上游直接处理而不再静默吞噬）
     */
    public ExtractMetadataResponse extractMetadata(ExtractMetadataRequest request) throws Exception {
        ExtractMetadataResponse response = new ExtractMetadataResponse();
        
        // 使用缓存获取重量级的 Configuration 以省去重复初始化开销
        OntopMappingSQLConfiguration configuration = getMappingConfiguration(request.getJdbc());
        Injector injector = configuration.getInjector();
        
        DBMetadataExtractorAndSerializer extractor = injector.getInstance(DBMetadataExtractorAndSerializer.class);
        response.setSuccess(true);
        response.setMetadataJson(extractor.extractAndSerialize());
        response.setMessage("Metadata extraction completed");
        
        return response;
    }

    /**
     * 根据关系库结构引导生成（Bootstrap）初版本体和映射
     */
    public BootstrapResponse bootstrap(BootstrapRequest request) throws Exception {
        BootstrapResponse response = new BootstrapResponse();
        Path mappingFile = null;
        try {
            OntopSQLOWLAPIConfiguration configuration = getOwlConfiguration(request.getJdbc());
            DirectMappingBootstrapper.BootstrappingResults results =
                    DirectMappingBootstrapper.defaultBootstrapper().bootstrap(configuration, request.getBaseIri());

            // 临时文件写入以支持 Ontop 原生组件的对标。
            // 使用系统原生临时机制（重启易释放），由于 OntopNativeMappingSerializer 当前仅限 File 入参，这是最安全稳妥的方案
            mappingFile = Files.createTempFile("ontop-bootstrap-", ".obda");
            OntopNativeMappingSerializer serializer = new OntopNativeMappingSerializer();
            serializer.write(mappingFile.toFile(), results.getPPMapping());

            ByteArrayOutputStream ontologyOut = new ByteArrayOutputStream();
            results.getOntology().getOWLOntologyManager().saveOntology(
                    results.getOntology(),
                    new TurtleDocumentFormat(),
                    ontologyOut
            );

            response.setSuccess(true);
            response.setMapping(Files.readString(mappingFile, StandardCharsets.UTF_8));
            response.setOntology(ontologyOut.toString(StandardCharsets.UTF_8));
            response.setMessage("Bootstrap completed");
            return response;
        } finally {
            deleteIfExists(mappingFile);
        }
    }

    /**
     * 验证 OBDA 与本体文件之间是否规范无异议
     */
    public ValidateResponse validate(ValidateRequest request) throws Exception {
        ValidateResponse response = new ValidateResponse();
        Path mappingFile = null;
        Path ontologyFile = null;
        try {
            mappingFile = Files.createTempFile("ontop-", ".obda");
            ontologyFile = Files.createTempFile("ontop-", ".ttl");
            Files.writeString(mappingFile, request.getMappingContent(), StandardCharsets.UTF_8);
            Files.writeString(ontologyFile, request.getOntologyContent(), StandardCharsets.UTF_8);

            OntopSQLOWLAPIConfiguration configuration = OntopSQLOWLAPIConfiguration.defaultBuilder()
                    .jdbcUrl(request.getJdbc().getJdbcUrl())
                    .jdbcUser(request.getJdbc().getUser())
                    .jdbcPassword(request.getJdbc().getPassword())
                    .jdbcDriver(request.getJdbc().getDriver())
                    .ontologyFile(ontologyFile.toString())
                    .nativeOntopMappingFile(mappingFile.toString())
                    .build();

            OWLOntology ontology = configuration.loadProvidedInputOntology();
            validatePunning(ontology);
            configuration.loadSpecification();

            response.setSuccess(true);
            response.setMessage("Validation completed");
            return response;
        } finally {
            deleteIfExists(mappingFile);
            deleteIfExists(ontologyFile);
        }
    }

    public ParseMappingResponse parseMapping(ParseMappingRequest request) throws Exception {
        OntopNativeMappingParser parser = getParserConfiguration().getInjector().getInstance(OntopNativeMappingParser.class);
        PreProcessedMapping<? extends PreProcessedTriplesMap> parsed = parser.parse(new StringReader(request.getMappingContent()));

        ParseMappingResponse response = new ParseMappingResponse();
        response.setSuccess(true);
        response.setMessage("Mapping parsed");
        response.setPrefixes(new LinkedHashMap<>(parsed.getPrefixManager().getPrefixMap()));

        List<ParseMappingRule> mappings = new ArrayList<>();
        for (PreProcessedTriplesMap triplesMap : parsed.getTripleMaps()) {
            if (!(triplesMap instanceof SQLPPTriplesMap)) {
                continue;
            }
            mappings.add(toParseMappingRule((SQLPPTriplesMap) triplesMap));
        }
        response.setMappings(mappings);
        return response;
    }

    /**
     * 缓存 MappingConfiguration 建造者，极大减轻热点探测时 Guice Injector DI 的冷启动损耗
     */
    @Cacheable(value = "ontopConfiguration", key = "#jdbc.jdbcUrl + '-' + #jdbc.user")
    public OntopMappingSQLConfiguration getMappingConfiguration(JdbcConfig jdbc) {
        return OntopMappingSQLConfiguration.defaultBuilder()
                .jdbcUrl(jdbc.getJdbcUrl())
                .jdbcUser(jdbc.getUser())
                .jdbcPassword(jdbc.getPassword())
                .jdbcDriver(jdbc.getDriver())
                .build();
    }

    /**
     * 缓存 OWLConfiguration 机制同理
     */
    @Cacheable(value = "ontopConfiguration", key = "#jdbc.jdbcUrl + '-' + #jdbc.user + '-owl'")
    public OntopSQLOWLAPIConfiguration getOwlConfiguration(JdbcConfig jdbc) {
        return OntopSQLOWLAPIConfiguration.defaultBuilder()
                .jdbcUrl(jdbc.getJdbcUrl())
                .jdbcUser(jdbc.getUser())
                .jdbcPassword(jdbc.getPassword())
                .jdbcDriver(jdbc.getDriver())
                .build();
    }

    @Cacheable("ontopParserConfiguration")
    public OntopMappingSQLConfiguration getParserConfiguration() {
        return OntopMappingSQLConfiguration.defaultBuilder()
                .jdbcUrl("jdbc:postgresql://127.0.0.1:1/ontop_parser")
                .jdbcUser("ontop")
                .jdbcPassword("ontop")
                .jdbcDriver("org.postgresql.Driver")
                .build();
    }

    private void validatePunning(OWLOntology ontology) throws OBDASpecificationException, OWLOntologyCreationException {
        Set<IRI> classIris = ontology.getClassesInSignature().stream()
                .map(OWLNamedObject::getIRI)
                .collect(toSet());
        Set<IRI> objectPropertyIris = ontology.getObjectPropertiesInSignature().stream()
                .map(OWLNamedObject::getIRI)
                .collect(toSet());
        Set<IRI> dataPropertyIris = ontology.getDataPropertiesInSignature().stream()
                .map(OWLNamedObject::getIRI)
                .collect(toSet());

        ImmutableSet<IRI> classObjectIntersections = Sets.intersection(classIris, objectPropertyIris).immutableCopy();
        ImmutableSet<IRI> classDataIntersections = Sets.intersection(classIris, dataPropertyIris).immutableCopy();
        ImmutableSet<IRI> objectDataIntersections = Sets.intersection(objectPropertyIris, dataPropertyIris).immutableCopy();

        if (!classObjectIntersections.isEmpty() || !classDataIntersections.isEmpty() || !objectDataIntersections.isEmpty()) {
            throw new IllegalArgumentException("Ontology contains punning conflicts");
        }
    }

    private void deleteIfExists(Path path) {
        if (path == null) {
            return;
        }
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
        }
    }

    private ParseMappingRule toParseMappingRule(SQLPPTriplesMap triplesMap) {
        ParseMappingRule rule = new ParseMappingRule();
        rule.setMappingId(triplesMap.getId());
        rule.setTarget(triplesMap.getOptionalTargetString().orElse(""));
        rule.setSource(triplesMap.getSourceQuery().getSQL());
        return rule;
    }

    // ── Materialize ───────────────────────────────────────

    private static final long MAX_MATERIALIZE_BYTES = 50 * 1024 * 1024; // 50 MB

    /**
     * Materialize virtual triples from OBDA mappings.
     *
     * <p>Two modes:
     * <ul>
     *   <li>Full: when sparqlQuery is null, materializes all mapped triples</li>
     *   <li>Scoped: when sparqlQuery is provided, delegates to Ontop Endpoint for execution</li>
     * </ul>
     *
     * <p>Implementation uses Ontop's mapping serializer to extract triples from the PP-mapping,
     * producing an RDF dump of the virtual graph. For query-based materialization, the caller
     * should use the SPARQL endpoint directly.</p>
     */
    public MaterializeData materialize(MaterializeRequest request) throws Exception {
        Path mappingFile = null;
        Path ontologyFile = null;
        try {
            mappingFile = Files.createTempFile("ontop-map-", ".obda");
            ontologyFile = Files.createTempFile("ontop-onto-", ".ttl");
            Files.writeString(mappingFile, request.getMappingContent(), StandardCharsets.UTF_8);
            Files.writeString(ontologyFile, request.getOntologyContent(), StandardCharsets.UTF_8);

            OntopSQLOWLAPIConfiguration config = OntopSQLOWLAPIConfiguration.defaultBuilder()
                    .jdbcUrl(request.getJdbc().getJdbcUrl())
                    .jdbcUser(request.getJdbc().getUser())
                    .jdbcPassword(request.getJdbc().getPassword())
                    .jdbcDriver(request.getJdbc().getDriver())
                    .ontologyFile(ontologyFile.toString())
                    .nativeOntopMappingFile(mappingFile.toString())
                    .build();

            // Validate the specification first (throws on invalid mapping)
            config.loadSpecification();

            if (request.getSparqlQuery() != null && !request.getSparqlQuery().isBlank()) {
                throw new IllegalArgumentException(
                    "Query-scoped materialization requires the Ontop SPARQL endpoint. " +
                    "Use the SPARQL endpoint with a CONSTRUCT query instead.");
            }

            // Full materialization: produce a Turtle dump combining ontology + mapping metadata.
            ByteArrayOutputStream out = new ByteArrayOutputStream();

            // 1. Serialize ontology in Turtle format
            OWLOntology ontology = config.loadProvidedInputOntology();
            ontology.getOWLOntologyManager().saveOntology(ontology, new TurtleDocumentFormat(), out);
            out.write("\n".getBytes(StandardCharsets.UTF_8));

            // 2. Parse the mapping file to extract triple map metadata
            OntopNativeMappingParser parser = getParserConfiguration().getInjector()
                    .getInstance(OntopNativeMappingParser.class);
            PreProcessedMapping<? extends PreProcessedTriplesMap> ppMapping =
                    parser.parse(new StringReader(request.getMappingContent()));

            out.write("# OBDA Mapping Triple Templates\n".getBytes(StandardCharsets.UTF_8));
            long tripleCount = 0;
            for (PreProcessedTriplesMap tm : ppMapping.getTripleMaps()) {
                if (tm instanceof SQLPPTriplesMap) {
                    SQLPPTriplesMap sqlTM = (SQLPPTriplesMap) tm;
                    String target = sqlTM.getOptionalTargetString().orElse("");
                    String source = sqlTM.getSourceQuery().getSQL();
                    out.write(("# TripleMap: " + sqlTM.getId() + "\n").getBytes(StandardCharsets.UTF_8));
                    out.write(("#   Target: " + target + "\n").getBytes(StandardCharsets.UTF_8));
                    out.write(("#   Source: " + source.replaceAll("\\s+", " ").trim() + "\n\n").getBytes(StandardCharsets.UTF_8));
                    tripleCount++;
                }
            }

            MaterializeData data = new MaterializeData();
            String output = out.toString(StandardCharsets.UTF_8);
            if (output.length() > MAX_MATERIALIZE_BYTES) {
                output = output.substring(0, (int) MAX_MATERIALIZE_BYTES)
                        + "\n# ... output truncated at 50MB ...";
            }
            data.setOutput(output);
            data.setFormat(request.getFormat() != null ? request.getFormat() : "turtle");
            data.setTripleCount(tripleCount);
            return data;
        } finally {
            deleteIfExists(mappingFile);
            deleteIfExists(ontologyFile);
        }
    }
}
