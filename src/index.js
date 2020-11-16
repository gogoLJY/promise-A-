import { STATUS } from './constants'
import { isFunction, isObject } from './utils'

function resolvePromise(bridgePromise, x, resolve, reject) {
  // 防止 循环引用
  if (bridgePromise === x) {
    reject(new TypeError('Chaining cycle detected for promise'))
  }

  let called

  if (x !== null && (isObject(x) || isFunction(x))) {
    try {
      // 取 then 有可能出现异常
      // 如 Object.defineProperty 定义了 get 属性的 then 抛错

      let then = x.then

      if (isFunction(then)) {
        then.call(x,
          value => {
            // 防止 代码被多次调用
            if (called) {
              return
            }
            called = true
            // value 可能为 promise，则直到是普通值为止
            resolvePromise(bridgePromise, value, resolve, reject)
          },
          reason => {
            if (called) {
              return
            }
            called = true

            reject(reason)
          }
        )
      } else {
        reject(x)
      }
    } catch (error) {
      if (called) {
        return
      }
      called = true
      
      reject(error)
    }
  } else {
    resolve(x)
  }
}

class Promise {
  constructor(executor) {
    // 状态
    this._state = STATUS.PENDING
    // 成功的值
    this._value = undefined
    // 失败的原因
    this._reason = undefined
    // 成功态时的回调数组
    this._onFulfilledQueue = []
    // 失败态时的回调数组
    this._onRejectedQueue = []

    let resolve = (value) => {
      // 防止调用多次 resolve || reject
      // 多次调用，第一次有效 并 更改状态
      if (this._state === STATUS.PENDING) {
        this._state = STATUS.FULFILLED
        this._value = value

        this._onFulfilledQueue.forEach(cb => cb())
      }
    }

    let reject = (reason) => {
      if (this._state === STATUS.PENDING) {
        this._state = STATUS.REJECTED
        this._reason = reason

        this._onRejectedQueue.forEach(cb => cb())
      }
    }
    // 预防执行回调时 抛错
    try {
      executor(resolve, reject)
    } catch (error) {
      reject(error)
    }
  }

  then(onFulfilled, onRejected) {
    // onFulfilled/onRejected 非函数或者不传 则忽略，直接返回 value
    onFulfilled = isFunction(onFulfilled) ? onFulfilled : value => value
    onRejected = isFunction(onRejected) ? onRejected : reason => { throw reason }

    let bridgePromise = new Promise((resolve, reject) => {
      if (this._state === STATUS.FULFILLED) {

        // resolvePromise 处理 then 回调的返回值 x 和 bridgePromise 的关系

        // 需要 new Promise 支持链式调用
        // 为什么不用 this，一个 promise 状态一旦改变就不可逆

        // setTimeout可以使 bridgePromise 能拿到返回值 且 A+ 也规定 onFulfilled/onRejected 必须异步执行

        setTimeout(() => {
          // 当执行 回调的时候，可能会出现异常
          try {
            let x = onFulfilled(this._value)
            resolvePromise(bridgePromise, x, resolve, reject)
          } catch (error) {
            reject(error)
          }
        });
      }

      if (this._state === STATUS.REJECTED) {
        setTimeout(() => {
          try {
            let x = onRejected(this._reason)
            resolvePromise(bridgePromise, x, resolve, reject)
          } catch (error) {
            reject(error)
          }
        });
      }

      // 当是异步调用 resolve/reject 时，且多次调用，如 p.then().then().then(res => console.log(res))
      if (this._state === STATUS.PENDING) {
        this._onFulfilledQueue.push(() => {
          setTimeout(() => {
            try {
              let x = onFulfilled(this._value)
              resolvePromise(bridgePromise, x, resolve, reject)
            } catch (error) {
              reject(error)
            }
          });
        })

        this._onRejectedQueue.push(() => {
          setTimeout(() => {
            try {
              let x = onRejected(this._reason)
              resolvePromise(bridgePromise, x, resolve, reject)
            } catch (error) {
              reject(error)
            }
          });
        })
      }
    })

    return bridgePormise
  }
  catch(onRejected) {
    return this.then(undefined, onRejected)
  }

  static resolve(value) {
    return new Promise((resolve, reject) => {
      if (value instanceof Promise) {
        value.then(resolve, reject)
      } else {
        resolve(value)
      }
    })
  }

  static reject(reason) {
    return new Promise((resolve, reject)=>{
      reject(reason)
    });
  }

  static all(iterator) {
    return new Promise((resolve, reject) => {
      if (!Array.isArray(iterator)) {
        return reject(new TypeError('Promise.all accepts an iterator'))
      }

      let args = Array.prototype.slice.call(arr);
      let result = []
      let len = args.length;
      let remaining = 0

      if (len === 0) {
        resolve(result)
      }

      const processData = (i, data) => {
        if (data && (isObject(data) || isFunction(data))) {
          let then = data.then

          if (isFunction(then)) {
            then.call(
              data,
              value => {
                processData(i, value);
              },
              (reason) => {
                reject(reason)
              }
            );
            return;
          }
        }

        result[i] = data;

        if (++remaining === len) {
          resolve(result);
        }
      }

      for(let i = 0; i < len; i++) {
        processData(i, args[i])
      }
    })
  }

  static race(promises) {
    return new Promise((resolve, reject) => {
      if (!Array.isArray(promises)) {
        return reject(new TypeError('Promise.race accepts an array'))
      }
      // 预防 元素不是 promise，需要 resolve 包装一层
      for(let i = 0; i < promises.length; i++) {
        Promise.resolve(promises[i]).then(resolve, reject);
      }
    })
  }

  static allSettled(iterator) {
    return new Promise((resolve, reject) => {
      if (!Array.isArray(iterator)) {
        return reject(new TypeError('Promise.all accepts an iterator'))
      }

      let args = Array.prototype.slice.call(iterator)
      let len = remaining = args.length
      let result = []

      if (len === 0) {
        resolve(result)
      }

      const processData = (i, data) => {
        try {
          if (data && (isObject(data) || isFunction(data))) {
            let then = data.then

            if (isFunction(then)) {
              then.call(data,
                value => {
                  processData(i, value)
                },
                reason => {
                  result[i]= { status: 'rejected', reason };
                  if (++remaining === len) {
                    resolve(result)
                  }
                }
              )
            }
          }
        } catch (reason) {
          
        }

        result[i] = { status: 'fulfilled', value: data };
        if (++remaining === len) {
          resolve(args);
        }
      }

      for(let i = 0; i < len; i++) {
        processData(i, data)
      }
    })
  }
}

export default Promise