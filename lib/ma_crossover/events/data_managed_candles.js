'use strict'

const _isFinite = require('lodash/isFinite')
const _reverse = require('lodash/reverse')

/**
 * If the instance has internal indicators, they are either seeded with the
 * initial candle dataset or updated with new candles as they arrive. The
 * candle dataset is saved on the instance state for order generation.
 *
 * Indicator values are calculated, and if they have crossed the configured
 * atomic order is submitted, and the `'exec:stop`' event is emitted to
 * stop execution and trigger teardown.
 *
 * @memberOf module:MACrossover
 * @listens AOHost~dataManagedCandles
 * @param {AOInstance} instance - AO instance
 * @param {object[]} candles - incoming candles
 * @param {EventMetaInformation} meta - source channel information
 * @returns {Promise} p - resolves on completion
 */
const onDataManagedCandles = async (instance = {}, candles, meta) => {
  const { state = {}, h = {} } = instance
  const { args = {}, longIndicator, shortIndicator } = state
  const { symbol, long, short } = args
  const { debug, updateState, emitSelf, emit } = h
  const { chanFilter } = meta
  const { key } = chanFilter
  const chanDetails = key.split(':')
  const chanTF = chanDetails[1]
  const chanSymbol = chanDetails[2]

  if (symbol !== chanSymbol) {
    return
  }

  let indicatorsUpdated = false
  const [lastCandle] = candles

  if (chanTF === long.candleTimeFrame) {
    indicatorsUpdated = true

    if (longIndicator.l() === 0) {
      debug('seeding long indicator with %d candle prices', candles.length)
      const orderedCandles = _reverse(candles)

      orderedCandles.forEach((candle) => {
        longIndicator.add(candle[long.candlePrice])
      })
    } else {
      const price = lastCandle[long.candlePrice]
      debug('updating long indicator with candle price %f [%j]', price, lastCandle)

      if (!state.lastCandleLong) {
        longIndicator.add(price)
      } else if (state.lastCandleLong.mts === lastCandle.mts) {
        longIndicator.update(price)
      } else {
        longIndicator.add(price)
      }
    }

    await updateState(instance, { lastCandleLong: lastCandle })
  }

  if (chanTF === short.candleTimeFrame) {
    indicatorsUpdated = true

    if (shortIndicator.l() === 0) {
      debug('seeding short indicator with %d candle prices', candles.length)
      const orderedCandles = _reverse(candles)

      orderedCandles.forEach((candle) => {
        shortIndicator.add(candle[short.candlePrice])
      })
    } else {
      const price = lastCandle[short.candlePrice]
      debug('updating short indicator with candle price %f [%j]', price, lastCandle)

      if (!state.lastCandleShort) {
        shortIndicator.add(price)
      } else if (state.lastCandleShort.mts === lastCandle.mts) {
        shortIndicator.update(price)
      } else {
        shortIndicator.add(price)
      }
    }

    await updateState(instance, { lastCandleShort: lastCandle })
  }

  if (indicatorsUpdated) {
    const longV = longIndicator.v()
    const shortV = shortIndicator.v()

    if (_isFinite(shortV) && _isFinite(longV) && (
      shortIndicator.crossed(longV)
    )) {
      await emitSelf('submit_order')
      await emit('exec:stop')
    }
  }
}

module.exports = onDataManagedCandles
