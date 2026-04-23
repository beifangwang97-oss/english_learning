package com.kineticscholar.userservice.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class StudentCheckInSchemaMigrationRunner {

    private static final Logger log = LoggerFactory.getLogger(StudentCheckInSchemaMigrationRunner.class);

    private final JdbcTemplate jdbcTemplate;

    public StudentCheckInSchemaMigrationRunner(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    public void ensureStudentCheckInSchema() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS student_check_in_records (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    checkin_date DATE NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """);
        jdbcTemplate.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uk_student_checkin_user_date
                ON student_check_in_records (user_id, checkin_date)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_student_checkin_user_date
                ON student_check_in_records (user_id, checkin_date DESC)
                """);
        log.info("Schema check complete: student_check_in_records is ready.");
    }
}
