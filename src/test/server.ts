import http from 'node:http'
import net from 'node:net'

const open: http.Server[] = []

/** The port of a server that is listening. */
function portOf(server: net.Server): number {
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('the server is not listening on a port')
  }
  return address.port
}

/** An HTTP server on a free port of this machine. Close it with `closeServers`. */
export async function startServer(handler: http.RequestListener) {
  const server = http.createServer(handler)
  open.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = portOf(server)
  return { port, url: `http://127.0.0.1:${port}` }
}

/** A port that nothing listens on: it was free a moment ago. */
export async function closedPort(): Promise<number> {
  const probe = net.createServer()
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve))
  const port = portOf(probe)
  await new Promise<void>(resolve => probe.close(() => resolve()))
  return port
}

export async function closeServers(): Promise<void> {
  await Promise.all(
    open.splice(0).map(
      server =>
        new Promise<void>(resolve => {
          server.closeAllConnections()
          server.close(() => resolve())
        })
    )
  )
}

/** The value of a request header that is sent once. */
export function headerOf(request: http.IncomingMessage, name: string): string {
  const value = request.headers[name]
  if (typeof value !== 'string') {
    throw new Error(`the header ${name} was not sent exactly once`)
  }
  return value
}
