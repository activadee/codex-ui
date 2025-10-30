package discovery

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"codex-ui/internal/storage/migrate"

	_ "modernc.org/sqlite"
)

func newTestRepository(t *testing.T) (*Repository, *sql.DB) {
	t.Helper()

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatalf("open in-memory database: %v", err)
	}
	db.SetMaxOpenConns(1)
	db.SetConnMaxLifetime(0)

	t.Cleanup(func() {
		_ = db.Close()
	})

	if err := migrate.Up(db); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	return NewRepository(db), db
}

func TestRepositoryUpsertAndRetrieve(t *testing.T) {
	repo, _ := newTestRepository(t)
	ctx := context.Background()

	project, err := repo.UpsertProject(ctx, UpsertProjectParams{
		Path:        "/tmp/project-one",
		DisplayName: "Project One",
		Tags:        []string{"cli", "codex"},
	})
	if err != nil {
		t.Fatalf("upsert project: %v", err)
	}

	if project.ID == 0 {
		t.Fatalf("expected persisted project to have ID, got 0")
	}

	if project.DisplayName != "Project One" {
		t.Fatalf("unexpected display name: %s", project.DisplayName)
	}

	if got := len(project.Tags); got != 2 {
		t.Fatalf("expected 2 tags, got %d", got)
	}

	loaded, err := repo.GetProjectByPath(ctx, "/tmp/project-one")
	if err != nil {
		t.Fatalf("get project by path: %v", err)
	}

	if loaded.ID != project.ID {
		t.Fatalf("expected ID %d, got %d", project.ID, loaded.ID)
	}
	if !equalStringSlices(loaded.Tags, []string{"cli", "codex"}) {
		t.Fatalf("unexpected tags: %v", loaded.Tags)
	}

	list, err := repo.ListProjects(ctx)
	if err != nil {
		t.Fatalf("list projects: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 project, got %d", len(list))
	}
}

func TestRepositoryUpdatePreservesLastOpened(t *testing.T) {
	repo, _ := newTestRepository(t)
	ctx := context.Background()

	project, err := repo.UpsertProject(ctx, UpsertProjectParams{
		Path:        "/tmp/project-two",
		DisplayName: "Project Two",
		Tags:        []string{"initial"},
	})
	if err != nil {
		t.Fatalf("upsert project: %v", err)
	}

	markTime := time.Now().UTC().Truncate(time.Second)
	if err := repo.MarkProjectOpened(ctx, project.ID, markTime); err != nil {
		t.Fatalf("mark project opened: %v", err)
	}

	updated, err := repo.UpsertProject(ctx, UpsertProjectParams{
		Path:        "/tmp/project-two",
		DisplayName: "Project Two v2",
		Tags:        []string{"updated"},
	})
	if err != nil {
		t.Fatalf("upsert project after mark: %v", err)
	}

	if updated.DisplayName != "Project Two v2" {
		t.Fatalf("unexpected display name: %s", updated.DisplayName)
	}
	if !markTime.Equal(updated.LastOpenedAt) {
		t.Fatalf("expected last opened %v, got %v", markTime, updated.LastOpenedAt)
	}
	if !equalStringSlices(updated.Tags, []string{"updated"}) {
		t.Fatalf("unexpected tags after update: %v", updated.Tags)
	}
}

func TestRepositoryDelete(t *testing.T) {
	repo, _ := newTestRepository(t)
	ctx := context.Background()

	project, err := repo.UpsertProject(ctx, UpsertProjectParams{
		Path: "/tmp/project-delete",
	})
	if err != nil {
		t.Fatalf("upsert project: %v", err)
	}

	if err := repo.DeleteProject(ctx, project.ID); err != nil {
		t.Fatalf("delete project: %v", err)
	}

	if err := repo.DeleteProject(ctx, project.ID); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows when deleting missing project, got %v", err)
	}
}

func TestRepositoryListFailsOnInvalidTags(t *testing.T) {
	repo, db := newTestRepository(t)
	ctx := context.Background()

	if _, err := db.ExecContext(ctx, `
		INSERT INTO projects (path, tags) VALUES (?, ?)
	`, "/tmp/project-invalid", "{invalid json"); err != nil {
		t.Fatalf("insert invalid project: %v", err)
	}

	_, err := repo.ListProjects(ctx)
	if err == nil {
		t.Fatalf("expected error when decoding invalid tags")
	}
	if !strings.Contains(err.Error(), "decode tags") {
		t.Fatalf("expected decode tags error, got %v", err)
	}
}

func equalStringSlices(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
