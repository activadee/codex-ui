package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"time"
)

type inputEnvelope struct {
	Type    string      `json:"type"`
	Prompts interface{} `json:"prompts"`
}

func main() {
	reader := bufio.NewReader(os.Stdin)

	for {
		line, err := reader.ReadBytes('\n')
		if len(bytes.TrimSpace(line)) > 0 {
			var envelope inputEnvelope
			if err := json.Unmarshal(line, &envelope); err != nil {
				fmt.Fprintf(os.Stderr, "fakeagent: invalid JSON: %v\n", err)
				os.Exit(1)
			}

			fmt.Println(`{"kind":"plan_update","plan":"1) read prompt 2) reply"}`)
			time.Sleep(50 * time.Millisecond)
			fmt.Println(`{"kind":"text_chunk","text":"Hello from fakeagent 👋"}`)
			time.Sleep(10 * time.Millisecond)
			fmt.Println(`{"kind":"exit","code":0}`)
		}

		if err != nil {
			if err == io.EOF {
				break
			}
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	}
}
