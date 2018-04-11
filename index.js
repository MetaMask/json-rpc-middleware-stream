const DuplexStream = require('readable-stream').Duplex

module.exports = createStreamMiddleware

function createStreamMiddleware() {
  const idMap = {}
  const stream = new DuplexStream({ objectMode: true, read, write })

  const middleware = (req, res, next, end) => {
    // write req to stream
    stream.push(req)
    // register request on id map
    idMap[req.id] = { req, res, next, end }
  }

  middleware.stream = stream
  
  return middleware

  function read () {
    return false
  }

  function write (res, encoding, cb) {
    if(res.method !== 'eth_subscription') {
      const context = idMap[res.id]
      if (!context) cb(new Error(`StreamMiddleware - Unknown response id ${res.id}`))
      delete idMap[res.id]
      // copy whole res onto original res
      Object.assign(context.res, res)
      // run callback on empty stack,
      // prevent internal stream-handler from catching errors
      setTimeout(context.end)
    }
    // continue processing stream
    cb()
  }
  
}