import { Peer, defaultQualityOptions, supportsCasting } from './common.js'

export default class Castless extends EventTarget {
  destoyed = null
  presentationConnection = null
  presentationRequest = null
  peer = null
  qualityOptions = null

  constructor (receiverURL, qualityOptions = defaultQualityOptions) {
    super()
    if (!supportsCasting) throw new Error('Cast API not supported')

    this.qualityOptions = qualityOptions

    this.presentationRequest = new PresentationRequest([receiverURL])
    navigator.presentation.defaultRequest = this.presentationRequest
    this.presentationRequest.addEventListener('connectionavailable', ({ connection }) => {
      connection.addEventListener('connect', () => this.initConnection(connection))
    })
    this.presentationRequest.getAvailability().then(aval => {
      if (this.destoyed) return
      aval.onchange = ({ target }) => this.handleAvailability(target)
      this.handleAvailability(aval)
    })
  }

  start () {
    this.presentationRequest?.start()
  }

  end () {
    this.destroy()
  }

  handleAvailability ({ value }) {
    if (this.destoyed) return
    this.canCast = !!value
    this.dispatchEvent(new CustomEvent('availabilitychange', { detail: !!value }))
  }

  initConnection (connection) {
    if (this.destoyed) return
    this.peer = new Peer({
      quality: this.qualityOptions
    })

    this.presentationConnection = connection
    this.presentationConnection.addEventListener('terminate', () => {
      this.presentationConnection = null
      this.peer = null
    })

    this.peer.addEventListener('signal', ({ detail }) => {
      this.presentationConnection.send(detail)
    })

    this.presentationConnection.addEventListener('message', ({ data }) => {
      this.peer.signal(data)
    })

    this.peer.addEventListener('ready', () => {
      if (!this.destoyed) {
        this.dispatchEvent(new CustomEvent('connected', {
          detail: {
            peerConnection: this.peer,
            dataChannel: this.peer.dataChannel
          }
        }))
      }
    })
  }

  destroy () {
    this.destoyed = true
    navigator.presentation.defaultRequest = null
    this.presentationRequest?.terminate()
    this.presentationConnection?.terminate()
    this.peer?.destroy()
  }
}
