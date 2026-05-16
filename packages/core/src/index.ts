export interface BackendStatusPayload {
  message: string
  time: string
}

export function buildBackendStatusMessage() {
  return 'Agent Telemetry backend'
}

export function formatBackendStatus(payload?: BackendStatusPayload) {
  if (!payload) {
    return {
      title: 'Waiting',
      subtitle: 'Waiting for server response',
    }
  }

  return {
    title: payload.message,
    subtitle: `Updated at ${payload.time}`,
  }
}
