import { Peer, defaultQualityOptions } from './common.js'

export default class Receiver extends EventTarget {
  constructor () {
    super()
    if (navigator.presentation.receiver) {
      navigator.presentation.receiver.connectionList.then(list => {
        list.connections.map(connection => this.addConnection(connection))
        list.addEventListener('connectionavailable', ({ connection }) => {
          this.addConnection(connection)
        })
      })
    }
  }

  addConnection (connection) {
    this.peer = new Peer(defaultQualityOptions)

    this.peer.addEventListener('ready', () => {
      this.dispatchEvent(new CustomEvent('connected', {
        detail: {
          peerConnection: this.peer,
          dataChannel: this.peer.dataChannel
        }
      }))
    })

    // only used to signal description and candidates to the other peer
    // once a connection is establish the DataChannel takes over.
    this.peer.addEventListener('signal', ({ detail }) => {
      connection.send(detail)
    })

    connection.addEventListener('message', ({ data }) => {
      this.peer.signal(data)
    })
  }

  destroy () {
    this.peer?.destroy()
  }
}
