package com.kineticscholar.userservice.service;

import com.kineticscholar.userservice.model.User;

public interface SessionAuthService {
    String issueLoginToken(User user, String ipAddress, String userAgent);
    User validateTokenAndGetUser(String token);
    User validateAuthorizationHeader(String authHeader);
    void logoutByToken(String token);
    void revokeAllSessionsByUserId(Long userId, String reason);
}
