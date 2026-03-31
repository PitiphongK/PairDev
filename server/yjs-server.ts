import { WebSocket, WebSocketServer } from 'ws'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import * as map from 'lib0/map'

// Use PORT env var (set by Render/Railway), fallback to YJS_PORT or 1234
const PORT = process.env.YJS_PORT ? parseInt(process.env.YJS_PORT) : 1234;

const wss = new WebSocketServer({ port: PORT })

const HOST = process.env.HOST || 'localhost'
console.log(`Yjs WebSocket server running on ws://${HOST}:${PORT}`)

// Map to store Yjs documents for each room
const docs = new Map<string, WSSharedDoc>()

const messageSync = 0
const messageAwareness = 1

interface WSSharedDoc {
  name: string
  doc: Y.Doc
  awareness: awarenessProtocol.Awareness
  conns: Map<WebSocket, Set<number>>
}

const getYDoc = (docname: string): WSSharedDoc => {
  return map.setIfUndefined(docs, docname, () => {
    const doc = new Y.Doc()
    const awareness = new awarenessProtocol.Awareness(doc)
    const conns = new Map<WebSocket, Set<number>>()
    
    return {
      name: docname,
      doc,
      awareness,
      conns
    }
  })
}

const send = (conn: WebSocket, encoder: encoding.Encoder) => {
  const message = encoding.toUint8Array(encoder)
  if (conn.readyState === WebSocket.CONNECTING || conn.readyState === WebSocket.OPEN) {
    conn.send(message, (err) => { if (err) console.error(err) })
  }
}

const messageListener = (conn: WebSocket, doc: WSSharedDoc, message: Uint8Array) => {
  try {
    if (message.byteLength === 0) return
    const decoder = decoding.createDecoder(message)
    const messageType = decoding.readVarUint(decoder)
    
    switch (messageType) {
      case messageSync: {
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, messageSync)
        // readSyncMessage writes sync updates directly to the encoder
        syncProtocol.readSyncMessage(decoder, encoder, doc.doc, conn)
        // Only send when response has payload. Sending a header-only frame
        // makes y-websocket client throw "Unexpected end of array".
        if (encoding.length(encoder) > 1) {
          send(conn, encoder)
        }
        break
      }
      case messageAwareness: {
        awarenessProtocol.applyAwarenessUpdate(
          doc.awareness,
          decoding.readVarUint8Array(decoder),
          conn
        )
        break
      }
      default:
        console.warn(`Unknown message type: ${messageType}`)
    }
  } catch (err) {
    console.error('Error processing message:', err)
  }
}

const closeConn = (doc: WSSharedDoc, conn: WebSocket) => {
  const controlledIds = doc.conns.get(conn)
  doc.conns.delete(conn)
  
  if (controlledIds !== undefined) {
    awarenessProtocol.removeAwarenessStates(
      doc.awareness,
      Array.from(controlledIds),
      null
    )
  }
  
  if (doc.conns.size === 0) {
    // Clean up document if no connections
    docs.delete(doc.name)
    doc.doc.destroy()
  }
}

wss.on('connection', (conn: WebSocket, req) => {
  const url = req.url
  if (!url) {
    conn.close()
    return
  }
  
  // Parse room name from URL
  const docName = url.slice(1).split('?')[0]
  
  console.log(`New connection to room: ${docName}`)
  
  const doc = getYDoc(docName)
  doc.conns.set(conn, new Set())
  
  // Send sync step 1
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, messageSync)
  syncProtocol.writeSyncStep1(encoder, doc.doc)
  send(conn, encoder)
  
  // Send awareness states
  const awarenessStates = doc.awareness.getStates()
  if (awarenessStates.size > 0) {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, messageAwareness)
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(awarenessStates.keys()))
    )
    send(conn, encoder)
  }
  
  // Broadcast awareness updates
  const awarenessChangeHandler = (
    { added, updated, removed }: any,
    origin: any
  ) => {
    const changedClients = added.concat(updated).concat(removed)
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, messageAwareness)
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(doc.awareness, changedClients)
    )
    
    doc.conns.forEach((_, c) => {
      send(c, encoder)
    })
  }
  
  doc.awareness.on('change', awarenessChangeHandler)
  
  // Broadcast document updates to all OTHER clients (not the origin)
  const updateHandler = (update: Uint8Array, origin: any) => {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, messageSync)
    syncProtocol.writeUpdate(encoder, update)
    
    // Send to all connected clients except the one that made the change
    doc.conns.forEach((_, c) => {
      // Only send to other connections (origin is the WebSocket that made the change)
      if (c !== origin && c.readyState === WebSocket.OPEN) {
        send(c, encoder)
      }
    })
  }
  
  doc.doc.on('update', updateHandler)
  
  conn.on('message', (message: ArrayBuffer) =>
    messageListener(conn, doc, new Uint8Array(message))
  )

  conn.on('error', (error) => {
    console.error(`Connection error for room ${docName}:`, error)
  })
  
  conn.on('close', () => {
    doc.awareness.off('change', awarenessChangeHandler)
    doc.doc.off('update', updateHandler)
    closeConn(doc, conn)
    console.log(`Connection closed for room: ${docName}`)
  })
})

wss.on('error', (error) => {
  console.error('WebSocket server error:', error)
})

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down Yjs WebSocket server...')
  wss.close(() => {
    console.log('Yjs WebSocket server closed')
    process.exit(0)
  })
})
