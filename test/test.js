'use strict';
var express = require('express'),
settings = require('./settings.json'),
oracle_json=require('../lib')(settings);

var app = express();
app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
app.use(express.logger("default"));


var priceCall={procedure:"pkg_any.GetPrice",query:true,output:true};
app.get('/pricecall',oracle_json.execute(priceCall));

app.listen(settings.port);
console.log("settings:"+JSON.stringify(settings));

