package com.kineticscholar.apigateway.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;

@Component
public class SessionValidationFilter implements GlobalFilter, Ordered {

    private final WebClient webClient;

    public SessionValidationFilter(@Value("${auth.user-service-base-url:http://localhost:8081}") String userServiceBaseUrl) {
        this.webClient = WebClient.builder()
                .baseUrl(userServiceBaseUrl)
                .build();
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String path = request.getURI().getPath();

        if (shouldSkip(path, request.getMethod())) {
            return chain.filter(exchange);
        }

        String authHeader = request.getHeaders().getFirst("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return writeJsonError(exchange.getResponse(), HttpStatus.UNAUTHORIZED, "{\"error\":\"Missing or invalid Authorization header\",\"code\":\"MISSING_AUTH\"}");
        }

        return webClient.get()
                .uri("/api/users/session/validate")
                .header("Authorization", authHeader)
                .exchangeToMono(clientResponse -> {
                    if (clientResponse.statusCode().is2xxSuccessful()) {
                        return chain.filter(exchange);
                    }
                    return clientResponse.bodyToMono(String.class)
                            .defaultIfEmpty("{\"error\":\"Unauthorized\",\"code\":\"UNAUTHORIZED\"}")
                            .flatMap(body -> writeJsonError(exchange.getResponse(), clientResponse.statusCode(), body));
                });
    }

    @Override
    public int getOrder() {
        return -100;
    }

    private boolean shouldSkip(String path, HttpMethod method) {
        if (method == HttpMethod.OPTIONS) {
            return true;
        }
        if (path == null) {
            return true;
        }
        if (path.startsWith("/actuator/")) {
            return true;
        }
        if (!path.startsWith("/api/")) {
            return true;
        }
        return "/api/login".equals(path)
                || "/api/users/login".equals(path)
                || "/api/register".equals(path)
                || "/api/users/register".equals(path);
    }

    private Mono<Void> writeJsonError(ServerHttpResponse response, HttpStatusCode status, String body) {
        response.setStatusCode(status);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        DataBuffer buffer = response.bufferFactory().wrap(body.getBytes(StandardCharsets.UTF_8));
        return response.writeWith(Mono.just(buffer));
    }
}
