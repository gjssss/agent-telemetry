export interface HelloPayload {
  message: string
  time: string
}

export function buildGreeting(name: string) {
  return `Hello, ${name}!`
}

export function formatBackendStatus(payload?: HelloPayload) {
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
