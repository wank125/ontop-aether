package com.tianzhi.ontopengine.api;

import com.tianzhi.ontopengine.model.ApiEnvelope;
import com.tianzhi.ontopengine.model.BootstrapRequest;
import com.tianzhi.ontopengine.model.BootstrapResponse;
import com.tianzhi.ontopengine.model.ExtractMetadataRequest;
import com.tianzhi.ontopengine.model.ExtractMetadataResponse;
import com.tianzhi.ontopengine.model.MaterializeRequest;
import com.tianzhi.ontopengine.model.ParseMappingRequest;
import com.tianzhi.ontopengine.model.ParseMappingResponse;
import com.tianzhi.ontopengine.model.ValidateRequest;
import com.tianzhi.ontopengine.model.ValidateResponse;
import com.tianzhi.ontopengine.service.OntopEngineService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;

@RestController
@Validated
@RequestMapping("/api/ontop")
public class OntopController {

    private static final Logger log = LoggerFactory.getLogger(OntopController.class);

    private final OntopEngineService ontopEngineService;

    public OntopController(OntopEngineService ontopEngineService) {
        this.ontopEngineService = ontopEngineService;
    }

    private static String requestId() {
        return UUID.randomUUID().toString().substring(0, 8);
    }

    private static <T> ApiEnvelope<T> wrap(T data, String msg, String rid, long start) {
        long ms = System.currentTimeMillis() - start;
        log.info("[{}] completed in {}ms", rid, ms);
        return ApiEnvelope.ok(data, msg, rid, ms);
    }

    // ── extract-metadata ──────────────────────────────────

    @Async("ontopTaskExecutor")
    @PostMapping("/extract-metadata")
    public CompletableFuture<ApiEnvelope<ExtractMetadataResponse>> extractMetadata(
            @RequestBody ExtractMetadataRequest request) throws Exception {
        String rid = requestId();
        long start = System.currentTimeMillis();
        log.info("[{}] POST /api/ontop/extract-metadata", rid);
        ExtractMetadataResponse result = ontopEngineService.extractMetadata(request);
        return CompletableFuture.completedFuture(wrap(result, "Metadata extraction completed", rid, start));
    }

    // ── bootstrap ─────────────────────────────────────────

    @Async("ontopTaskExecutor")
    @PostMapping("/bootstrap")
    public CompletableFuture<ApiEnvelope<BootstrapResponse>> bootstrap(
            @RequestBody BootstrapRequest request) throws Exception {
        String rid = requestId();
        long start = System.currentTimeMillis();
        log.info("[{}] POST /api/ontop/bootstrap baseIri={}", rid, request.getBaseIri());
        BootstrapResponse result = ontopEngineService.bootstrap(request);
        return CompletableFuture.completedFuture(wrap(result, "Bootstrap completed", rid, start));
    }

    // ── validate ──────────────────────────────────────────

    @PostMapping("/validate")
    public ApiEnvelope<ValidateResponse> validate(
            @RequestBody ValidateRequest request) throws Exception {
        String rid = requestId();
        long start = System.currentTimeMillis();
        log.info("[{}] POST /api/ontop/validate", rid);
        ValidateResponse result = ontopEngineService.validate(request);
        return wrap(result, "Validation completed", rid, start);
    }

    // ── parse-mapping ─────────────────────────────────────

    @PostMapping("/parse-mapping")
    public ApiEnvelope<ParseMappingResponse> parseMapping(
            @RequestBody ParseMappingRequest request) throws Exception {
        String rid = requestId();
        long start = System.currentTimeMillis();
        log.info("[{}] POST /api/ontop/parse-mapping", rid);
        ParseMappingResponse result = ontopEngineService.parseMapping(request);
        return wrap(result, "Mapping parsed", rid, start);
    }

    // ── materialize ───────────────────────────────────────

    @Async("ontopTaskExecutor")
    @PostMapping("/materialize")
    public CompletableFuture<ApiEnvelope<Object>> materialize(
            @RequestBody @Validated MaterializeRequest request) throws Exception {
        String rid = requestId();
        long start = System.currentTimeMillis();
        log.info("[{}] POST /api/ontop/materialize format={} query={}", rid,
                request.getFormat(),
                request.getSparqlQuery() != null ? "provided" : "full");
        Object result = ontopEngineService.materialize(request);
        return CompletableFuture.completedFuture(wrap(result, "Materialize completed", rid, start));
    }
}
