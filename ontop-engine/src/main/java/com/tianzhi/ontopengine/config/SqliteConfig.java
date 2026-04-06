package com.tianzhi.ontopengine.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteDataSource;

import java.nio.file.Files;
import java.nio.file.Path;

@Configuration
public class SqliteConfig {

    private static final Logger log = LoggerFactory.getLogger(SqliteConfig.class);

    @Value("${sqlite.db-path}")
    private String dbPath;

    @Bean
    public javax.sql.DataSource sqliteDataSource() throws Exception {
        Path path = Path.of(dbPath);
        Files.createDirectories(path.getParent());

        SQLiteConfig config = new SQLiteConfig();
        config.setJournalMode(SQLiteConfig.JournalMode.WAL);
        config.setBusyTimeout(5000);
        config.enforceForeignKeys(true);

        SQLiteDataSource ds = new SQLiteDataSource(config);
        ds.setUrl("jdbc:sqlite:" + path.toAbsolutePath());

        log.info("SQLite datasource configured: {}", path.toAbsolutePath());
        return ds;
    }

    @Bean
    public JdbcTemplate jdbcTemplate(javax.sql.DataSource sqliteDataSource) {
        return new JdbcTemplate(sqliteDataSource);
    }

    @Bean
    public CommandLineRunner initSchema(JdbcTemplate jdbc) {
        return args -> {
            jdbc.execute("CREATE TABLE IF NOT EXISTS datasources (" +
                    "id TEXT PRIMARY KEY," +
                    "name TEXT NOT NULL," +
                    "jdbc_url TEXT NOT NULL," +
                    "\"user\" TEXT NOT NULL," +
                    "password_encrypted TEXT NOT NULL," +
                    "driver TEXT NOT NULL DEFAULT 'org.postgresql.Driver'," +
                    "created_at TEXT NOT NULL," +
                    "updated_at TEXT)");

            jdbc.execute("CREATE TABLE IF NOT EXISTS endpoint_registry (" +
                    "id TEXT PRIMARY KEY," +
                    "ds_id TEXT NOT NULL UNIQUE," +
                    "ds_name TEXT NOT NULL," +
                    "active_dir TEXT NOT NULL," +
                    "ontology_path TEXT NOT NULL DEFAULT ''," +
                    "mapping_path TEXT NOT NULL DEFAULT ''," +
                    "properties_path TEXT NOT NULL DEFAULT ''," +
                    "endpoint_url TEXT NOT NULL DEFAULT ''," +
                    "last_bootstrap TEXT," +
                    "is_current INTEGER NOT NULL DEFAULT 0," +
                    "created_at TEXT NOT NULL," +
                    "updated_at TEXT)");

            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_endpoint_current ON endpoint_registry(is_current)");

            jdbc.execute("CREATE TABLE IF NOT EXISTS query_history (" +
                    "id TEXT PRIMARY KEY," +
                    "query TEXT NOT NULL," +
                    "timestamp TEXT NOT NULL," +
                    "result_count INTEGER," +
                    "source_ip TEXT DEFAULT ''," +
                    "caller TEXT DEFAULT 'web'," +
                    "duration_ms REAL," +
                    "status TEXT DEFAULT 'ok'," +
                    "error_message TEXT DEFAULT '')");

            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_history_ts ON query_history(timestamp DESC)");
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_history_caller ON query_history(caller)");

            log.info("SQLite schema initialized at {}", dbPath);
        };
    }
}
