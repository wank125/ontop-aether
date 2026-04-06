package com.tianzhi.ontopengine.model;

/**
 * Unified API response envelope for all Ontop Engine endpoints.
 *
 * <p>Every endpoint wraps its business payload in this structure, providing
 * consistent observability fields (requestId, durationMs) across the board.</p>
 */
public class ApiEnvelope<T> {

    private boolean success;
    private String message;
    private String requestId;
    private long durationMs;
    private T data;

    public static <T> ApiEnvelope<T> ok(T data, String message, String requestId, long durationMs) {
        ApiEnvelope<T> env = new ApiEnvelope<>();
        env.success = true;
        env.message = message;
        env.requestId = requestId;
        env.durationMs = durationMs;
        env.data = data;
        return env;
    }

    public static <T> ApiEnvelope<T> fail(String message, String requestId, long durationMs) {
        ApiEnvelope<T> env = new ApiEnvelope<>();
        env.success = false;
        env.message = message;
        env.requestId = requestId;
        env.durationMs = durationMs;
        env.data = null;
        return env;
    }

    // --- Getters / Setters ---

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

    public String getRequestId() {
        return requestId;
    }

    public void setRequestId(String requestId) {
        this.requestId = requestId;
    }

    public long getDurationMs() {
        return durationMs;
    }

    public void setDurationMs(long durationMs) {
        this.durationMs = durationMs;
    }

    public T getData() {
        return data;
    }

    public void setData(T data) {
        this.data = data;
    }
}
