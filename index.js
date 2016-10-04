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
    parser = new xml2js.Parser({
        explicitArray: false,
        normalize: false,
        normalizeTags: true,
        trim: true
    }),
    inspector = require('eyes').inspector({ maxLength: false }),
    client = redis.createClient(),
    // schema = require('./schema'),
    options = {
        key: fs.readFileSync(__dirname + '/server.key'),
        cert: fs.readFileSync(__dirname + '/server.crt')
    }
    // moment.locale('id')

function getWeatherData() {
    return axios.get('http://data.bmkg.go.id/propinsi_00_1.xml')
}

function modifyData(response) {
    const tglAttr = ['mulai', 'sampai']
    var tanggal = response.cuaca.tanggal

    for (var obj in tanggal) {
        tanggal[obj] = moment(tanggal[obj] + ' ' + tanggal[obj + 'pukul'], 'DD MMMM YYYY hh.mm').format('dddd, D MMMM YYYY hh:mm').toString()
        delete tanggal[obj + 'pukul']
    }

    const intAttrs = ['kelembapanmin', 'kelembapanmax', 'suhumax', 'suhumin', 'idkota', 'kecepatanangin'],
        replaceIntAttrs = ['kelembapan_min', 'kelembapan_max', 'suhu_max', 'suhu_min', 'id_kota', 'kecepatan_angin'],
        floatAttrs = ['lintang', 'bujur'],
        deletedAttrs = ['point', '_symbol', 'propinsi', 'arahangin']
    response.cuaca.peringatan = (response.cuaca.isi.peringatan == '-') ? null : response.cuaca.isi.peringatan
    response.cuaca.isi = response.cuaca.isi.row.map(function(row) {
        for (var obj in row) {
            if (intAttrs.indexOf(obj) !== -1) {
                // inspector(obj)
                row[replaceIntAttrs[intAttrs.indexOf(obj)]] = parseInt(row[obj])
                delete row[obj]
            } else if (floatAttrs.indexOf(obj) !== -1) {
                row[obj] = parseFloat(row[obj])
            } else if (deletedAttrs.indexOf(obj) !== -1) {
                if (obj == 'arahangin') row.arah_angin = (row.arahangin == "-") ? null : row.arahangin
                delete row[obj]
            } else if (row.cuaca == '-') row.cuaca = null
        }
        row.balai = row.balai.replace('_', ' ')
        return row
    })
    return response
}

app = express()

app.use(responseTime())

app.get('*', (req, res) => {
    client.get('weather', (err, result) => {
         if (result && compareDate(result)) {
            res.json(JSON.parse(result))
        } else { 
			getDataAsync(res)
        }
    })
})

function compareDate(result) {
	var result = JSON.parse(result),
	savedDate = moment(result.data.tanggal.mulai, 'dddd, D MMMM YYYY hh:mm').format('dddd, D MMMM YYYY'),
	currentDate = moment().format('dddd, D MMMM YYYY')
	return savedDate == currentDate
}

function getDataAsync(res) {
	getWeatherData()
	.then(response => {
        var data = { data: {} }
        parser.parseString(response.data, (err, result) => {
			console.log(err)
            // inspector(result)
            modifyData(result)
            data.data = result.cuaca
                        // inspector(data.data.isi.length)
        })
        client.set('weather', JSON.stringify(data), (err, value) => console.log(value))
        res.json(data)
    }).catch(err => {
        console.log(err)
        if (err.status === 404) res.send('website http://data.bmkg.go.id/propinsi_00_1.xml was not found')
		else res.send(err)
    })
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
