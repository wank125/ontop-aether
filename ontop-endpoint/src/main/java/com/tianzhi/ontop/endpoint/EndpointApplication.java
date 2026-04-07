package com.tianzhi.ontop.endpoint;

import com.tianzhi.ontop.endpoint.config.InternalSecretInterceptor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@SpringBootApplication
public class EndpointApplication {

    private static final Logger log = LoggerFactory.getLogger(EndpointApplication.class);

    public static void main(String[] args) {
        SpringApplication.run(EndpointApplication.class, args);
    }

    @Bean
    public WebMvcConfigurer corsConfigurer(InternalSecretInterceptor secretInterceptor) {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/**").allowedOrigins("*");
            }

            @Override
            public void addInterceptors(InterceptorRegistry registry) {
                registry.addInterceptor(secretInterceptor)
                        .addPathPatterns(
                                "/api/v1/repositories/**",
                                "/ontop/restart",
                                "/ontop/*/restart"
                        )
                        .excludePathPatterns("/api/v1/repositories/*/health");
            }
        };
    }
}
