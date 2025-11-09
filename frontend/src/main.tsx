import React from "react"
import { createRoot } from "react-dom/client"
import { HashRouter } from "react-router-dom"

import App from "./App"
import "./globals.css"
import { ThreadEventRouterProvider } from "@/eventing"
import { AppStateProvider } from "@/state/createAppStore"

const container = document.getElementById("root")

const root = createRoot(container!)

root.render(
  <React.StrictMode>
    <ThreadEventRouterProvider>
      <AppStateProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </AppStateProvider>
    </ThreadEventRouterProvider>
  </React.StrictMode>
)
