package projects

import (
    "context"
    "database/sql"
    "errors"
    "fmt"
    "time"

    "codex-ui/internal/logging"
    "codex-ui/internal/storage/discovery"
)

type Service struct {
    repo   *discovery.Repository
    logger logging.Logger
}

func NewService(repo *discovery.Repository, logger logging.Logger) *Service {
    if logger == nil { logger = logging.Nop() }
    return &Service{repo: repo, logger: logger}
}

type ProjectDTO struct {
	ID           int64     `json:"id"`
	Path         string    `json:"path"`
	DisplayName  string    `json:"displayName,omitempty"`
	Tags         []string  `json:"tags,omitempty"`
	LastOpenedAt time.Time `json:"lastOpenedAt,omitempty" ts_type:"string"`
	CreatedAt    time.Time `json:"createdAt" ts_type:"string"`
	UpdatedAt    time.Time `json:"updatedAt" ts_type:"string"`
}

type RegisterProjectRequest struct {
	Path        string   `json:"path"`
	DisplayName string   `json:"displayName,omitempty"`
	Tags        []string `json:"tags,omitempty"`
}

func (s *Service) List(ctx context.Context) ([]ProjectDTO, error) {
	records, err := s.repo.ListProjects(ctx)
	if err != nil {
		return nil, err
	}
	list := make([]ProjectDTO, 0, len(records))
	for _, record := range records {
		list = append(list, mapProject(record))
	}
	return list, nil
}

func (s *Service) Register(ctx context.Context, req RegisterProjectRequest) (ProjectDTO, error) {
	if req.Path == "" {
		return ProjectDTO{}, errors.New("project path is required")
	}

	project, err := s.repo.UpsertProject(ctx, discovery.UpsertProjectParams{
		Path:        req.Path,
		DisplayName: req.DisplayName,
		Tags:        req.Tags,
	})
	if err != nil {
		return ProjectDTO{}, err
	}

	return mapProject(project), nil
}

func (s *Service) Remove(ctx context.Context, id int64) error {
	if err := s.repo.DeleteProject(ctx, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("project %d not found", id)
		}
		return err
	}
	return nil
}

func (s *Service) MarkOpened(ctx context.Context, id int64) error {
	return s.repo.MarkProjectOpened(ctx, id, time.Now().UTC())
}

func mapProject(p discovery.Project) ProjectDTO {
	return ProjectDTO{
		ID:           p.ID,
		Path:         p.Path,
		DisplayName:  p.DisplayName,
		Tags:         p.Tags,
		LastOpenedAt: p.LastOpenedAt,
		CreatedAt:    p.CreatedAt,
		UpdatedAt:    p.UpdatedAt,
	}
}
