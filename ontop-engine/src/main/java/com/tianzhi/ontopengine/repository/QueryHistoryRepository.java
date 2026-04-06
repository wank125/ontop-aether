package com.tianzhi.ontopengine.repository;

import com.tianzhi.ontopengine.model.QueryHistoryEntry;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public class QueryHistoryRepository {

    private static final int MAX_HISTORY = 500;
    private final JdbcTemplate jdbc;

    public QueryHistoryRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<QueryHistoryEntry> list() {
        return jdbc.query(
                "SELECT * FROM query_history ORDER BY timestamp DESC LIMIT 200",
                (rs, rowNum) -> {
                    QueryHistoryEntry e = new QueryHistoryEntry();
                    e.setId(rs.getString("id"));
                    e.setQuery(rs.getString("query"));
                    e.setTimestamp(rs.getString("timestamp"));
                    e.setResultCount((Integer) rs.getObject("result_count"));
                    e.setSourceIp(rs.getString("source_ip"));
                    e.setCaller(rs.getString("caller"));
                    e.setDurationMs((Double) rs.getObject("duration_ms"));
                    e.setStatus(rs.getString("status"));
                    e.setErrorMessage(rs.getString("error_message"));
                    return e;
                });
    }

    public void save(String query, Integer resultCount, String sourceIp,
                     String caller, Double durationMs, String status, String errorMessage) {
        String id = UUID.randomUUID().toString().substring(0, 8);
        String now = LocalDateTime.now().toString();

        jdbc.update(
                "INSERT INTO query_history (id, query, timestamp, result_count, source_ip, caller, duration_ms, status, error_message) " +
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                id, query, now, resultCount, sourceIp, caller, durationMs, status, errorMessage);

        // Auto-prune
        jdbc.update("DELETE FROM query_history WHERE id NOT IN " +
                "(SELECT id FROM query_history ORDER BY timestamp DESC LIMIT ?)", MAX_HISTORY);
    }

    public boolean delete(String id) {
        return jdbc.update("DELETE FROM query_history WHERE id = ?", id) > 0;
    }
}
