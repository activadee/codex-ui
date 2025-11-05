package projects

import (
    "context"
)

// API exposes project-related actions to the frontend via Wails binding.
type API struct {
    svc *Service
}

func NewAPI(svc *Service) *API { return &API{svc: svc} }

func (a *API) ListProjects() ([]ProjectDTO, error) { return a.svc.List(context.Background()) }
func (a *API) RegisterProject(req RegisterProjectRequest) (ProjectDTO, error) {
    return a.svc.Register(context.Background(), req)
}
func (a *API) DeleteProject(id int64) error { return a.svc.Remove(context.Background(), id) }
func (a *API) MarkProjectOpened(id int64) error { return a.svc.MarkOpened(context.Background(), id) }

