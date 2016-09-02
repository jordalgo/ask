const assert = require('assert');
const Ask = require('../lib');

const add1 = function(x) { return x + 1; };
const noop = () => {};

describe('Ask', () => {
  describe('base', () => {
    it('only runs the computation when run is called', (done) => {
      let compCalled;
      const askMe = new Ask((left, right) => {
        setTimeout(() => {
          compCalled = true;
          right(1);
        }, 100);
      });

      assert.ok(!compCalled);
      askMe.run(noop, right => {
        assert.equal(right, 1);
        done();
      });
    });

    it('always executes the observers async', (done) => {
      let compCalled;
      const askMe = new Ask((left, right) => {
        right(1);
      });

      askMe.run(noop, right => {
        assert.ok(compCalled);
        assert.equal(right, 1);
        done();
      });
      compCalled = true;
    });

    it('throws if the computation tries to complete twice', (done) => {
      const askMe = new Ask((left, right) => {
        right(1);
        setTimeout(() => {
          try {
            left('boom');
          } catch (e) {
            done();
          }
        }, 100);
      });

      askMe.run(noop, right => {
        assert.equal(right, 1);
      });
    });

    it('run returns a cancellation function', (done) => {
      let compCalled;
      const askMe = new Ask((left, right) => {
        const to = setTimeout(() => {
          compCalled = true;
          right(1);
        }, 500);
        return () => { clearTimeout(to); };
      });

      const cancel = askMe.run(noop, () => {
        assert.fail('Run right sub called');
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
      const askMe = new Ask((left, right) => {
        right(1);
      });

      askMe
      .map(add1)
      .run(noop, right => {
        assert.equal(right, 2);
        done();
      });
    });

    it('does not map lefts', (done) => {
      const askMe = new Ask((left) => {
        left('boom');
      });

      askMe
      .map(add1)
      .run(
        left => {
          assert.equal(left, 'boom');
          done();
        },
        () => { assert.fail(); }
      );
    });

    it('run returns the original cancel', (done) => {
      let compCalled;
      const askMe = new Ask((left, right) => {
        const to = setTimeout(() => {
          compCalled = true;
          right(1);
        }, 100);
        return () => { clearTimeout(to); };
      });

      const mappedAsk = askMe.map(add1);

      const cancel = mappedAsk.run(noop, () => {
        assert.fail('Run right sub called');
      });

      cancel();
      setTimeout(() => {
        assert.ok(!compCalled);
        done();
      }, 150);
    });

    it('is exposed as a static function', (done) => {
      const askMe = new Ask((left, right) => {
        right(1);
      });

      Ask
      .map(add1, askMe)
      .run(noop, right => {
        assert.equal(right, 2);
        done();
      });
    });
  });

  describe('bichain', () => {
    it('chains for both left and right', (done) => {
      const askMe = new Ask((left) => {
        left(2);
      });

      function askAddLeft(l) {
        return new Ask((left) => {
          left(l - 1);
        });
      }

      function askAddRight(r) {
        return new Ask((left, right) => {
          right(r + 10);
        });
      }

      askMe
      .bichain(askAddLeft, askAddRight)
      .run(
        l => {
          assert.equal(l, 1);
          done();
        },
        () => {
          assert.fail('right got called');
        }
      );
    });

    it('will recursively cancel', (done) => {
      let firstAskComplete;
      let secondAskCanceled;
      const askMe = new Ask((left) => {
        setTimeout(() => {
          firstAskComplete = true;
          left(1);
        }, 50);
      });

      function askAdd(l) {
        return new Ask((left, right) => {
          const id = setTimeout(() => {
            right(l + 5);
          }, 100);
          return () => {
            secondAskCanceled = true;
            clearTimeout(id);
          };
        });
      }

      const cancel = askMe
      .bichain(askAdd, noop)
      .run(
        noop,
        assert.fail.bind(assert, 'right called')
      );

      setTimeout(() => {
        assert.ok(firstAskComplete);
        cancel();
        setTimeout(() => {
          assert.ok(secondAskCanceled);
          done();
        }, 250);
      }, 100);
    });

    it('is exposed as a static factory', (done) => {
      const askMe = new Ask((left) => {
        left(2);
      });

      function askAddLeft(l) {
        return new Ask((left) => {
          left(l - 1);
        });
      }

      function askAddRight(r) {
        return new Ask((left, right) => {
          right(r + 10);
        });
      }

      Ask
      .bichain(askAddLeft, askAddRight, askMe)
      .run(
        l => {
          assert.equal(l, 1);
          done();
        },
        () => {
          assert.fail('right got called');
        }
      );
    });
  });

  describe('chain', () => {
    it('chains', (done) => {
      const askMe = new Ask((left, right) => {
        right(1);
      });

      function askAdd(r) {
        return new Ask((left, right) => {
          right(r + 5);
        });
      }

      askMe
      .chain(askAdd)
      .run(noop, right => {
        assert.equal(right, 6);
        done();
      });
    });

    it('does not call the chaining ask on left', (done) => {
      let askAddCalled;
      const askMe = new Ask((left) => {
        left('boom');
      });

      function askAdd(r) {
        askAddCalled = true;
        return new Ask((left, right) => {
          right(r + 5);
        });
      }

      askMe
      .chain(askAdd)
      .run(
        left => {
          assert.equal(left, 'boom');
          assert.ok(!askAddCalled);
          done();
        },
        () => {
          assert.fail('right got called');
        }
      );
    });

    it('will recursively cancel', (done) => {
      let firstAskComplete;
      let secondAskCanceled;
      const askMe = new Ask((left, right) => {
        setTimeout(() => {
          firstAskComplete = true;
          right(1);
        }, 50);
      });

      function askAdd(r) {
        return new Ask((left, right) => {
          const id = setTimeout(() => {
            right(r + 5);
          }, 100);
          return () => {
            secondAskCanceled = true;
            clearTimeout(id);
          };
        });
      }

      const cancel = askMe
      .chain(askAdd)
      .run(
        noop,
        assert.fail.bind(assert, 'right called')
      );

      setTimeout(() => {
        assert.ok(firstAskComplete);
        cancel();
        setTimeout(() => {
          assert.ok(secondAskCanceled);
          done();
        }, 250);
      }, 100);
    });

    it('is exposed as a static function', (done) => {
      const askMe = new Ask((left, right) => {
        right(1);
      });

      function askAdd(r) {
        return new Ask((left, right) => {
          right(r + 5);
        });
      }

      Ask
      .chain(askAdd, askMe)
      .run(noop, right => {
        assert.equal(right, 6);
        done();
      });
    });
  });

  describe('ap', () => {
    it('applies first right to passed asks right', (done) => {
      const askMe = new Ask((left, right) => {
        setTimeout(() => {
          right(add1);
        }, 10);
      });

      const askYou = new Ask((left, right) => {
        right(5);
      });

      askMe
      .ap(askYou)
      .run(noop, right => {
        assert.equal(right, 6);
        done();
      });
    });

    it('is exposed as a static function', (done) => {
      const askMe = new Ask((left, right) => {
        setTimeout(() => {
          right(add1);
        }, 10);
      });

      const askYou = new Ask((left, right) => {
        right(5);
      });

      Ask
      .ap(askYou, askMe)
      .run(noop, right => {
        assert.equal(right, 6);
        done();
      });
    });
  });

  describe('concat', () => {
    it('returns the first ask that completes', (done) => {
      function createAsk(to, r) {
        return new Ask((left, right) => {
          const id = setTimeout(() => {
            right(r);
          }, to);
          return () => {
            clearTimeout(id);
          };
        });
      }

      createAsk(100, 5)
      .concat(createAsk(50, 3))
      .run(noop, right => {
        assert.equal(right, 3);
        done();
      });
    });

    it('run returns a function that can cancel both', (done) => {
      let cancelCalled = 0;
      function createAsk(to, r) {
        return new Ask((left, right) => {
          const id = setTimeout(() => {
            right(r);
          }, to);
          return () => {
            cancelCalled++;
            clearTimeout(id);
          };
        });
      }

      const cancelBoth = createAsk(100, 5)
      .concat(createAsk(50, 3))
      .run(noop, () => {
        assert.fail('message called');
      });

      cancelBoth();

      setTimeout(() => {
        assert.equal(cancelCalled, 2);
        done();
      }, 150);
    });

    it('is exposed as a static function', (done) => {
      function createAsk(to, r) {
        return new Ask((left, right) => {
          const id = setTimeout(() => {
            right(r);
          }, to);
          return () => {
            clearTimeout(id);
          };
        });
      }

      Ask
      .concat(createAsk(50, 3), createAsk(100, 5))
      .run(noop, right => {
        assert.equal(right, 3);
        done();
      });
    });
  });

  describe('memoize', () => {
    it('run returns the original value and does not re-run computation', (done) => {
      let called = 0;
      const askMe = new Ask((left, right) => {
        right(1);
        called++;
      });

      const askMeMemo = askMe.memoize();

      askMeMemo.run(noop, right => {
        assert.equal(right, 1);
      });

      let secondCall = false;

      setTimeout(() => {
        askMeMemo.run(noop, right => {
          secondCall = true;
          assert.equal(called, 1);
          assert.equal(right, 1);
          done();
        });
        // make sure the second run is also always async
        assert.ok(!secondCall);
      }, 100);
    });

    it('notifies each run observer if the computation has not completed', (done) => {
      let called = 0;
      let runCalled = 0;
      const askMe = new Ask((left, right) => {
        setTimeout(() => {
          right(1);
        }, 100);
        called++;
      });

      const askMeMemo = askMe.memoize();

      askMeMemo.run(noop, right => {
        assert.equal(right, 1);
        runCalled++;
      });

      askMeMemo.run(noop, right => {
        assert.equal(right, 1);
        assert.equal(runCalled, 1);
        assert.equal(called, 1);
        done();
      });
    });

    it('is exposed as a static function', (done) => {
      let called = 0;
      const askMe = new Ask((left, right) => {
        right(1);
        called++;
      });

      const askMeMemo = Ask.memoize(askMe);

      askMeMemo.run(noop, right => {
        assert.equal(right, 1);
      });

      let secondCall = false;

      setTimeout(() => {
        askMeMemo.run(noop, right => {
          secondCall = true;
          assert.equal(called, 1);
          assert.equal(right, 1);
          done();
        });
        // make sure the second run is also always async
        assert.ok(!secondCall);
      }, 100);
    });
  });

  describe('all', () => {
    it('does not notify until all Asks are completed', (done) => {
      let count = 0;
      function createAsk(to) {
        const order = ++count;
        return new Ask((left, right) => {
          setTimeout(() => {
            right(order);
          }, to);
        });
      }

      Ask.all([
        createAsk(100),
        createAsk(500),
        createAsk(0),
      ]).run(noop, right => {
        assert.equal(count, 3);
        assert.deepEqual(right, [3, 1, 2]);
        done();
      });
    });

    it('sends the first left and cancels other asks if a left occurs', (done) => {
      function createAsk(to, l) {
        return new Ask((left) => {
          const id = setTimeout(() => {
            if (!l) {
              assert.fail('Should have been canceled');
            } else {
              left(l);
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
        createAsk(0, 'boom'),
      ]).run(
        left => {
          assert.equal(left, 'boom');
          done();
        },
        () => {
          assert.fail('right was called');
        }
      );
    });

    it('wont throw even if proper cancel functions not returned', (done) => {
      function createAsk(to, l) {
        return new Ask((left, right) => {
          setTimeout(() => {
            if (!l) {
              right('uh oh');
            } else {
              left(l);
            }
          }, to);
        });
      }

      let callCount = 0;

      Ask.all([
        createAsk(100, 'boom'),
        createAsk(500),
        createAsk(0),
      ]).run(
        left => {
          callCount++;
          assert.equal(left, 'boom');
        },
        () => {
          callCount++;
        }
      );

      setTimeout(() => {
        assert.equal(callCount, 1);
        done();
      }, 600);
    });
  });
});

