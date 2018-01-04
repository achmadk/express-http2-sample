import { createServer } from 'spdy'
import express from 'express'
import { readFileSync } from 'fs'
import responseTime from 'response-time'
import { createClient, RedisClient, Multi } from 'redis'
import { get } from 'axios'
import moment from 'moment'
import { promisifyAll } from 'bluebird'
import { inspector } from 'eyes'

import { parseStringAsync } from './utils/parse-string-async'

const port = 3000

const inspect = inspector({ maxLength: false })

const client = createClient()

const options = {
  key: readFileSync(`${__dirname}/server.key`),
  cert: readFileSync(`${__dirname}/server.crt`)
}

promisifyAll(RedisClient.prototype)
promisifyAll(Multi.prototype)

async function getWeatherData() {
  return await get('http://data.bmkg.go.id/propinsi_00_1.xml')
}

function modifyResult (cuaca) {
  const intAttrs = ['kelembapanmin', 'kelembapanmax', 'suhumax', 'suhumin', 'kecepatanangin'],
  replaceIntAttrs = ['kelembapan_min', 'kelembapan_max', 'suhu_max', 'suhu_min', 'kecepatan_angin'],
  floatAttrs = ['lintang', 'bujur'],
  deletedAttrs = ['point', '_symbol', 'propinsi', 'arahangin']

  let tanggal = {}
  for(let obj in cuaca.tanggal) {
    if (!obj.includes('pukul')) {
      let value = moment(`${cuaca.tanggal[obj]} ${cuaca.tanggal[`${obj}pukul`]}`, 'DD MMMM YYYY hh.mm')
        .format('dddd, D MMMM YYYY hh:mm')
        .toString()
      tanggal = { ...tanggal, [obj]: value }
    }
  }
  let isi = cuaca.isi.row.map(entry => {
    let newEntry = {}
    for (let obj in entry) {
      if (intAttrs.includes(obj)) {
        // inspector(obj)
        newEntry = { ...newEntry, [replaceIntAttrs[intAttrs.indexOf(obj)]]: parseInt(entry[obj]) || entry[obj] }
      } else if (floatAttrs.includes(obj)) {
        newEntry = { ...newEntry, [obj]: parseFloat(entry[obj]) || entry[obj] }
      } else if (obj === 'arahangin') {
        newEntry = { ...newEntry, arah_angin: (entry.arahangin === '-') ? null : entry.arahangin }
      } else if (obj === 'idkota') {
        newEntry = { ...newEntry, id_kota: entry.idkota.toString() }
      } else if (entry.cuaca === '-') newEntry = { ...newEntry, cuaca: null }
    }
    return { ...newEntry, balai: entry.balai.replace('_', ' ') }
  })
  return { data: { tanggal, isi } }
}

const app = express()

app.use(responseTime())

app.get('*', async (req, res) => {
  try {
    let result = await client.getAsync('weather')
    if (result && compareDate(result)) {
    // if (result) {
      res.json(JSON.parse(result))
    } else {
      getDataAsync(res)
    }
  } catch (error) {
    res.status(500).json(error)
  }
})

function compareDate(result) {
	let parsedResult = JSON.parse(result),
	savedDate = moment(parsedResult.data.tanggal.mulai, 'dddd, D MMMM YYYY hh:mm').format('dddd, D MMMM YYYY'),
	currentDate = moment().format('dddd, D MMMM YYYY')
	return savedDate == currentDate
}

async function getDataAsync(res) {
  try {
    let weatherResult = await getWeatherData()
    let { cuaca } = await parseStringAsync(weatherResult.data)
    let finalResult = modifyResult(cuaca)
    let savedResult = client.setAsync('weather', JSON.stringify(finalResult))
    res.json(finalResult)
  } catch (error) {
    console.log(error)
    if (err.status === 404) res.send('website http://data.bmkg.go.id/propinsi_00_1.xml was not found')
    else res.send(error)
  }
}

createServer(options, app)
  .listen(port, (error) => {
    if (error) {
      console.error(error)
      return process.exit(1)
    } else {
      console.log(`Listening on port: ${port}.`)
    }
  })
