package ui

import (
	"context"
	"fmt"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type API struct{ ctxFn func() context.Context }

func NewAPI(ctxProvider func() context.Context) *API { return &API{ctxFn: ctxProvider} }

type OpenDialogOptions struct {
	Title            string `json:"title"`
	DefaultDirectory string `json:"defaultDirectory,omitempty"`
}

func (a *API) SelectProjectDirectory(defaultDirectory string) (string, error) {
	if a.ctxFn == nil {
		return "", fmt.Errorf("application context not initialised")
	}
	ctx := a.ctxFn()
	if ctx == nil {
		return "", fmt.Errorf("application context not initialised")
	}
	options := wailsruntime.OpenDialogOptions{Title: "Select a project directory"}
	if defaultDirectory != "" {
		options.DefaultDirectory = defaultDirectory
	}
	return wailsruntime.OpenDirectoryDialog(ctx, options)
}
