var assert = require('assert');
var Ask = require('../lib');
var add1 = function(x) { return x + 1; };

describe('Ask', () => {
  describe('base', () => {
    it('only runs the computation when run is called', (done) => {
      var compCalled;
      var askMe = new Ask(message => {
        setTimeout(() => {
          compCalled = true;
          message(null, 1);
        }, 100);
      });

      assert.ok(!compCalled);
      askMe.run((left, message) => {
        assert.equal(message, 1);
        done();
      });
    });

    it('always executes the observer async', (done) => {
      var compCalled;
      var askMe = new Ask(message => {
        message(null, 1);
      });

      askMe.run((left, message) => {
        compCalled = true;
        assert.equal(message, 1);
      });
      assert.ok(!compCalled);
      setTimeout(done, 100);
    });

    it('throws if the computation tries to complete twice', (done) => {
      var askMe = new Ask(message => {
        message(null, 1);
        setTimeout(() => {
          try {
            message('boom');
          } catch (e) {
            done();
          }
        }, 100);
      });

      askMe.run((left, message) => {
        assert.equal(message, 1);
      });
    });

    it('run returns a cancellation function', (done) => {
      var compCalled;
      var askMe = new Ask(message => {
        var to = setTimeout(() => {
          compCalled = true;
          message(null, 1);
        }, 500);
        return () => { clearTimeout(to); };
      });

      var cancel = askMe.run((left, message) => {
        assert.fail('Run Observer should never have been called');
      });

      cancel();
      setTimeout(() => {
        assert.ok(!compCalled);
        done();
      }, 100);
    });

  });

  describe('map', () => {
    it('maps', (done) => {
      var askMe = new Ask(message => {
        message(null, 1);
      });

      askMe
      .map(add1)
      .run((left, message) => {
        assert.equal(message, 2);
        done();
      });
    });

    it('does not map left', (done) => {
      var askMe = new Ask(message => {
        message('boom');
      });

      askMe
      .map(add1)
      .run((left, message) => {
        assert.ok(!message);
        assert.equal(left, 'boom');
        done();
      });
    });

    it('run returns the original cancel', (done) => {
      var compCalled;
      var askMe = new Ask(message => {
        var to = setTimeout(() => {
          compCalled = true;
          message(null, 1);
        }, 100);
        return () => { clearTimeout(to); };
      });

      var mappedAsk = askMe.map(add1);

      var cancel = mappedAsk.run((left, message) => {
        assert.fail('Run Observer should never have been called');
      });

      cancel();
      setTimeout(() => {
        assert.ok(!compCalled);
        done();
      }, 150);
    });
  });

  describe('biChain', () => {
    it('chains', (done) => {
      var askMe = new Ask(message => {
        message(null, 1);
      });

      function askAdd(left, right) {
        return new Ask(message => {
          message(left, (right) ? right + 5 : null);
        });
      }

      askMe
      .biChain(askAdd)
      .run((left, message) => {
        assert.equal(message, 6);
        done();
      });
    });

    it('calls the chaining ask on left', (done) => {
      var askAddCalled;
      var askMe = new Ask(message => {
        message('boom');
      });

      function askAdd(left, right) {
        askAddCalled = true;
        return new Ask(message => {
          message(left, (right) ? right + 5 : null);
        });
      }

      askMe
      .biChain(askAdd)
      .run((left, right) => {
        assert.equal(left, 'boom');
        assert.ok(!right);
        assert.ok(askAddCalled);
        done();
      });
    });
  });

  describe('chain', () => {
    it('chains', (done) => {
      var askMe = new Ask(message => {
        message(null, 1);
      });

      function askAdd(right) {
        return new Ask(message => {
          message(null, right + 5);
        });
      }

      askMe
      .chain(askAdd)
      .run((left, right) => {
        assert.equal(right, 6);
        done();
      });
    });

    it('does not call the chaining ask on left', (done) => {
      var askAddCalled;
      var askMe = new Ask(message => {
        message('boom');
      });

      function askAdd(left, right) {
        askAddCalled = false;
        return new Ask(message => {
          message(left, (right) ? right + 5 : null);
        });
      }

      askMe
      .biChain(askAdd)
      .run((left, right) => {
        assert.equal(left, 'boom');
        assert.ok(!right);
        assert.ok(!askAddCalled);
        done();
      });
    });
  });

  describe('ap', () => {
    it('applies first right to passed asks right', (done) => {
      var askMe = new Ask(message => {
        setTimeout(() => {
          message(null, add1);
        }, 10);
      });

      var askYou = new Ask(message => {
        message(null, 5);
      });

      askMe
      .ap(askYou)
      .run((left, right) => {
        assert.equal(right, 6);
        done();
      });
    });
  });

  describe('memoize', () => {
    it('run returns the original value and does not re-run computation', (done) => {
      var called = 0;
      var askMe = new Ask(message => {
        message(null, 1);
        called++;
      });

      var askMeMemo = askMe.memoize();

      askMeMemo.run((left, message) => {
        assert.equal(message, 1);
      });

      var secondCall = false;

      setTimeout(() => {
        askMeMemo.run((left, message) => {
          secondCall = true;
          assert.equal(called, 1);
          assert.equal(message, 1);
          done();
        });
        // make sure the second run is also always async
        assert.ok(!secondCall);
      }, 100);
    });

    it('notifies each run observer if the computation has not completed', (done) => {
      var called = 0;
      var runCalled = 0;
      var askMe = new Ask(message => {
        setTimeout(() => {
          message(null, 1);
        }, 100);
        called++;
      });

      var askMeMemo = askMe.memoize();

      askMeMemo.run((left, message) => {
        assert.equal(message, 1);
        runCalled++;
      });

      askMeMemo.run((left, message) => {
        assert.equal(message, 1);
        assert.equal(runCalled, 1);
        assert.equal(called, 1);
        done();
      });
    });
  });

  describe('all', () => {
    it('does not notify until all Asks are completed', (done) => {
      var count = 0;
      function createAsk(to) {
        var order = ++count;
        return new Ask(message => {
          setTimeout(() => {
            message(null, order);
          }, to);
        });
      }

      Ask.all([
        createAsk(100),
        createAsk(500),
        createAsk(0)
      ]).run((left, right) => {
        assert.equal(count, 3);
        assert.deepEqual(right, [3, 1, 2]);
        done();
      });
    });

    it('sends the first left and cancels other asks if a left occurs', (done) => {
      function createAsk(to, left) {
        return new Ask(message => {
          var id = setTimeout(() => {
            if (!left) {
              assert.fail('Should have been canceled');
            } else {
              message(left);
            }
          }, to);
          return () => {
            clearTimeout(id);
          };
        });
      }

      Ask.all([
        createAsk(100),
        createAsk(500),
        createAsk(0, 'boom')
      ]).run((left, right) => {
        assert.equal(left, 'boom');
        assert.deepEqual(right, []);
        done();
      });
    });

    it('wont throw even if proper cancel functions not returned', (done) => {
      function createAsk(to, left) {
        return new Ask(message => {
          var id = setTimeout(() => {
            if (!left) {
              message(null, 'uh oh');
            } else {
              message(left);
            }
          }, to);
        });
      }

      var callCount = 0;

      Ask.all([
        createAsk(100, 'boom'),
        createAsk(500),
        createAsk(0)
      ]).run((left, right) => {
        callCount++;
        assert.equal(left, 'boom');
        assert.deepEqual(right, ['uh oh']);
      });

      setTimeout(() => {
        assert.equal(callCount, 1);
        done();
      }, 600);
    });

    it('it returns the un-finishes array of rights if a left occurs', (done) => {
      var count = 0;
      function createAsk(to, left) {
        var order = ++count;
        return new Ask(message => {
          var id = setTimeout(() => {
            if (!left) {
              message(null, order);
            } else {
              message(left);
            }
          }, to);
          return () => {
            clearTimeout(id);
          };
        });
      }

      var callCount = 0;

      Ask.all([
        createAsk(100, 'boom'),
        createAsk(500),
        createAsk(0)
      ]).run((left, right) => {
        callCount++;
        assert.equal(left, 'boom');
        assert.deepEqual(right, [3]);
        done();
      });
    });
  });
});

