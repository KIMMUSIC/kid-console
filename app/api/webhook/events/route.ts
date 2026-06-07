import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { addClient, removeClient } from '../connections'

export const dynamic = 'force-dynamic'

// Server-Sent Events stream. The inspector subscribes here and receives every
// inbound webhook in real time.
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder()
  const id = randomUUID()

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      addClient({ id, send })
      send('connected', { id, at: new Date().toISOString() })

      // Heartbeat keeps the connection alive through proxies.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
        } catch {
          clearInterval(heartbeat)
        }
      }, 15000)

      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        removeClient(id)
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      })
    },
    cancel() {
      removeClient(id)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
