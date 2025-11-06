package agents

import "testing"

func TestDeriveTitle(t *testing.T) {
    if got := deriveTitle("", nil); got != "Untitled thread" {
        t.Fatalf("empty -> %q", got)
    }
    if got := deriveTitle("one two three four five six seven eight nine ten", nil); got != "one two three four five six seven eight" {
        t.Fatalf("trim to 8 words -> %q", got)
    }
    segs := []InputSegmentDTO{{Type: "text", Text: "hello"}, {Type: "text", Text: "world"}}
    if got := deriveTitle("", segs); got != "hello world" {
        t.Fatalf("segments title -> %q", got)
    }
}

func TestDeriveUserMessageText(t *testing.T) {
    if got := deriveUserMessageText(MessageRequest{Input: "  hi  "}); got != "hi" {
        t.Fatalf("trim -> %q", got)
    }
    segs := []InputSegmentDTO{{Type: "text", Text: "first"}, {Type: "image", ImagePath: "/img.png"}, {Type: "text", Text: "last"}}
    got := deriveUserMessageText(MessageRequest{Segments: segs})
    want := "first\n\n[image]/img.png\n\nlast"
    if got != want {
        t.Fatalf("segments -> got %q want %q", got, want)
    }
}

