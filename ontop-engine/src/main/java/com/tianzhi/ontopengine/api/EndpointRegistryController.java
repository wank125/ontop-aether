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
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api/v1/endpoint-registry")
public class EndpointRegistryController {

    private static final Logger log = LoggerFactory.getLogger(EndpointRegistryController.class);

    private final EndpointRegistryRepository repo;
    private final EndpointSwitcherService switcher;

    /** In-memory task store for tracking async activate operations. */
    private final ConcurrentHashMap<String, SwitchTask> taskStore = new ConcurrentHashMap<>();

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
    public ResponseEntity<Map<String, Object>> activate(@PathVariable String dsId) {
        EndpointRegistration reg = repo.getByDsId(dsId);
        if (reg == null) {
            return ResponseEntity.notFound().build();
        }

        String taskId = UUID.randomUUID().toString().substring(0, 8);
        SwitchTask task = new SwitchTask(taskId, dsId);
        taskStore.put(taskId, task);

        CompletableFuture.runAsync(() -> {
            task.status = "running";
            try {
                Object[] result = switcher.switchToDatasource(dsId);
                if ((Boolean) result[0]) {
                    task.status = "completed";
                    task.message = String.valueOf(result[1]);
                } else {
                    task.status = "failed";
                    task.message = String.valueOf(result[1]);
                }
            } catch (Exception e) {
                task.status = "failed";
                task.message = e.getMessage();
            }
            task.completedAt = System.currentTimeMillis();
            log.info("Switch task {} for {} completed: status={}", taskId, dsId, task.status);
        });

        Map<String, Object> response = new HashMap<>();
        response.put("task_id", taskId);
        response.put("ds_id", dsId);
        response.put("status", "pending");
        response.put("message", "切换任务已提交，目标数据源：" + reg.getDsName());
        response.put("poll_url", "/api/v1/endpoint-registry/tasks/" + taskId);
        return ResponseEntity.accepted().body(response);
    }

    @GetMapping("/tasks/{taskId}")
    public ResponseEntity<Map<String, Object>> getTaskStatus(@PathVariable String taskId) {
        SwitchTask task = taskStore.get(taskId);
        if (task == null) {
            return ResponseEntity.notFound().build();
        }
        Map<String, Object> response = new HashMap<>();
        response.put("task_id", task.taskId);
        response.put("ds_id", task.dsId);
        response.put("status", task.status);
        response.put("message", task.message);
        response.put("created_at", task.createdAt);
        if (task.completedAt > 0) {
            response.put("completed_at", task.completedAt);
            response.put("duration_ms", task.completedAt - task.createdAt);
        }
        return ResponseEntity.ok(response);
    }

    /** In-memory task record for tracking activate operations. */
    public static class SwitchTask {
        public final String taskId;
        public final String dsId;
        public volatile String status;  // pending, running, completed, failed
        public volatile String message;
        public final long createdAt;
        public volatile long completedAt;

        public SwitchTask(String taskId, String dsId) {
            this.taskId = taskId;
            this.dsId = dsId;
            this.status = "pending";
            this.message = null;
            this.createdAt = System.currentTimeMillis();
            this.completedAt = 0;
        }
    }
}
