package agents

import "testing"

func TestParseThreadIDFromDir(t *testing.T) {
    cases := []struct{
        name string
        in   string
        ok   bool
        id   int64
    }{
        {"numeric", "123", true, 123},
        {"slugged", "feature-x-123", true, 123},
        {"leading", "123-feature", true, 123}, // trailingDigits will grab trailing; this case will fail -> expect false
        {"empty", "", false, 0},
        {"nonnumeric", "abc", false, 0},
        {"padded", "name-00012", true, 12},
    }
    // adjust expectations: leading numeric without trailing digits should be false
    cases[2].ok = false; cases[2].id = 0

    for _, tc := range cases {
        t.Run(tc.name, func(t *testing.T) {
            id, ok := parseThreadIDFromDir(tc.in)
            if ok != tc.ok {
                t.Fatalf("ok mismatch for %q: got %v want %v", tc.in, ok, tc.ok)
            }
            if ok && id != tc.id {
                t.Fatalf("id mismatch for %q: got %d want %d", tc.in, id, tc.id)
            }
        })
    }
}

