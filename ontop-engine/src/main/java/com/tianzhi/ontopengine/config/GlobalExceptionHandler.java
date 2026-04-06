package com.tianzhi.ontopengine.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /**
     * Handle validation errors (e.g. @NotBlank, @NotNull) — 400.
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        String rid = shortId();
        Map<String, Object> body = new HashMap<>();
        body.put("success", false);
        body.put("requestId", rid);

        StringBuilder sb = new StringBuilder("Validation failed: ");
        for (FieldError fe : ex.getBindingResult().getFieldErrors()) {
            sb.append(fe.getField()).append(" ").append(fe.getDefaultMessage()).append("; ");
        }
        body.put("message", sb.toString().trim());
        body.put("errorType", "ValidationError");

        log.warn("[{}] Validation error: {}", rid, sb.toString().trim());
        return new ResponseEntity<>(body, HttpStatus.BAD_REQUEST);
    }

    /**
     * Handle business exceptions (IllegalArgumentException, Ontop exceptions) — 400.
     * These are expected errors that the caller should handle.
     */
    @ExceptionHandler({IllegalArgumentException.class, RuntimeException.class})
    public ResponseEntity<Map<String, Object>> handleBusiness(RuntimeException ex) {
        String rid = shortId();
        Map<String, Object> body = new HashMap<>();
        body.put("success", false);
        body.put("requestId", rid);
        body.put("message", ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName());
        body.put("errorType", ex.getClass().getSimpleName());

        log.warn("[{}] Business error ({}): {}", rid, ex.getClass().getSimpleName(), ex.getMessage());
        return new ResponseEntity<>(body, HttpStatus.BAD_REQUEST);
    }

    /**
     * Handle checked exceptions (Ontop API throws Exception) — 500.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleInternal(Exception ex) {
        String rid = shortId();
        Map<String, Object> body = new HashMap<>();
        body.put("success", false);
        body.put("requestId", rid);
        body.put("message", "Internal error: " + (ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName()));
        body.put("errorType", ex.getClass().getSimpleName());

        log.error("[{}] Internal error: {}", rid, ex.getMessage(), ex);
        return new ResponseEntity<>(body, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    private static String shortId() {
        return UUID.randomUUID().toString().substring(0, 8);
    }
}
