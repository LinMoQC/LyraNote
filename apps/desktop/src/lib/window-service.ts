import { getCurrentWindow } from "@tauri-apps/api/window"

const appWindow = getCurrentWindow()

export const windowService = {
  label: appWindow.label,
  close() {
    return appWindow.close()
  },
  focus() {
    return appWindow.setFocus()
  },
  show() {
    return appWindow.show()
  },
  minimize() {
    return appWindow.minimize()
  },
  toggleMaximize() {
    return appWindow.toggleMaximize()
  },
  startDragging() {
    return appWindow.startDragging()
  },
}
