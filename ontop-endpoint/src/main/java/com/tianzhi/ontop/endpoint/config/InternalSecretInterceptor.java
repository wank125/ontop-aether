package com.tianzhi.ontop.endpoint.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.annotation.PostConstruct;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Component
public class InternalSecretInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(InternalSecretInterceptor.class);

    @Value("${ontop.internal-secret:}")
    private String internalSecret;

    private static final String DEFAULT_SECRET = "changeme-in-production";

    @PostConstruct
    public void warnOnDefaultSecret() {
        if (internalSecret == null || internalSecret.isBlank()) {
            log.warn("⚠ ONTOP_INTERNAL_SECRET is not set — management API authentication is DISABLED. Set a strong secret in production.");
        } else if (internalSecret.equals(DEFAULT_SECRET)) {
            log.warn("⚠ ONTOP_INTERNAL_SECRET is using the default value '{}'. Change it for production deployments.", DEFAULT_SECRET);
        }
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if (internalSecret == null || internalSecret.isBlank()) {
            return true;
        }

        String provided = request.getHeader("X-Internal-Secret");
        if (provided != null && MessageDigest.isEqual(
                provided.getBytes(StandardCharsets.UTF_8),
                internalSecret.getBytes(StandardCharsets.UTF_8))) {
            return true;
        }

        log.warn("Unauthorized management API access: {} {} from={}",
                request.getMethod(), request.getRequestURI(), request.getRemoteAddr());
        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"Unauthorized: valid X-Internal-Secret header required\"}");
        return false;
    }
}
