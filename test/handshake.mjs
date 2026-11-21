import test from 'brittle'
import b4a from 'b4a'
import crypto from 'hypercore-crypto'

import { Handshake } from '../lib/handshake.js'
import { HandshakeProxy } from '../lib/handshake-proxy.js'

test('a noise message for a handshake that is already complete is ignored', (t) => {
  const initiator = crypto.keyPair()
  const responder = crypto.keyPair()
  const sent = { i: [], r: [] }
  const handshake = (side, isInitiator, keyPair, remotePublicKey) => new Handshake(
    { _handshakes: new Map() },
    { noiseReply: { send: (message) => sent[side].push(message) } },
    null, 1, isInitiator, keyPair, remotePublicKey
  )
  const i = handshake('i', true, initiator, responder.publicKey)
  const r = handshake('r', false, responder, null)

  i._onNoiseSend({ payload: b4a.from('hello') })
  r._onNoiseReceive({ payload: sent.i[0].payload })
  r._onNoiseSend({ payload: b4a.from('hi') })
  i._onNoiseReceive({ payload: sent.r[1].payload })
  t.ok(i.complete && r.complete, 'the handshake completes')

  t.execution(() => i._onNoiseReceive({ payload: sent.r[1].payload }), 'the same last message again does not throw')
})

test('the relay sends only the first noise reply of a handshake to the browser, a second one fails like in hyperdht', async (t) => {
  const sent = []
  const node = { _handshakes: new Map() }
  const proxy = new HandshakeProxy(node, { noiseReceive: { send: (message) => sent.push(message) } }, 1, null, 2, true, crypto.keyPair(), null)

  const first = proxy.recv(b4a.from('reply'))
  await t.exception(proxy.recv(b4a.from('reply')), /already received/, 'the second recv fails right away')
  t.is(sent.length, 1, 'only one noise message went to the browser')

  proxy._onNoiseReply({ id: 1, payload: b4a.alloc(0) })
  await t.exception(first, /denied/, 'and the first recv still gets its answer')
})
