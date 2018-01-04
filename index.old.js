const port = 3000,
    spdy = require('spdy'),
    express = require('express'),
    path = require('path'),
    fs = require('fs'),
    responseTime = require('response-time'),
    redis = require('redis'),
    axios = require('axios'),
    xml2js = require('xml2js'),
    moment = require('moment'),
    bluebird = require('bluebird'),

    parser = new xml2js.Parser({
        explicitArray: false,
        normalize: false,
        normalizeTags: true,
        trim: true,
        async: true
    }),
    inspector = require('eyes').inspector({ maxLength: false }),
    client = redis.createClient(),
    // schema = require('./schema'),
    options = {
        key: fs.readFileSync(__dirname + '/server.key'),
        cert: fs.readFileSync(__dirname + '/server.crt')
    }

bluebird.promisifyAll(redis.RedisClient.prototype)
bluebird.promisifyAll(redis.Multi.prototype)

async function getWeatherData() {
    return await axios.get('http://data.bmkg.go.id/propinsi_00_1.xml')
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
            }else if (entry.cuaca === '-') newEntry = { ...newEntry, cuaca: null }
        }
        return { ...newEntry, balai: entry.balai.replace('_', ' ') }
    })
    return { data: { tanggal, isi } }
}

app = express()

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
        parser.parseString(weatherResult.data, (err, {cuaca}) => {
            let finalResult = modifyResult(cuaca)
            let savedResult = client.setAsync('weather', JSON.stringify(finalResult))
            res.json(finalResult)
        })
    } catch (error) {
        console.log(error)
        if (err.status === 404) res.send('website http://data.bmkg.go.id/propinsi_00_1.xml was not found')
        else res.send(error)
    }
}

spdy.createServer(options, app)
    .listen(port, (error) => {
        if (error) {
            console.error(error)
            return process.exit(1)
        } else {
            console.log('Listening on port: ' + port + '.')
        }
    })
