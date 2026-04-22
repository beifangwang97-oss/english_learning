package com.kineticscholar.userservice.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Keeps passage-related schema backward compatible for environments
 * that already have historical data before new columns are introduced.
 */
@Component
public class PassageSchemaMigrationRunner {

    private static final Logger log = LoggerFactory.getLogger(PassageSchemaMigrationRunner.class);

    private final JdbcTemplate jdbcTemplate;

    public PassageSchemaMigrationRunner(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    public void ensurePassageSchema() {
        jdbcTemplate.execute(
                "ALTER TABLE IF EXISTS passages " +
                "ADD COLUMN IF NOT EXISTS unit_no integer"
        );
        jdbcTemplate.execute(
                "ALTER TABLE IF EXISTS passages " +
                "ADD COLUMN IF NOT EXISTS is_starter boolean"
        );
        jdbcTemplate.execute(
                "UPDATE passages SET is_starter = false WHERE is_starter IS NULL"
        );
        jdbcTemplate.execute(
                "ALTER TABLE IF EXISTS passages " +
                "ALTER COLUMN is_starter SET DEFAULT false"
        );
        jdbcTemplate.execute(
                "ALTER TABLE IF EXISTS passages " +
                "ALTER COLUMN is_starter SET NOT NULL"
        );
        jdbcTemplate.execute(
                "ALTER TABLE IF EXISTS passages " +
                "ADD COLUMN IF NOT EXISTS labels_text text"
        );
        jdbcTemplate.execute(
                "ALTER TABLE IF EXISTS passages " +
                "ADD COLUMN IF NOT EXISTS display_label varchar(100)"
        );
        jdbcTemplate.execute(
                "ALTER TABLE IF EXISTS passages " +
                "ADD COLUMN IF NOT EXISTS task_kind varchar(100)"
        );
        jdbcTemplate.execute(
                "ALTER TABLE IF EXISTS passages " +
                "ADD COLUMN IF NOT EXISTS matched_labels_text text"
        );
        jdbcTemplate.execute(
                "ALTER TABLE IF EXISTS passages " +
                "ADD COLUMN IF NOT EXISTS source_line integer"
        );
        jdbcTemplate.execute(
                "ALTER TABLE IF EXISTS passages " +
                "ADD COLUMN IF NOT EXISTS raw_scope_line text"
        );
        jdbcTemplate.execute(
                "ALTER TABLE IF EXISTS passages " +
                "ALTER COLUMN label TYPE varchar(100)"
        );

        // Step 1: ensure column exists (nullable first for compatibility with existing rows)
        jdbcTemplate.execute(
                "ALTER TABLE IF EXISTS passage_sentences " +
                "ADD COLUMN IF NOT EXISTS newline_after integer"
        );

        // Step 2: backfill existing rows
        jdbcTemplate.execute(
                "UPDATE passage_sentences SET newline_after = 0 WHERE newline_after IS NULL"
        );

        // Step 3: enforce default and NOT NULL going forward
        jdbcTemplate.execute(
                "ALTER TABLE IF EXISTS passage_sentences " +
                "ALTER COLUMN newline_after SET DEFAULT 0"
        );
        jdbcTemplate.execute(
                "ALTER TABLE IF EXISTS passage_sentences " +
                "ALTER COLUMN newline_after SET NOT NULL"
        );

        log.info("Schema check complete: passage fields and passage_sentences.newline_after are ready.");
    }
}
