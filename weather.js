/*global require,console,setInterval */
Error.stackTraceLimit = Infinity;

// read the World Weather Online API key.
var fs = require("fs");
var key = fs.readFileSync("worldweatheronline.key");

var cities = [ 'London'/*,'Paris','New York','Moscow','Ho chi min','Benjing','Reykjavik' ,'Nouakchott','Ushuaia' ,'Longyearbyen'*/];

function getCityWeather(city,callback) {
    var api_url="http://api.worldweatheronline.com/free/v2/weather.ashx?q="+city+"+&format=json&key="+ key;
    var options = {
        url: api_url,
        "content-type": "application-json",
        json: ""
    };
    var request = require("request");
    request(options, function (error, response, body) {
      if (!error && response.statusCode === 200) {
        var data  = perform_read(city,body);
        callback(null,data);
      } else {
        callback(error);
      }
    });
}

var city_data_map = { };

// a infinite round-robin iterator over the city array
var next_city = function(arr) {
   var counter = arr.length;
   return function() {
      counter += 1;
      if (counter>=arr.length) {
        counter = 0;
      }
      return arr[counter];
   };
}(cities);

function update_city_data(city) {
    getCityWeather(city,function(err,data) {
         if (!err) {
            city_data_map[city] = data;
            console.log(city,JSON.stringify(data, null," "));
         }  else {
            console.log("error city",city , err);
         }
     });
}

function perform_read(city,body) {
    var obj = JSON.parse(body);
    var current_condition = obj.data.current_condition[0];
    var request = obj.data.request[0];
    return  {
        city:               request.query,
        date:               new Date(),
        observation_time:   current_condition.observation_time,
        temperature:        parseFloat(current_condition.temp_C),
        humidity:           parseFloat(current_condition.humidity),
        pressure:           parseFloat(current_condition.pressure),
        weather:            current_condition.weatherDesc.value
    };
}

// make a API call every 10 seconds
var interval = 120 * 1000;
setInterval(function() {
     var city = next_city();
     update_city_data(city);
}, interval);

//_"making a round robin read"

var opcua = require("node-opcua");

var server = new opcua.OPCUAServer({
   port: 4334 // the port of the listening socket of the server
});

server.buildInfo.productName = "WeatherStation";
server.buildInfo.buildNumber = "7658";
server.buildInfo.buildDate = new Date(2014,5,2);

function post_initialize() {
    console.log("initialized");
    function construct_my_address_space(server) {

      var addressSpace = server.engine.addressSpace;

      function create_CityNode(city_name) {
         // declare the city node
         var cityObject = addressSpace.addObject({
               organizedBy: citiesObject,
               browseName: city_name
           });
         addressSpace.addVariable({
           componentOf: cityObject,
           browseName: "Temperature",
           dataType: "Double",
           value: {  get: function () { return extract_value(city_name,"temperature"); } }
        });
        addressSpace.addVariable({
           componentOf: cityObject,
           browseName: "Humidity",
           dataType: "Double",
           value: {  get: function () { return extract_value(city_name,"humidity"); } }
        });
        addressSpace.addVariable({
           componentOf: cityObject,
           browseName: "Pressure",
           dataType: "Double",
           value: {  get: function () { return extract_value(city_name,"pressure"); } }
        });
      }

      function extract_value(city_name,property) {
          var city = city_data_map[city_name];
          if (!city) {
              return opcua.StatusCodes.BadDataUnavailable;
          }
          var value = city[property];
          return new opcua.Variant({dataType: opcua.DataType.Double, value: value });
      }

      // declare some folders
      var citiesObject = addressSpace.addObject({
            organizedBy: addressSpace.rootFolder.objects,
            browseName: "Cities"
        });

      cities.forEach(function(city) {
        create_CityNode(city);
      });
    }

    construct_my_address_space(server);

    server.start(function() {
        console.log("Server is now listening ... ( press CTRL+C to stop)");
        console.log("port ", server.endpoints[0].port);
        var endpointUrl = server.endpoints[0].endpointDescriptions()[0].endpointUrl;
        console.log(" the primary server endpoint url is ", endpointUrl );
    });
}
server.initialize(post_initialize);
