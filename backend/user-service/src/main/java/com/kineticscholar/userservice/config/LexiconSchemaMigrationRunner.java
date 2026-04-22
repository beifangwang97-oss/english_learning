package com.kineticscholar.userservice.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class LexiconSchemaMigrationRunner {

    private static final Logger log = LoggerFactory.getLogger(LexiconSchemaMigrationRunner.class);

    private final JdbcTemplate jdbcTemplate;

    public LexiconSchemaMigrationRunner(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    public void ensureLexiconTextColumns() {
        ensureOidColumnConvertedToText("lexicon_entries", "syllable_pronunciation");
        ensureOidColumnConvertedToText("lexicon_entries", "memory_tip");
        log.info("Schema check complete: lexicon_entries text columns are ready.");
    }

    private void ensureOidColumnConvertedToText(String tableName, String columnName) {
        jdbcTemplate.execute("""
                DO $$
                DECLARE
                    column_udt text;
                BEGIN
                    SELECT c.udt_name
                      INTO column_udt
                      FROM information_schema.columns c
                     WHERE c.table_name = '%s'
                       AND c.column_name = '%s';

                    IF column_udt IS NULL THEN
                        RETURN;
                    END IF;

                    IF column_udt = 'oid' THEN
                        EXECUTE format(
                            'ALTER TABLE %%I ALTER COLUMN %%I TYPE text USING ' ||
                            'CASE WHEN %%I IS NULL THEN NULL ELSE convert_from(lo_get(%%I), ''UTF8'') END',
                            '%s',
                            '%s',
                            '%s',
                            '%s'
                        );
                    ELSIF column_udt <> 'text' THEN
                        EXECUTE format(
                            'ALTER TABLE %%I ALTER COLUMN %%I TYPE text USING %%I::text',
                            '%s',
                            '%s',
                            '%s'
                        );
                    END IF;
                END $$;
                """.formatted(
                tableName,
                columnName,
                tableName,
                columnName,
                columnName,
                columnName,
                tableName,
                columnName,
                columnName
        ));
    }
}
