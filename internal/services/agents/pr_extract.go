package agents

import (
    "regexp"
)

var (
    // Explicit marker preferred
    prMarkerRe = regexp.MustCompile(`(?mi)^PR_URL:\s+(https://github\.com/[^\s]+/pull/\d+)\b`)
    // Fallback: any GitHub PR URL in text
    prURLRe    = regexp.MustCompile(`https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/pull/\d+`)
)

// ExtractPRURLFromEvent tries to extract a GitHub PR URL from a stream event.
func ExtractPRURLFromEvent(evt StreamEvent) string {
    if evt.Item != nil {
        // Check agent message text first
        if url := extractFromText(evt.Item.Text); url != "" {
            return url
        }
        // Then command aggregated output
        if evt.Item.Command != nil {
            if url := extractFromText(evt.Item.Command.AggregatedOutput); url != "" {
                return url
            }
        }
        // Reasoning or error fields may also contain URLs in edge cases
        if url := extractFromText(evt.Item.Reasoning); url != "" {
            return url
        }
        if evt.Item.Error != nil {
            if url := extractFromText(evt.Item.Error.Message); url != "" {
                return url
            }
        }
    }
    if url := extractFromText(evt.Message); url != "" {
        return url
    }
    return ""
}

func extractFromText(s string) string {
    if s == "" {
        return ""
    }
    if m := prMarkerRe.FindStringSubmatch(s); len(m) == 2 {
        return m[1]
    }
    if url := prURLRe.FindString(s); url != "" {
        return url
    }
    return ""
}
