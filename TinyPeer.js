export default class TinyPeer extends RTCPeerConnection {
  constructor (options = {}) {
    super({
      iceServers: options.iceServers || [{
        urls: [
          'stun:stun.l.google.com:19302',
          'stun:global.stun.twilio.com:3478'
        ]
      }]
    })

    this.polite = options.polite ?? true
    this.trickle = options.trickle ?? true
    this.quality = options.quality ?? {}
    this.makingOffer = false
    this.ignoreOffer = false

    this.ctrl = new AbortController()
    this.abortSignal = { signal: this.ctrl.signal }
    this.dataChannel = this.createDataChannel('both', { negotiated: true, id: 0 })

    this.dataChannel.addEventListener('open', () => {
      // At this point we start to trickle over datachannel instead
      // we also close the message channel as we do not need it anymore
      this.trickle = true
      this.dispatchEvent(new Event('ready'))
    }, { once: true, ...this.abortSignal })

    this.addEventListener('iceconnectionstatechange', () => {
      if (this.iceConnectionState === 'disconnected' || this.iceConnectionState === 'failed') {
        this.ctrl.abort()
      }
    }, this.abortSignal)

    this.addEventListener('icecandidate', ({ candidate }) => {
      if (this.trickle) this._emitSignal({ candidate })
    }, this.abortSignal)

    this.addEventListener('negotiationneeded', () => {
      this._handleNegotiation()
    }, this.abortSignal)
  }

  async _handleNegotiation () {
    this.makingOffer = true
    const offer = await this.createOffer()
    if (this.signalingState !== 'stable') return
    offer.sdp = TinyPeer.setQuality(offer.sdp, this.quality)
    await this.setLocalDescription(offer)
    this.makingOffer = false
    if (this.trickle) {
      this._emitSignal({ description: this.localDescription })
    } else {
      await TinyPeer._waitToCompleteIceGathering(this)
      const description = this.localDescription.toJSON()
      description.sdp = description.sdp.replace(/a=ice-options:trickle\s\n/g, '')
      this._emitSignal({ description })
    }
  }

  _emitSignal (data) {
    this.dispatchEvent(
      new CustomEvent('signal', { detail: JSON.stringify(data) })
    )
  }

  async signal (data) {
    const { description, candidate } = typeof data === 'string' ? JSON.parse(data) : data

    if (description) {
      const offerCollision = description.type === 'offer' &&
        (this.makingOffer || this.signalingState !== 'stable')

      this.ignoreOffer = !this.polite && offerCollision
      if (this.ignoreOffer) return

      if (offerCollision) {
        await Promise.all([
          this.setLocalDescription({ type: 'rollback' }),
          this.setRemoteDescription(description)
        ])
      } else {
        try {
          (description.type === 'answer' && this.signalingState === 'stable') ||
            await this.setRemoteDescription(description)
        } catch (err) { }
      }
      if (description.type === 'offer') {
        const answ = await this.createAnswer()
        answ.sdp = TinyPeer.setQuality(answ.sdp, this.quality)
        await this.setLocalDescription(answ)
        // Edge didn't set the state to 'new' after calling the above :[
        if (!this.trickle) await TinyPeer._waitToCompleteIceGathering(this, 'new')
        this._emitSignal({ description: this.localDescription })
      }
    } else if (candidate) {
      await this.addIceCandidate(candidate)
    }
  }

  destroy () {
    this.close()
    this.ctrl.abort()
  }

  static _waitToCompleteIceGathering (pc, state = pc.iceGatheringState) {
    return state !== 'complete' && new Promise(resolve => {
      pc.addEventListener('icegatheringstatechange', () => (pc.iceGatheringState === 'complete') && resolve())
    })
  }

  static setQuality (sdp, opts = {}) {
    if (!sdp || (!opts.video && !opts.audio)) return sdp
    let newSDP = sdp
    if (opts.video) { // bitrate, codecs[]
      const videoData = sdp.matchAll(/^m=video.*SAVPF (.*)$/gm).next().value
      if (videoData && videoData[1]) {
        const RTPIndex = videoData[1]
        const RTPMaps = {}
        let last = null
        for (const [match, id, type] of [...sdp.matchAll(/^a=rtpmap:(\d{1,3}) (.*)\/90000$/gm)]) {
          if (type === 'rtx') {
            RTPMaps[last].push(id)
          } else {
            if (!RTPMaps[type]) RTPMaps[type] = []
            RTPMaps[type].push(id)
            last = type
            if (opts.video.bitrate) {
              const fmtp = `a=fmtp:${id} x-google-min-bitrate=${opts.video.bitrate}; x-google-max-bitrate=${opts.video.bitrate}\n`
              newSDP = newSDP.replace(match, fmtp + match)
            }
          }
        }
        const newIndex = Object.entries(RTPMaps).sort((a, b) => {
          const indexA = opts.video.codecs.indexOf(a[0])
          const indexB = opts.video.codecs.indexOf(b[0])
          return (indexA === -1 ? opts.video.codecs.length : indexA) - (indexB === -1 ? opts.video.codecs.length : indexB)
        }).map(value => {
          return value[1].join(' ')
        }).join(' ')
        newSDP = newSDP.replace(RTPIndex, newIndex)
      }
    }
    if (opts.audio) {
      const audioData = sdp.matchAll(/^a=rtpmap:(\d{1,3}) opus\/48000\/2$/gm).next().value
      if (audioData && audioData[0]) {
        const regex = new RegExp(`^a=fmtp:${audioData[1]}.*$`, 'gm')
        const FMTPData = sdp.match(regex)
        if (FMTPData && FMTPData[0]) {
          let newFMTPData = FMTPData[0].slice(0, FMTPData[0].indexOf(' ') + 1)
          newFMTPData += 'stereo=' + (opts.audio.stereo != null ? opts.audio.stereo : '1')
          newFMTPData += ';sprop-stereo=' + (opts.audio['sprop-stereo'] != null ? opts.audio['sprop-stereo'] : '1')

          if (opts.audio.maxaveragebitrate != null) newFMTPData += '; maxaveragebitrate=' + (opts.audio.maxaveragebitrate || 128 * 1024 * 8)

          if (opts.audio.maxplaybackrate != null) newFMTPData += '; maxplaybackrate=' + (opts.audio.maxplaybackrate || 128 * 1024 * 8)

          if (opts.audio.cbr != null) newFMTPData += '; cbr=' + opts.audio.cbr

          if (opts.audio.useinbandfec != null) newFMTPData += '; useinbandfec=' + opts.audio.useinbandfec

          if (opts.audio.usedtx != null) newFMTPData += '; usedtx=' + opts.audio.usedtx

          if (opts.audio.maxptime != null) newFMTPData += ';maxptime:' + opts.audio.maxptime
          if (opts.audio.minptime != null) newFMTPData += '; minptime:' + opts.audio.minptime
          newSDP = newSDP.replace(FMTPData[0], newFMTPData)
        }
      }
    }
    return newSDP
  }
}
