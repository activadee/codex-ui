package terminal

// API wraps Manager with Wails-friendly methods.
type API struct { mgr *Manager }

func NewAPI(mgr *Manager) *API { return &API{mgr: mgr} }

type Handle struct { ThreadID int64 `json:"threadId"` }

func (a *API) Start(threadID int64) (Handle, error) { if err := a.mgr.Start(threadID); err!=nil { return Handle{}, err }; return Handle{ThreadID: threadID}, nil }
func (a *API) Write(threadID int64, data string) error { return a.mgr.Write(threadID, data) }
func (a *API) Resize(threadID int64, cols, rows int) error { return a.mgr.Resize(threadID, cols, rows) }
func (a *API) Stop(threadID int64) error { return a.mgr.Stop(threadID) }

