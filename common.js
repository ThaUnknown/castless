export { default as Peer } from './PolitePeer.js'

export const defaultQualityOptions = {
  audio: {
    stereo: 1,
    'sprop-stereo': 1,
    maxaveragebitrate: 510000,
    maxplaybackrate: 510000,
    cbr: 0,
    useinbandfec: 1,
    usedtx: 1,
    maxptime: 20,
    minptime: 10
  },
  video: {
    bitrate: 2000000,
    codecs: ['H264', 'VP9', 'VP8']
  }
}

export const supportsCasting = 'PresentationRequest' in window
