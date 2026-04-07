package com.tianzhi.ontop.endpoint.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

@Component
public class InternalSecretInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(InternalSecretInterceptor.class);

    @Value("${ontop.internal-secret:}")
    private String internalSecret;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if (internalSecret == null || internalSecret.isBlank()) {
            return true;
        }

        String provided = request.getHeader("X-Internal-Secret");
        if (provided != null && provided.equals(internalSecret)) {
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
