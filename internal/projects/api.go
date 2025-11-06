package projects

import (
    "context"
    "codex-ui/internal/logging"
)

// API exposes project-related actions to the frontend via Wails binding.
type API struct {
    svc *Service
    log logging.Logger
}

func NewAPI(svc *Service, logger logging.Logger) *API {
    if logger == nil { logger = logging.Nop() }
    return &API{svc: svc, log: logger}
}

func (a *API) ListProjects() ([]ProjectDTO, error) { return a.svc.List(context.Background()) }
func (a *API) RegisterProject(req RegisterProjectRequest) (ProjectDTO, error) {
    return a.svc.Register(context.Background(), req)
}
func (a *API) DeleteProject(id int64) error { return a.svc.Remove(context.Background(), id) }
func (a *API) MarkProjectOpened(id int64) error { return a.svc.MarkOpened(context.Background(), id) }
