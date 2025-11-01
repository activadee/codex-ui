import React from "react"
import { createRoot } from "react-dom/client"
import { HashRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import App from "./App"
import "./globals.css"
import { ThreadEventRouterProvider } from "@/lib/thread-events"

const container = document.getElementById("root")

const root = createRoot(container!)

const queryClient = new QueryClient()

root.render(
  <React.StrictMode>
    <ThreadEventRouterProvider>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <App />
        </HashRouter>
      </QueryClientProvider>
    </ThreadEventRouterProvider>
  </React.StrictMode>
)
