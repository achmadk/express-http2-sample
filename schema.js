const graphql = require('graphql'),
    axios = require('axios'),
    xml2js = require('xml2js'),
    cuaca = {};

axios.get('http://data.bmkg.go.id/cuaca_jabodetabek_1.xml').then(response => {
        console.log(JSON.stringify(response))
        var parser = new xml2js.Parser();
        parser.parseString(response.data, (err, result) => cuaca = result)
    }).catch(err => {
    	console.log(err)
    })
    // console.log(cuaca);

module.exports = cuaca;
