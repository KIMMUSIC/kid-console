// In-memory registry of connected SSE clients (the inspector's webhook stream).
// Each browser tab that opens /api/webhook/events registers a controller here;
// inbound webhooks are broadcast to every controller.

import type { HttpExchange } from '@/lib/types'

type Client = {
  id: string
  send: (event: string, data: unknown) => void
}

// Survive Next.js dev hot-reloads by stashing on globalThis.
const globalForSse = globalThis as unknown as { __kidSseClients?: Map<string, Client> }
const clients: Map<string, Client> = globalForSse.__kidSseClients ?? new Map()
globalForSse.__kidSseClients = clients

export function addClient(client: Client) {
  clients.set(client.id, client)
}

export function removeClient(id: string) {
  clients.delete(id)
}

export function clientCount() {
  return clients.size
}

/** Push a captured webhook exchange to every connected inspector. */
export function broadcastWebhook(exchange: HttpExchange) {
  for (const client of clients.values()) {
    try {
      client.send('webhook', exchange)
    } catch {
      removeClient(client.id)
    }
  }
}
