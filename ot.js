// This module is the server's equivalent of `./client.js`; that is, it provides
// the high level Operational Transformation API for the server side of
// things. You just need to pass it a store parameter which allows it to get,
// save, and create documents in whatever backend you choose. It is an event
// emitter, and it is assumed that you will listen to these events that it emits
// and have some type of communication layer with the clients to let them know
// of new updates and which operations have been applied to the master document.

/*jslint onevar: true, undef: true, eqeqeq: true, bitwise: true,
  newcap: true, immed: true, nomen: false, white: false, plusplus: false,
  laxbreak: true */

/*global define */
var events = require("events");
var { messages } = require("./messages");
var { apply } = require("./apply");
var { errors } = require("./errors");

function nop() {}

function error(msg) {
  throw new Error(msg);
}

exports.ot = function (opts) {
  var store = opts.store || error("store is required"),
    manager = new events.EventEmitter();

  manager.newDocument = function (callback) {
    callback = callback || nop;
    store.newDocument(
      function (err, doc) {
        if (err) {
          this.emit("error", err);
          return callback(err, null);
        } else {
          this.emit("new", doc);
          return callback(null, doc);
        }
      }.bind(this)
    );
  };

  manager.applyOperation = function (message) {
    var id = messages.id(message),
      newRev = messages.revision(message),
      op = messages.operation(message),
      emit = this.emit.bind(this);

    store.getDocument(id, function (err, doc) {
      if (err) {
        emit("error", err);
      } else {
        if (newRev === doc.rev + 1) {
          try {
            doc.doc = apply(op, doc.doc);
          } catch (e) {
            emit("error", e);
            return;
          }

          doc.rev++;
          store.saveDocument(doc, function (err, doc) {
            var msg;
            if (err) {
              // Bad revisions aren't considered an error at this
              // level, just ignored.
              if (!(err instanceof errors.BadRevision)) {
                emit("error", err);
              }
            } else {
              msg = {};
              messages.revision(msg, doc.rev);
              messages.id(msg, doc.id);
              messages.operation(msg, op);
              messages.document(msg, doc.doc);
              emit("update", msg);
            }
          });
        }
      }
    });
  };

  return manager;
};
