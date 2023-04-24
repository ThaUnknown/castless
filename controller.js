import { Peer, defaultQualityOptions, supportsCasting } from './common.js'

export default class Castless extends EventTarget {
  destoyed = null
  presentationConnection = null
  presentationRequest = null
  p2pConnection = null
  qualityOptions = null

  constructor (receiverURL, qualityOptions = defaultQualityOptions) {
    super()
    if (!supportsCasting) throw new Error('Cast API not supported')

    this.qualityOptions = qualityOptions

    this.presentationRequest = new PresentationRequest([receiverURL])
    navigator.presentation.defaultRequest = this.presentationRequest
    this.presentationRequest.addEventListener('connectionavailable', e => this.initConnection(e))
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

  initConnection ({ connection }) {
    if (this.destoyed) return
    this.p2pConnection = new Peer({
      polite: true,
      quality: this.qualityOptions
    })

    this.presentationConnection = connection
    this.presentationConnection.addEventListener('terminate', () => {
      this.presentationConnection = null
      this.p2pConnection = null
    })

    this.p2pConnection.signalingPort.onmessage = ({ data }) => {
      this.presentationConnection.send(data)
    }

    this.presentationConnection.addEventListener('message', ({ data }) => {
      this.p2pConnection.signalingPort.postMessage(data)
    })

    this.p2pConnection.dc.onopen = () => {
      if (!this.destoyed) {
        this.dispatchEvent(new CustomEvent('connected', {
          detail: {
            peerConnection: this.p2pConnection.pc,
            dataChannel: this.p2pConnection.dc
          }
        }))
      }
    }
  }

  destroy () {
    this.destoyed = true
    navigator.presentation.defaultRequest = null
    this.presentationRequest?.terminate()
    this.presentationConnection?.terminate()
    this.p2pConnection?.pc.close()
  }
}
