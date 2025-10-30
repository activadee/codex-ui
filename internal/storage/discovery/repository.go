package discovery

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

type Repository struct {
    db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
    return &Repository{db: db}
}

type Project struct {
    ID           int64     `json:"id"`
    Path         string    `json:"path"`
    DisplayName  string    `json:"displayName,omitempty"`
    Tags         []string  `json:"tags,omitempty"`
    LastOpenedAt time.Time `json:"lastOpenedAt,omitempty"`
    CreatedAt    time.Time `json:"createdAt"`
    UpdatedAt    time.Time `json:"updatedAt"`
}

type UpsertProjectParams struct {
	Path        string
	DisplayName string
	Tags        []string
	LastOpened  *time.Time
}

func (r *Repository) ListProjects(ctx context.Context) ([]Project, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, path, display_name, tags, last_opened_at, created_at, updated_at
		FROM projects
		ORDER BY COALESCE(last_opened_at, updated_at) DESC, id DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("query projects: %w", err)
	}
	defer rows.Close()

	var projects []Project
	for rows.Next() {
		var (
			p       Project
			display sql.NullString
			tags    sql.NullString
			last    sql.NullTime
		)
		if err := rows.Scan(&p.ID, &p.Path, &display, &tags, &last, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan project: %w", err)
		}
		if display.Valid {
			p.DisplayName = display.String
		}
		decodedTags, err := decodeTags(tags)
		if err != nil {
			return nil, fmt.Errorf("decode tags for project %s: %w", p.Path, err)
		}
		p.Tags = decodedTags
		if last.Valid {
			p.LastOpenedAt = last.Time
		}
		projects = append(projects, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate projects: %w", err)
	}
	return projects, nil
}

func (r *Repository) UpsertProject(ctx context.Context, params UpsertProjectParams) (Project, error) {
	tagPayload, err := encodeTags(params.Tags)
	if err != nil {
		return Project{}, err
	}

	_, err = r.db.ExecContext(ctx, `
		INSERT INTO projects (path, display_name, tags, last_opened_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(path) DO UPDATE SET
			display_name = excluded.display_name,
			tags = excluded.tags,
			last_opened_at = COALESCE(excluded.last_opened_at, projects.last_opened_at),
			updated_at = CURRENT_TIMESTAMP
	`, params.Path, nullIfEmpty(params.DisplayName), tagPayload, params.LastOpened)
	if err != nil {
		return Project{}, fmt.Errorf("upsert project: %w", err)
	}

	return r.GetProjectByPath(ctx, params.Path)
}

func (r *Repository) GetProjectByPath(ctx context.Context, path string) (Project, error) {
	var (
		p       Project
		display sql.NullString
		tags    sql.NullString
		last    sql.NullTime
	)
	err := r.db.QueryRowContext(ctx, `
		SELECT id, path, display_name, tags, last_opened_at, created_at, updated_at
		FROM projects
		WHERE path = ?
	`, path).Scan(&p.ID, &p.Path, &display, &tags, &last, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return Project{}, fmt.Errorf("project not found: %s", path)
		}
		return Project{}, fmt.Errorf("select project: %w", err)
	}
	if display.Valid {
		p.DisplayName = display.String
	}
	decodedTags, err := decodeTags(tags)
	if err != nil {
		return Project{}, fmt.Errorf("decode tags: %w", err)
	}
	p.Tags = decodedTags
	if last.Valid {
		p.LastOpenedAt = last.Time
	}
	return p, nil
}

// GetProjectByID retrieves a project by numeric identifier.
func (r *Repository) GetProjectByID(ctx context.Context, id int64) (Project, error) {
    var (
        p       Project
        display sql.NullString
        tags    sql.NullString
        last    sql.NullTime
    )
    err := r.db.QueryRowContext(ctx, `
        SELECT id, path, display_name, tags, last_opened_at, created_at, updated_at
        FROM projects
        WHERE id = ?
    `, id).Scan(&p.ID, &p.Path, &display, &tags, &last, &p.CreatedAt, &p.UpdatedAt)
    if err != nil {
        if err == sql.ErrNoRows {
            return Project{}, fmt.Errorf("project %d not found", id)
        }
        return Project{}, fmt.Errorf("select project by id: %w", err)
    }
    if display.Valid {
        p.DisplayName = display.String
    }
    decodedTags, err := decodeTags(tags)
    if err != nil {
        return Project{}, fmt.Errorf("decode tags: %w", err)
    }
    p.Tags = decodedTags
    if last.Valid {
        p.LastOpenedAt = last.Time
    }
    return p, nil
}

func (r *Repository) DeleteProject(ctx context.Context, id int64) error {
	res, err := r.db.ExecContext(ctx, `DELETE FROM projects WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete project: %w", err)
	}
	if affected, _ := res.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *Repository) MarkProjectOpened(ctx context.Context, id int64, openedAt time.Time) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE projects
		SET last_opened_at = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, openedAt, id)
	if err != nil {
		return fmt.Errorf("update last_opened_at: %w", err)
	}
	if affected, _ := res.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func encodeTags(tags []string) (interface{}, error) {
	if len(tags) == 0 {
		return nil, nil
	}
	payload, err := json.Marshal(tags)
	if err != nil {
		return nil, err
	}
	return string(payload), nil
}

func decodeTags(raw sql.NullString) ([]string, error) {
	if !raw.Valid || raw.String == "" {
		return nil, nil
	}
	var tags []string
	if err := json.Unmarshal([]byte(raw.String), &tags); err != nil {
		return nil, err
	}
	return tags, nil
}

func nullIfEmpty(value string) interface{} {
	if value == "" {
		return nil
	}
	return value
}
