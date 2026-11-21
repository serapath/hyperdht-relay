const { noisePayload } = require('hyperdht/lib/messages')
const { encode, decode } = require('compact-encoding')

class HandshakeProxy {
  constructor (node, protocol, id, remoteStreamAlias, serverAlias, isInitiator, keyPair, remotePublicKey) {
    this._node = node
    this._protocol = protocol
    this._id = id
    this._remoteStreamAlias = remoteStreamAlias
    this._serverAlias = serverAlias
    this._isInitiator = isInitiator
    this._keyPair = keyPair
    this._remotePublicKey = remotePublicKey

    this._remoteId = null
    this._holepunchSecret = null

    this._onNoiseReply = null
  }

  send (payload) {
    this._protocol.noiseSend.send({
      isInitiator: this._isInitiator,
      id: this._id,
      remoteStreamAlias: this._remoteStreamAlias,
      payload: encode(noisePayload, payload)
    })

    return new Promise((resolve, reject) => {
      this._onNoiseReply = onNoiseSendReply.bind(this, resolve, reject)
    })
  }

  recv (payload) {
    // hyperdht asks several dht nodes at once and the server answers each with the same reply. natively recv is sync,
    // so the first reply completes the handshake before another one comes in. here recv waits for the browser, so a
    // second reply can come in meanwhile. it would throw natively too, so it fails here and never reaches the browser
    if (this._receiving) return Promise.reject(new Error('Handshake already received'))
    this._receiving = true

    this._protocol.noiseReceive.send({
      isInitiator: this._isInitiator,
      id: this._id,
      serverAlias: this._serverAlias,
      payload
    })

    return new Promise((resolve, reject) => {
      this._onNoiseReply = onNoiseReceiveReply.bind(this, resolve, reject)
    })
  }

  final () {
    return {
      id: this._id,
      isInitiator: this._isInitiator,
      publicKey: this._keyPair.publicKey,
      remoteId: this._remoteId,
      remotePublicKey: this._remotePublicKey,
      holepunchSecret: this._holepunchSecret
    }
  }
}

module.exports = {
  HandshakeProxy
}

function onNoiseSendReply (resolve, reject, message) {
  this._onNoiseReply = null

  if (message.remotePublicKey) {
    this._remotePublicKey = message.remotePublicKey
  }

  if (message.complete) {
    this._remoteId = message.remoteId
    this._holepunchSecret = message.holepunchSecret
  }

  resolve(message.payload)
}

function onNoiseReceiveReply (resolve, reject, message) {
  this._onNoiseReply = null

  if (message.remotePublicKey) {
    this._remotePublicKey = message.remotePublicKey
  }

  if (message.complete) {
    this._remoteId = message.remoteId
    this._holepunchSecret = message.holepunchSecret
  }

  if (message.payload.length === 0) {
    this._node._handshakes.delete(this._id)

    reject(new Error('Handshake denied'))
  } else {
    resolve({ id: message.id, ...decode(noisePayload, message.payload) })
  }
}
