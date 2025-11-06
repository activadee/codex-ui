package watchers

import "testing"

func TestIsIgnored(t *testing.T) {
    cases := []struct{ p string; want bool }{
        {"/repo/.git/config", true},
        {"/repo/src/.git", true},
        {"/repo/node_modules/pkg/index.js", true},
        {"/repo/.codex/sessions/log.jsonl", true},
        {"/repo/dist/app.js", true},
        {"/repo/build/app", true},
        {"/repo/.cache/tmp", true},
        {"/repo/src/main.go", false},
    }
    for _, tc := range cases {
        if got := isIgnored(tc.p); got != tc.want {
            t.Fatalf("isIgnored(%q)=%v want %v", tc.p, got, tc.want)
        }
    }
}

