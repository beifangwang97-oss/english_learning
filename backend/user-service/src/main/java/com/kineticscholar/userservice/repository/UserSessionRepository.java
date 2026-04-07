package com.kineticscholar.userservice.repository;

import com.kineticscholar.userservice.model.UserSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Optional;

@Repository
public interface UserSessionRepository extends JpaRepository<UserSession, Long> {

    Optional<UserSession> findBySessionId(String sessionId);

    long countByUserIdAndStatusAndExpiresAtAfter(Long userId, String status, LocalDateTime now);

    @Modifying
    @Query("""
            update UserSession s
            set s.status = 'REVOKED',
                s.revokedAt = :now,
                s.updatedAt = :now,
                s.revokeReason = :reason
            where s.userId = :userId
              and s.status = 'ACTIVE'
            """)
    int revokeActiveByUserId(@Param("userId") Long userId,
                             @Param("reason") String reason,
                             @Param("now") LocalDateTime now);

    @Modifying
    @Query("""
            update UserSession s
            set s.status = 'REVOKED',
                s.revokedAt = :now,
                s.updatedAt = :now,
                s.revokeReason = :reason
            where s.sessionId = :sessionId
              and s.status = 'ACTIVE'
            """)
    int revokeBySessionId(@Param("sessionId") String sessionId,
                          @Param("reason") String reason,
                          @Param("now") LocalDateTime now);
}
