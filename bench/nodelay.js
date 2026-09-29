// Screeps' engine processes talk over small TCP RPC messages. With Nagle's algorithm on, each round trip can
// stall ~40ms on delayed ACKs, which dominates tick time. Preloaded into every engine process (see run.js).
const net = require("net")

const connect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  this.setNoDelay(true)
  return connect.apply(this, args)
}

const createServer = net.createServer
net.createServer = function (...args) {
  const server = createServer.apply(this, args)
  server.on("connection", socket => socket.setNoDelay(true))
  return server
}
