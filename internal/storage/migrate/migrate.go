package migrate

import (
	"database/sql"
	"embed"
	"fmt"

	"github.com/pressly/goose/v3"
)

//go:embed sql/*.sql
var embeddedMigrations embed.FS

const migrationsDir = "sql"

func init() {
	goose.SetBaseFS(embeddedMigrations)
}

// Up runs all pending migrations against the provided database.
func Up(db *sql.DB) error {
	if err := goose.SetDialect("sqlite"); err != nil {
		return fmt.Errorf("set goose dialect: %w", err)
	}
	if err := goose.Up(db, migrationsDir); err != nil {
		return fmt.Errorf("apply migrations: %w", err)
	}
	return nil
}
