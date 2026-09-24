/** Strip Electron's wrapper without losing multiline validation details. */
export function cleanIpcErrorMessage(message: string) {
  return message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '')
}
