package com.kineticscholar.userservice.service.impl;

import com.kineticscholar.userservice.model.User;
import com.kineticscholar.userservice.model.UserSession;
import com.kineticscholar.userservice.repository.UserRepository;
import com.kineticscholar.userservice.repository.UserSessionRepository;
import com.kineticscholar.userservice.service.SessionAuthException;
import com.kineticscholar.userservice.service.SessionAuthService;
import com.kineticscholar.userservice.util.JwtUtil;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

@Service
public class SessionAuthServiceImpl implements SessionAuthService {

    private static final String STATUS_ACTIVE = "ACTIVE";
    private static final String STATUS_REVOKED = "REVOKED";

    private final UserRepository userRepository;
    private final UserSessionRepository userSessionRepository;
    private final JwtUtil jwtUtil;
    private final int jwtExpirationSeconds;

    public SessionAuthServiceImpl(UserRepository userRepository,
                                  UserSessionRepository userSessionRepository,
                                  JwtUtil jwtUtil,
                                  @Value("${jwt.expiration}") int jwtExpirationSeconds) {
        this.userRepository = userRepository;
        this.userSessionRepository = userSessionRepository;
        this.jwtUtil = jwtUtil;
        this.jwtExpirationSeconds = jwtExpirationSeconds;
    }

    @Override
    @Transactional
    public String issueLoginToken(User user, String ipAddress, String userAgent) {
        LocalDateTime now = LocalDateTime.now();
        userSessionRepository.revokeActiveByUserId(user.getId(), "REPLACED_BY_NEW_LOGIN", now);

        String sessionId = UUID.randomUUID().toString().replace("-", "");
        UserSession session = new UserSession();
        session.setSessionId(sessionId);
        session.setUserId(user.getId());
        session.setUsername(user.getUsername());
        session.setStatus(STATUS_ACTIVE);
        session.setClientType("web");
        session.setIpAddress(trimToNull(ipAddress, 64));
        session.setUserAgent(trimToNull(userAgent, 512));
        session.setIssuedAt(now);
        session.setExpiresAt(now.plusSeconds(Math.max(jwtExpirationSeconds, 60)));
        session.setLastSeenAt(now);
        userSessionRepository.save(session);

        user.setOnlineStatus(1);
        user.setLastActiveAt(now);
        userRepository.save(user);

        return jwtUtil.generateToken(user.getUsername(), user.getRole(), sessionId);
    }

    @Override
    @Transactional
    public User validateTokenAndGetUser(String token) {
        if (token == null || token.isBlank() || !jwtUtil.validateToken(token)) {
            throw new SessionAuthException(HttpStatus.UNAUTHORIZED, "INVALID_TOKEN", "Invalid token");
        }

        String username = jwtUtil.getUsernameFromToken(token);
        String sid = jwtUtil.getSessionIdFromToken(token);
        if (username == null || username.isBlank() || sid == null || sid.isBlank()) {
            throw new SessionAuthException(HttpStatus.UNAUTHORIZED, "INVALID_TOKEN", "Invalid token");
        }

        UserSession session = userSessionRepository.findBySessionId(sid)
                .orElseThrow(() -> new SessionAuthException(HttpStatus.UNAUTHORIZED, "SESSION_REVOKED", "账号已在别处登录，被顶号下线"));

        LocalDateTime now = LocalDateTime.now();
        if (!STATUS_ACTIVE.equalsIgnoreCase(session.getStatus())
                || session.getRevokedAt() != null
                || session.getExpiresAt() == null
                || now.isAfter(session.getExpiresAt())) {
            throw new SessionAuthException(HttpStatus.UNAUTHORIZED, "SESSION_REVOKED", "账号已在别处登录，被顶号下线");
        }
        if (!username.equals(session.getUsername())) {
            throw new SessionAuthException(HttpStatus.UNAUTHORIZED, "INVALID_TOKEN", "Invalid token");
        }

        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new SessionAuthException(HttpStatus.UNAUTHORIZED, "USER_NOT_FOUND", "User not found"));

        if (!user.isActive()) {
            revokeBySessionIdSafe(sid, "ACCOUNT_DISABLED");
            syncOnlineStatus(user);
            throw new SessionAuthException(HttpStatus.FORBIDDEN, "ACCOUNT_DISABLED", "账号已停用");
        }
        LocalDate today = LocalDate.now();
        if (user.getExpireDate() == null || today.isAfter(user.getExpireDate())) {
            revokeBySessionIdSafe(sid, "ACCOUNT_EXPIRED");
            syncOnlineStatus(user);
            throw new SessionAuthException(HttpStatus.FORBIDDEN, "ACCOUNT_EXPIRED", "账号已到期");
        }

        session.setLastSeenAt(now);
        userSessionRepository.save(session);
        user.setOnlineStatus(1);
        user.setLastActiveAt(now);
        userRepository.save(user);

        return user;
    }

    @Override
    public User validateAuthorizationHeader(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            throw new SessionAuthException(HttpStatus.UNAUTHORIZED, "MISSING_AUTH", "Missing or invalid Authorization header");
        }
        String token = authHeader.substring(7);
        return validateTokenAndGetUser(token);
    }

    @Override
    @Transactional
    public void logoutByToken(String token) {
        if (token == null || token.isBlank() || !jwtUtil.validateToken(token)) {
            throw new SessionAuthException(HttpStatus.UNAUTHORIZED, "INVALID_TOKEN", "Invalid token");
        }
        String sid = jwtUtil.getSessionIdFromToken(token);
        String username = jwtUtil.getUsernameFromToken(token);
        if (sid == null || sid.isBlank() || username == null || username.isBlank()) {
            throw new SessionAuthException(HttpStatus.UNAUTHORIZED, "INVALID_TOKEN", "Invalid token");
        }
        revokeBySessionIdSafe(sid, "LOGOUT");
        Optional<User> userOpt = userRepository.findByUsername(username);
        userOpt.ifPresent(this::syncOnlineStatus);
    }

    @Override
    @Transactional
    public void revokeAllSessionsByUserId(Long userId, String reason) {
        LocalDateTime now = LocalDateTime.now();
        userSessionRepository.revokeActiveByUserId(userId, reason == null ? "REVOKED" : reason, now);
        userRepository.findById(userId).ifPresent(this::syncOnlineStatus);
    }

    private void revokeBySessionIdSafe(String sid, String reason) {
        userSessionRepository.revokeBySessionId(sid, reason == null ? "REVOKED" : reason, LocalDateTime.now());
    }

    private void syncOnlineStatus(User user) {
        long activeCount = userSessionRepository.countByUserIdAndStatusAndExpiresAtAfter(
                user.getId(),
                STATUS_ACTIVE,
                LocalDateTime.now()
        );
        user.setOnlineStatus(activeCount > 0 ? 1 : 0);
        user.setLastActiveAt(LocalDateTime.now());
        userRepository.save(user);
    }

    private String trimToNull(String value, int maxLen) {
        if (value == null) return null;
        String trimmed = value.trim();
        if (trimmed.isBlank()) return null;
        if (trimmed.length() <= maxLen) return trimmed;
        return trimmed.substring(0, maxLen);
    }
}
