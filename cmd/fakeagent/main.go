package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"time"
)

type inputEnvelope struct {
	Type    string      `json:"type"`
	Prompts interface{} `json:"prompts"`
}

func main() {
	scanner := bufio.NewScanner(os.Stdin)

	for scanner.Scan() {
		var envelope inputEnvelope
		_ = json.Unmarshal(scanner.Bytes(), &envelope)

		fmt.Println(`{"kind":"plan_update","plan":"1) read prompt 2) reply"}`)
		time.Sleep(50 * time.Millisecond)
		fmt.Println(`{"kind":"text_chunk","text":"Hello from fakeagent 👋"}`)
		time.Sleep(10 * time.Millisecond)
		fmt.Println(`{"kind":"exit","code":0}`)
	}

	if err := scanner.Err(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
