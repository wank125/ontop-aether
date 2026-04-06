package com.tianzhi.ontopengine.api;

import com.tianzhi.ontopengine.model.EndpointRegistration;
import com.tianzhi.ontopengine.repository.EndpointRegistryRepository;
import com.tianzhi.ontopengine.service.EndpointSwitcherService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/endpoint-registry")
public class EndpointRegistryController {

    private static final Logger log = LoggerFactory.getLogger(EndpointRegistryController.class);

    private final EndpointRegistryRepository repo;
    private final EndpointSwitcherService switcher;

    public EndpointRegistryController(EndpointRegistryRepository repo, EndpointSwitcherService switcher) {
        this.repo = repo;
        this.switcher = switcher;
    }

    @GetMapping
    public List<EndpointRegistration> list() {
        return repo.list();
    }

    @GetMapping("/current")
    public ResponseEntity<?> getCurrent() {
        EndpointRegistration current = repo.getCurrent();
        if (current == null) {
            Map<String, Object> result = new HashMap<>();
            result.put("message", "暂无激活的数据源端点");
            result.put("current", null);
            return ResponseEntity.ok(result);
        }
        return ResponseEntity.ok(current);
    }

    @PutMapping("/{dsId}/activate")
    public ResponseEntity<Map<String, String>> activate(@PathVariable String dsId) {
        EndpointRegistration reg = repo.getByDsId(dsId);
        if (reg == null) {
            return ResponseEntity.notFound().build();
        }

        // Run switch asynchronously using a thread
        new Thread(() -> {
            Object[] result = switcher.switchToDatasource(dsId);
            if (!(Boolean) result[0]) {
                log.warn("Switch to {} failed: {}", dsId, result[1]);
            }
        }).start();

        Map<String, String> response = new HashMap<>();
        response.put("message", "切换任务已提交，目标数据源：" + reg.getDsName());
        response.put("ds_id", dsId);
        response.put("note", "端点重启约需 5-10 秒，期间 SPARQL 查询将返回 503");
        return ResponseEntity.ok(response);
    }
}
