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
    const peer = new Peer(defaultQualityOptions)

    peer.dc.onopen = () => {
      this.dispatchEvent(new CustomEvent('connected', { detail: peer.dc }))
    }

    // only used to signal description and candidates to the other peer
    // once a connection is establish the DataChannel takes over.
    peer.signalingPort.onmessage = ({ data }) => {
      connection.send(data)
    }

    connection.addEventListener('message', ({ data }) => {
      peer.signalingPort.postMessage(data)
    })
  }
}
