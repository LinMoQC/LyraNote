import React from "react"
import ReactDOM from "react-dom/client"
import { LazyMotion, domAnimation } from "framer-motion"
import App from "./app"
import { DesktopQueryProvider } from "@/providers/query-provider"
import "./styles/globals.css"

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DesktopQueryProvider>
      <LazyMotion features={domAnimation}>
        <App />
      </LazyMotion>
    </DesktopQueryProvider>
  </React.StrictMode>,
)
