/* jslint node: true, esversion: 6 */

const EventEmitter = require('events');
const AWS = require('aws-sdk');

class UserException extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

module.exports = class s3proxy extends EventEmitter {
  constructor(p) {
    super();
    if (!p) {
      throw new UserException('InvalidParameterList', 'constructor parameters are required');
    }
    if (!p.bucket) {
      throw new UserException('InvalidParameterList', 'bucket parameter is required');
    }
    this.bucket = p.bucket;
    this.responseHeaders = p.responseHeaders;
    this.options =
        Object.getOwnPropertyNames(p)
          .filter(name => name !== 'bucket')
	  .filter(name => name !== 'responseHeaders' )
          .reduce((obj, name) => {
            const withName = {};
            withName[name] = p[name];
            return Object.assign({}, obj, withName);
          }, {});
  }
  init(done) {
    this.s3 = new AWS.S3(Object.assign({ apiVersion: '2006-03-01' }, this.options));
    this.healthCheck((error, data) => {
      if (error) {
        if (typeof (done) !== typeof (Function)) this.emit('error', error, data);
      } else this.emit('init', data);
      if (typeof (done) === typeof (Function)) done(error, data);
    });
  }
  createReadStream(key) {
    this.isInitialized();
    const params = { Bucket: this.bucket, Key: s3proxy.stripLeadingSlash(key) };
    const s3request = this.s3.getObject(params);
    const s3stream = s3request.createReadStream();
    s3request.on('httpHeaders', (statusCode, headers) => {
      s3stream.emit('httpHeaders', statusCode, headers);
    });
    s3stream.addHeaderEventListener = (res) => {
      s3stream.on('httpHeaders', (statusCode, headers) => {
	if ( this.responseHeaders )
	  headers = this.responseHeaders( headers );
        res.writeHead(statusCode, headers);
      });
    };
    return s3stream;
  }
  isInitialized() {
    if (!this.s3) {
      const error = new UserException('UninitializedError', 'S3Proxy is uninitialized (call s3proxy.init)');
      throw error;
    }
  }
  static stripLeadingSlash(str) {
    return str.replace(/^\/+/, '');
  }
  healthCheck(done) {
    const s3request = this.s3.headBucket({ Bucket: this.bucket }, (error, data) => {
      done(error, data);
    });
    return s3request;
  }
  healthCheckStream(res) {
    const s3request = this.s3.headBucket({ Bucket: this.bucket });
    const s3stream = s3request.createReadStream();
    s3request.on('httpHeaders', (statusCode, headers) => {
      res.writeHead(statusCode, headers);
      s3stream.emit('httpHeaders', statusCode, headers);
    });
    return s3stream;
  }
  head(req, res) {
    const stream = this.createReadStream(req.url);
    stream.addHeaderEventListener(res);
    return stream;
  }
  get(req, res) {
    const stream = this.createReadStream(req.url);
    stream.addHeaderEventListener(res);
    return stream;
  }
};
