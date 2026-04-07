package com.tianzhi.ontopengine.api;

import com.tianzhi.ontopengine.model.QueryHistoryEntry;
import com.tianzhi.ontopengine.model.ReformulateRequest;
import com.tianzhi.ontopengine.model.SparqlQueryRequest;
import com.tianzhi.ontopengine.repository.QueryHistoryRepository;
import com.tianzhi.ontopengine.service.SparqlProxyService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/sparql")
public class SparqlProxyController {

    private final SparqlProxyService service;
    private final QueryHistoryRepository historyRepo;

    public SparqlProxyController(SparqlProxyService service, QueryHistoryRepository historyRepo) {
        this.service = service;
        this.historyRepo = historyRepo;
    }

    /**
     * Execute SPARQL query using the active data source.
     */
    @PostMapping("/query")
    public ResponseEntity<byte[]> query(@RequestBody SparqlQueryRequest req) {
        String dsId = req.getDsId(); // may be null → use active
        return service.executeQuery(req.getQuery(), req.getFormat(), dsId);
    }

    /**
     * Execute SPARQL query targeting a specific data source.
     */
    @PostMapping("/{dsId}/query")
    public ResponseEntity<byte[]> queryByDsId(@PathVariable String dsId,
                                               @RequestBody SparqlQueryRequest req) {
        return service.executeQuery(req.getQuery(), req.getFormat(), dsId);
    }

    @PostMapping("/reformulate")
    public Map<String, String> reformulate(@RequestBody ReformulateRequest req) {
        return service.reformulate(req.getQuery());
    }

    /**
     * Reformulate targeting a specific data source.
     */
    @PostMapping("/{dsId}/reformulate")
    public Map<String, String> reformulateByDsId(@PathVariable String dsId,
                                                  @RequestBody ReformulateRequest req) {
        return service.reformulate(req.getQuery(), dsId);
    }

    @GetMapping("/history")
    public List<QueryHistoryEntry> getHistory() {
        return historyRepo.list();
    }

    @DeleteMapping("/history/{id}")
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void deleteHistory(@PathVariable String id) {
        historyRepo.delete(id);
    }

    @GetMapping("/endpoint-status")
    public Map<String, Object> endpointStatus() {
        return service.getEndpointStatus();
    }
}
