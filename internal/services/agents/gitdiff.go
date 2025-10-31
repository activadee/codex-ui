package agents

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"sort"
	"strconv"
	"strings"
)

// collectGitDiffStats inspects staged + unstaged git changes under root and returns aggregated stats.
func collectGitDiffStats(ctx context.Context, root string) ([]FileDiffStatDTO, error) {
	if strings.TrimSpace(root) == "" {
		return nil, fmt.Errorf("worktree path is required")
	}
	info, err := os.Stat(root)
	if err != nil {
		return nil, fmt.Errorf("stat worktree: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("worktree path %q is not a directory", root)
	}

	statusMap, err := parseGitStatus(ctx, root)
	if err != nil {
		return nil, err
	}
	numstat := make(map[string][2]int)

	if err := accumulateNumstat(ctx, root, []string{"diff", "--numstat", "HEAD"}, numstat); err != nil {
		emptyTreeHash, hashErr := runGitCommand(ctx, root, "hash-object", "-w", "-t", "tree", "/dev/null")
		if hashErr != nil {
			return nil, fmt.Errorf("resolve empty tree hash: %w", hashErr)
		}
		emptyTreeHash = strings.TrimSpace(emptyTreeHash)
		if emptyTreeHash == "" {
			return nil, fmt.Errorf("resolve empty tree hash: %w", err)
		}
		if err := accumulateNumstat(ctx, root, []string{"diff", "--numstat", emptyTreeHash}, numstat); err != nil {
			return nil, err
		}
	}
	if err := accumulateNumstat(ctx, root, []string{"diff", "--numstat", "--cached"}, numstat); err != nil {
		return nil, err
	}

	result := make([]FileDiffStatDTO, 0, len(statusMap))
	seen := make(map[string]bool)
	appendEntry := func(path string) {
		if seen[path] {
			return
		}
		entry := FileDiffStatDTO{Path: path, Status: statusMap[path]}
		if counts, ok := numstat[path]; ok {
			entry.Added = counts[0]
			entry.Removed = counts[1]
		}
		result = append(result, entry)
		seen[path] = true
	}

	for path := range statusMap {
		appendEntry(path)
	}
	for path := range numstat {
		appendEntry(path)
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].Path < result[j].Path
	})

	return result, nil
}

func parseGitStatus(ctx context.Context, root string) (map[string]string, error) {
	output, err := runGitCommand(ctx, root, "status", "--porcelain")
	if err != nil {
		return nil, err
	}
	status := make(map[string]string)
	scanner := bufio.NewScanner(strings.NewReader(output))
	for scanner.Scan() {
		line := scanner.Text()
		if len(line) < 3 {
			continue
		}
		code := strings.TrimSpace(line[:2])
		rawPath := strings.TrimSpace(line[3:])
		if code == "" || rawPath == "" {
			continue
		}
		if strings.Contains(rawPath, " -> ") {
			parts := strings.Split(rawPath, " -> ")
			rawPath = parts[len(parts)-1]
		}
		path := strings.TrimSpace(rawPath)
		if strings.HasPrefix(path, "\"") {
			if decoded, err := strconv.Unquote(path); err == nil {
				path = decoded
			}
		}
		status[path] = code
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scan git status: %w", err)
	}
	return status, nil
}

func accumulateNumstat(ctx context.Context, root string, args []string, accum map[string][2]int) error {
	output, err := runGitCommand(ctx, root, args...)
	if err != nil {
		return err
	}
	scanner := bufio.NewScanner(strings.NewReader(output))
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.Split(line, "\t")
		if len(parts) < 3 {
			continue
		}
		added := parseNumstatValue(parts[0])
		removed := parseNumstatValue(parts[1])
		path := strings.TrimSpace(parts[2])
		if path == "" {
			continue
		}
		if strings.Contains(path, " -> ") {
			pathSegments := strings.Split(path, " -> ")
			path = pathSegments[len(pathSegments)-1]
		}
		current := accum[path]
		current[0] += added
		current[1] += removed
		accum[path] = current
	}
	return scanner.Err()
}

func parseNumstatValue(value string) int {
	value = strings.TrimSpace(value)
	if value == "-" {
		return 0
	}
	n, err := strconv.Atoi(value)
	if err != nil {
		return 0
	}
	return n
}

func runGitCommand(ctx context.Context, root string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = root
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("git %s: %w\n%s", strings.Join(args, " "), err, strings.TrimSpace(string(output)))
	}
	return string(output), nil
}
